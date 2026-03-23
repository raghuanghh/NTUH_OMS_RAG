interface ChatMessage {
  id: string;
  text: string;
  timestamp: number;
  isAI?: boolean;
}

interface Env {
  AI: any;
  VECTORIZE_INDEX: any;
  TAVILY_API_KEY: string; // wrangler secret put TAVILY_API_KEY
}

interface PubMedResult {
  pmid: string;
  title: string;
  authors: string;
  journal: string;
  pubdate: string;
  link: string;
}

interface TavilyResult {
  title: string;
  url: string;
  content: string;
}

// 本地知識庫相似度門檻：低於此值才啟動外部檢索
const LOCAL_SCORE_THRESHOLD = 0.55;

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

export class ChatState {
  private state: DurableObjectState;
  private messages: ChatMessage[];
  private env: Env;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    this.messages = [];
    this.state.blockConcurrencyWhile(async () => {
      const stored = await this.state.storage.get<ChatMessage[]>('messages');
      if (stored) {
        this.messages = stored;
      }
    });
  }

  async fetch(request: Request) {
    const url = new URL(request.url);
    
    // 取得歷史訊息
    if (request.method === 'GET') {
      return new Response(JSON.stringify({ messages: this.messages }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 接收使用者的新問題
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

        // 步驟 1：把使用者的問題轉換成向量
        const queryVector = await this.env.AI.run('@cf/baai/bge-base-en-v1.5', {
          text: [body.text],
        });

        // 步驟 2：查詢本地知識庫（臨床指引，最高優先）
        const vectorResults = await this.env.VECTORIZE_INDEX.query(queryVector.data[0], {
          topK: 5,
          returnMetadata: true,
        });

        const localMatches: any[] = vectorResults.matches ?? [];
        const bestLocalScore: number = localMatches[0]?.score ?? 0;
        console.log(`本地知識庫最高相似度分數: ${bestLocalScore.toFixed(3)}`);

        let localContext = '';
        if (localMatches.length > 0) {
          localContext = localMatches
            .map((m: any) => m.metadata?.content)
            .filter(Boolean)
            .join('\n\n---\n\n');
        }

        // 步驟 3：若本地知識庫不足，啟動外部檢索（最低優先級）
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

        // 步驟 4：建立 System Prompt（臨床指引優先，外部資料為輔）
        const systemPrompt = `
你是一位專業、嚴謹且具備同理心的「臺大醫院口腔顎面外科 AI 助理」。

【語言規定】
- 無論使用者用任何語言提問，你【必須】主要使用繁體中文（台灣習慣用語）回答。
- 醫學英文專有名詞可保留英文，但【必須】附上中文說明，例如：「Osteotomy（截骨手術）」。
- 以病患能理解的白話文為優先，避免過多艱深術語。

【資料優先順序】
1. 【最優先】「臨床指引參考資料」中的內容，這是本院審核過的醫療指引。
2. 【補充參考】若臨床指引不足，可參考「外部醫學資料」，但必須在回答中附上來源連結，並加註「（外部參考資料，僅供參考）」。

【格式規定】
- 回答需要列點時，每個項目請另起一行，並在開頭加上「1. 」「2. 」或「• 」符號。
- 段落之間空一行，讓內容更易閱讀。
- 不使用 Markdown 語法（不使用 **粗體** 或 #標題）。

【安全守則】
1. 有臨床指引資料時，優先以此為根據，清楚白話地向病患解釋。
2. 使用外部資料時，必須完整引用格式，例如：「根據 PubMed 文獻（來源：https://pubmed.ncbi.nlm.nih.gov/XXXXX/），…（外部參考資料，僅供參考）」。
3. 若兩者都無相關資訊，請回答：「抱歉，目前的參考資料中沒有相關資訊。為確保您的醫療安全，請務必於門診時諮詢您的主治醫師。」
4. 絕對不可捏造或假設任何醫療數據、手術風險、適應症或診斷結果。
5. 你的身分是助理，不能取代醫師的專業診斷。

【臨床指引參考資料（最高優先）】
${localContext || '（本次查詢無相符的本地臨床指引）'}
${externalSection ? `\n【外部醫學參考資料（補充，最低優先）】\n${externalSection}` : ''}
`;

        // 步驟 5：呼叫大語言模型生成回答
        console.log('呼叫 LLM 生成回答...');
        const response = await this.env.AI.run('@cf/qwen/qwen3-30b-a3b-fp8', {
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: body.text }
            ],
            temperature: 0,
            max_tokens: 1024,
        });

        // Qwen3 / 不同模型的 response 格式可能不同，依序嘗試各欄位
        console.log('AI response keys:', Object.keys(response ?? {}));
        const rawText =
          response?.response ??
          response?.choices?.[0]?.message?.content ??
          response?.result?.response ??
          response?.text ??
          null;

        if (!rawText || typeof rawText !== 'string') {
          console.error('Unexpected AI response format:', JSON.stringify(response).substring(0, 300));
        }

        const responseText: string =
          (rawText && typeof rawText === 'string' && rawText.trim())
            ? rawText.trim()
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