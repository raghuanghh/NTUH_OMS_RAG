interface ChatMessage {
  id: string;
  text: string;
  timestamp: number;
  isAI?: boolean;
}

interface Env {
  AI: any; // Cloudflare AI 模組
  VECTORIZE_INDEX: any; // 我們剛剛綁定的向量資料庫
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
        
        // 步驟 1：把使用者的問題轉換成數學向量 (使用與上傳時相同的模型)
        const queryVector = await this.env.AI.run('@cf/baai/bge-base-en-v1.5', {
            text: [body.text]
        });

        // 步驟 2：去資料庫尋找最相關的 5 個知識段落 (Top-K = 5)
        const vectorResults = await this.env.VECTORIZE_INDEX.query(queryVector.data[0], { 
            topK: 5, 
            returnMetadata: true 
        });

        // 把找出來的資料合併成一段長長的參考文字
        let context = "";
        if (vectorResults.matches && vectorResults.matches.length > 0) {
            context = vectorResults.matches.map((match: any) => match.metadata?.content).join("\n\n---\n\n");
        }

        // 步驟 3：建立嚴格的醫療防護網 (System Prompt)
        const systemPrompt = `
你是一位專業、嚴謹且具備同理心的「臺大醫院口腔顎面外科 AI 助理」。
請【嚴格】根據以下提供的參考資料來回答病患的問題。
【語言規定】：無論使用者用任何語言提問，你【必須】主要使用繁體中文（台灣習慣用語）回答。
- 醫學英文專有名詞（如手術名稱、藥品名稱、診斷術語等）可以保留英文，但【必須】在後面加上中文說明，例如：「Osteotomy（截骨手術）」、「Implant（人工植牙）」。
- 回答的主體語言必須是繁體中文，不可以用英文為主要回答語言。
- 以病患能夠理解的白話文為優先，避免過多艱深術語。

【安全守則】：
1. 如果參考資料中有答案，請清楚、白話地向病患解釋。
2. 如果參考資料中沒有提到，或者你無法確定，請直接回答：「抱歉，目前的參考資料中沒有相關資訊。為確保您的醫療安全，請務必於門診時諮詢您的主治醫師。」
3. 絕對不可以自己捏造或假設任何醫療數據、手術風險、適應症或診斷結果。
4. 你的身分是助理，不能取代醫師的專業診斷。

【參考資料】：
${context}
`;

        // 步驟 4：呼叫大語言模型生成對話 (Temperature = 0 確保最嚴謹的回答)
        console.log('呼叫 LLM 生成回答...');
        const response = await this.env.AI.run('@cf/meta/llama-3-8b-instruct', {
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: body.text }
            ],
            temperature: 0, 
        });

        const responseText = response.response;
        console.log('AI 回覆完成');

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