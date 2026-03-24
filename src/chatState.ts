// ============================================================
// src/chatState.ts — 核心 AI 邏輯（Cloudflare Durable Object）
// 負責：
//   1. 儲存每個 session 的對話歷史（持久化到 Durable Object Storage）
//   2. 本地知識庫向量檢索（Vectorize Index，臨床指引）
//   3. 外部補充檢索（PubMed、Tavily）—— 本地知識庫不足時才啟動
//   4. 呼叫 DeepSeek-R1 LLM 生成回答
//   5. 回傳結果給前端
// ============================================================

// 單則對話訊息的資料結構（存入 Durable Object Storage）
interface ChatMessage {
  id: string;
  text: string;
  timestamp: number;
  isAI?: boolean; // true = AI 回覆；false = 使用者問題
}

// Cloudflare Workers 環境變數（在 wrangler.jsonc 設定）
interface Env {
  AI: any;               // Cloudflare Workers AI（負責 embedding 和 LLM）
  VECTORIZE_INDEX: any;  // Cloudflare Vectorize（向量資料庫，存放臨床指引）
  TAVILY_API_KEY: string; // Tavily 搜尋 API 金鑰（設定方式：wrangler secret put TAVILY_API_KEY）
}

// PubMed 文獻搜尋結果的格式
interface PubMedResult {
  pmid: string;
  title: string;
  authors: string;
  journal: string;
  pubdate: string;
  link: string; // 直接連到 PubMed 文章頁面的連結
}

// Tavily 外部搜尋結果的格式
interface TavilyResult {
  title: string;
  url: string;
  content: string; // 截取前 400 字的摘要
}

// ──────────────────────────────────────────────
// 外部檢索觸發門檻
// 本地向量相似度分數低於此值時，才啟動 PubMed + Tavily 補充搜尋
// 調高此值 → 更容易觸發外部搜尋；調低 → 更依賴本地知識庫
// ──────────────────────────────────────────────
const LOCAL_SCORE_THRESHOLD = 0.55;

// ──────────────────────────────────────────────
// PubMed 文獻搜尋（NCBI E-utilities API，免費，不需 API 金鑰）
// 步驟：esearch 取得 PMID → esummary 取得標題/作者/期刊
// 最多回傳 3 筆（retmax=3），依相關度排序
// ──────────────────────────────────────────────
async function searchPubMed(query: string): Promise<PubMedResult[]> {
  try {
    const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmax=3&retmode=json&sort=relevance`;
    const searchResp = await fetch(searchUrl);
    if (!searchResp.ok) return [];

    const searchData: any = await searchResp.json();
    const ids: string[] = searchData.esearchresult?.idlist ?? [];
    if (ids.length === 0) return [];

    const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${ids.join(',')}&retmode=json`;
    const summaryResp = await fetch(summaryUrl);
    if (!summaryResp.ok) return [];

    const summaryData: any = await summaryResp.json();
    return ids
      .map((id: string) => {
        const doc = summaryData.result?.[id];
        if (!doc?.title) return null;
        // 最多顯示 3 位作者，之後用 et al.
        const authorList: string[] = (doc.authors ?? []).slice(0, 3).map((a: any) => a.name);
        return {
          pmid: id,
          title: doc.title,
          authors: authorList.join(', ') + (doc.authors?.length > 3 ? ' et al.' : ''),
          journal: doc.source ?? '',
          pubdate: doc.pubdate ?? '',
          link: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
        };
      })
      .filter(Boolean) as PubMedResult[];
  } catch (e) {
    console.error('PubMed 檢索失敗:', e);
    return [];
  }
}

// ──────────────────────────────────────────────
// Tavily 網路搜尋（限定在可信醫療網域）
// 需設定 TAVILY_API_KEY（wrangler secret put TAVILY_API_KEY）
// include_domains 白名單：只搜尋 PubMed、MedlinePlus、Cochrane、UpToDate 等可信來源
// 若要新增或移除可信網域，修改下方 include_domains 陣列
// ──────────────────────────────────────────────
async function searchTavily(query: string, apiKey: string): Promise<TavilyResult[]> {
  try {
    const resp = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: 'basic',
        max_results: 3,
        include_domains: [
          'pubmed.ncbi.nlm.nih.gov',
          'medlineplus.gov',
          'ncbi.nlm.nih.gov',
          'cochranelibrary.com',
          'uptodate.com',
          'nejm.org',
          'bmj.com',
          'thelancet.com',
        ],
      }),
    });
    if (!resp.ok) return [];
    const data: any = await resp.json();
    // 每筆摘要截取前 400 字，避免塞爆 Prompt
    return (data.results ?? []).map((r: any) => ({
      title: r.title ?? '',
      url: r.url ?? '',
      content: (r.content ?? '').substring(0, 400),
    }));
  } catch (e) {
    console.error('Tavily 檢索失敗:', e);
    return [];
  }
}

// ──────────────────────────────────────────────
// ChatState Durable Object
// Cloudflare Durable Object 讓每個對話 session 有獨立的持久化儲存空間
// 同一個 session 的所有請求都會路由到同一個實例，確保對話歷史一致
// ──────────────────────────────────────────────
export class ChatState {
  private state: DurableObjectState;
  private messages: ChatMessage[]; // 記憶體中的對話歷史快取
  private env: Env;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    this.messages = [];
    // 初始化時從 Durable Object Storage 載入歷史訊息（blockConcurrencyWhile 確保載入完成前不處理請求）
    this.state.blockConcurrencyWhile(async () => {
      const stored = await this.state.storage.get<ChatMessage[]>('messages');
      if (stored) {
        this.messages = stored;
      }
    });
  }

  async fetch(request: Request) {
    const url = new URL(request.url);
    
    // GET：回傳當前 session 的全部對話歷史（頁面載入時呼叫）
    if (request.method === 'GET') {
      return new Response(JSON.stringify({ messages: this.messages }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // POST：接收使用者問題，執行 RAG 流程，回傳 AI 回覆
    if (request.method === 'POST') {
      const body = await request.json() as { text: string };
      console.log('收到病患提問:', body.text);
      
      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        text: body.text,
        timestamp: Date.now(),
        isAI: false
      };
      this.messages.push(userMessage);

      try {
        console.log('啟動醫療 RAG 檢索流程...');

        // ── 步驟 1：呼叫 BGE Embedding 模型，將問題轉成向量 ──
        const queryVector = await this.env.AI.run('@cf/baai/bge-base-en-v1.5', {
          text: [body.text],
        });

        // ── 步驟 2：本地向量搜尋（臨床指引知識庫）──
        // 在 Vectorize 中找最相似的 5 筆臨床指引片段（topK=5）
        // 想加入更多知識庫內容 → 用 batch_process.py 上傳文件
        const vectorResults = await this.env.VECTORIZE_INDEX.query(queryVector.data[0], {
          topK: 5,
          returnMetadata: true,
        });

        const localMatches: any[] = vectorResults.matches ?? [];
        const bestLocalScore: number = localMatches[0]?.score ?? 0;
        console.log(`本地知識庫最高相似度分數: ${bestLocalScore.toFixed(3)}`);

        // 將所有符合的片段合併成一段文字，傳入 Prompt
        let localContext = '';
        if (localMatches.length > 0) {
          localContext = localMatches
            .map((m: any) => m.metadata?.content)
            .filter(Boolean)
            .join('\n\n---\n\n');
        }

        // ── 步驟 3：外部補充搜尋（本地不足時才觸發）──
        // 僅在本地相似度低於 LOCAL_SCORE_THRESHOLD 時啟動
        // PubMed 和 Tavily 並行搜尋（Promise.all）以節省時間
        let externalSection = '';
        const needsExternalSearch = bestLocalScore < LOCAL_SCORE_THRESHOLD;

        if (needsExternalSearch) {
          console.log('本地知識庫不足，啟動外部醫學檢索（PubMed + Tavily）...');
          const [pubmedResults, tavilyResults] = await Promise.all([
            searchPubMed(body.text),
            this.env.TAVILY_API_KEY ? searchTavily(body.text, this.env.TAVILY_API_KEY) : Promise.resolve([]),
          ]);

          const pubmedSection = pubmedResults.length > 0
            ? '【PubMed 文獻】\n' + pubmedResults.map(r =>
                `• ${r.title}\n  作者：${r.authors}｜期刊：${r.journal}（${r.pubdate}）\n  來源連結：${r.link}`
              ).join('\n\n')
            : '';

          const tavilySection = tavilyResults.length > 0
            ? '【外部醫學資料庫】\n' + tavilyResults.map(r =>
                `• ${r.title}\n  摘要：${r.content}\n  來源連結：${r.url}`
              ).join('\n\n')
            : '';

          if (pubmedSection || tavilySection) {
            externalSection = [pubmedSection, tavilySection].filter(Boolean).join('\n\n');
            console.log(`外部檢索完成：PubMed ${pubmedResults.length} 筆，Tavily ${tavilyResults.length} 筆`);
          }
        }

        // ── 步驟 4：建構 System Prompt ──
        // 想修改 AI 的回答風格、語氣、格式規定？在這個 systemPrompt 字串中修改
        // 臨床指引內容（localContext）與外部資料（externalSection）會自動帶入
        // 本地知識庫統一標注為「臨床指引參考資料」
        const localSourceNote = localMatches.length > 0 ? '（參考資料：臨床指引參考資料）' : '';

        const systemPrompt = `
你是臺大醫院口腔顎面外科的 AI 衛教助理，專門協助病患了解手術前後的注意事項與相關醫療資訊。

【語言規定】
- 自動偵測病患使用的語言，並全程以相同語言回應（如病患用繁體中文問，就用繁體中文；用英文問，就用英文；用日文問，就用日文）。
- 預設語言為繁體中文（台灣用語）。
- 【絕對禁止】在回應中夾雜其他語言的單字（例如不可說「tongue（舌頭）」，應直接說「舌頭」）。
- 醫學專有名詞需同時提供中文與英文，格式為「中文名稱（英文）」，例如「截骨手術（Osteotomy）」。
- 使用白話文，讓病患能輕鬆理解，避免過度艱深的醫學術語。

【對象與語氣】
- 對方是病患或其家屬，請全程使用「您」稱呼，語氣溫和、有耐心、具同理心。
- 主動表達關心，例如：「您好，關於您提到的問題…」、「請您放心，這是正常的術後反應。」
- 避免冰冷、機械式的語氣。

【輸入處理】
- 若病患輸入的內容無法辨識（如亂碼、符號、隨機字元、無意義文字），請溫和回應：「您好，我沒有辦法理解您輸入的內容，能請您重新描述您想詢問的問題嗎？例如：拔牙後要注意什麼？」
- 若問題與口腔顎面外科無關，請禮貌說明本系統的服務範圍，並建議轉介適當科別。

【資料優先順序】
1. 【最優先】「臨床指引參考資料」中的內容，這是本院審核過的醫療指引。
2. 【補充參考】若臨床指引不足，可參考「外部醫學資料」，但必須附上來源連結，並加註「（外部參考資料，僅供參考）」。

【格式規定】
- 回答需要列點時，每個項目請另起一行，並在開頭加上「1. 」「2. 」或「• 」符號。
- 段落之間空一行，讓內容更易閱讀。
- 不使用 Markdown 語法（不使用 **粗體** 或 #標題）。
- 引用本地臨床指引時，在該段落末尾加上 ${localSourceNote || '（參考資料：臨床指引參考資料）'}。
- 引用外部資料時，標注「（參考資料：來源網址）（外部參考資料，僅供參考）」。

【安全守則】
1. 有臨床指引資料時，優先以此為根據，清楚白話地向病患解釋，並標注參考來源。
2. 使用外部資料時，必須完整引用格式，例如：「根據 PubMed 文獻（參考資料：https://pubmed.ncbi.nlm.nih.gov/XXXXX/）（外部參考資料，僅供參考）」。
3. 若兩者都無相關資訊，請回答：「抱歉，目前的參考資料中沒有相關資訊。為確保您的醫療安全，請務必於門診時諮詢您的主治醫師。」
4. 絕對不可捏造或假設任何醫療數據、手術風險、適應症或診斷結果。
5. 您的身分是助理，不能取代醫師的專業診斷。

【臨床指引參考資料（最高優先）】
${localContext || '（本次查詢無相符的本地臨床指引）'}
${externalSection ? `\n【外部醫學參考資料（補充，最低優先）】\n${externalSection}` : ''}
`;

        // ── 步驟 5：呼叫 LLM 生成最終回答 ──
        // 使用 Llama 3.3 70B（Meta）：Cloudflare 原生支援，格式穩定，中文夠好
        // temperature=0.3：在穩定性與自然語氣之間取得平衡
        // max_tokens=2048：足以容納完整的衛教回答
        console.log('呼叫 LLM 生成回答...');
        // 使用 Llama 3.3 70B — Meta 官方大模型，Cloudflare 原生支援，格式穩定，中文夠好
        // 回應格式：{ response: string }（標準 Cloudflare Workers AI 格式）
        const response = await this.env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: body.text }
            ],
            temperature: 0.3,
            max_tokens: 2048,
        });

        console.log('AI response type:', typeof response, 'keys:', response ? Object.keys(response) : 'null');
        // Llama 系列標準回應格式為 { response: string }
        const rawText: string | null =
          (typeof response === 'string' ? response : null) ??
          (response?.response ?? null);

        // 移除 <think>...</think> 區塊（推理模型的內部思考過程，不顯示給使用者）
        const cleanedText = rawText
          ? rawText.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
          : null;

        const responseText: string =
          (cleanedText && cleanedText.length > 0)
            ? cleanedText
            : '抱歉，AI 回應格式異常，請稍後再試。';

        const aiMessage: ChatMessage = {
          id: crypto.randomUUID(),
          text: responseText,
          timestamp: Date.now(),
          isAI: true
        };

        this.messages.push(aiMessage);
        await this.state.storage.put('messages', this.messages);
        
        // 回傳最新的對話紀錄給網頁
        return new Response(JSON.stringify({ 
          messages: [userMessage, aiMessage]
        }), {
          headers: { 'Content-Type': 'application/json' },
        });

      } catch (error) {
        console.error('AI 處理發生錯誤:', error);
        
        const errorMessage: ChatMessage = {
          id: crypto.randomUUID(),
          text: "系統目前忙線中或發生錯誤，請稍後再試，或直接聯繫診間。",
          timestamp: Date.now(),
          isAI: true
        };
        
        return new Response(JSON.stringify({ messages: [userMessage, errorMessage] }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    // 清除歷史紀錄
    if (request.method === 'DELETE') {
      this.messages = [];
      await this.state.storage.delete('messages');
      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response('Method not allowed', { status: 405 });
  }
}
