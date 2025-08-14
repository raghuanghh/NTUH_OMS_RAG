interface ChatMessage {
    id: string;
    text: string;
    timestamp: number;
    isAI?: boolean;
  }
  
  interface ChatStateData {
    messages: ChatMessage[];
  }
  
  interface AIResponse {
    object: string;
    search_query: string;
    response: string;
    data: any[];
    has_more: boolean;
    next_page: null;
  }
  
  interface Env {
    AI: {
      autorag: (name: string) => {
        aiSearch: (params: { query: string }) => Promise<string | AIResponse>;
      };
      run: (model: string, params: { messages: Array<{ role: string; content: string }> }) => Promise<any>;
    };
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
      
      if (request.method === 'GET') {
        return new Response(JSON.stringify({ messages: this.messages }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }
  
      if (request.method === 'POST') {
        const body = await request.json() as { text: string };
        console.log('Received message:', body.text);
        
        const userMessage: ChatMessage = {
          id: crypto.randomUUID(),
          text: body.text,
          timestamp: Date.now(),
          isAI: false
        };
        this.messages.push(userMessage);
  
        try {
          // Get AI response
          console.log('Getting AI response...');
          const aiResponse = await this.env.AI.autorag("proud-thunder-70c9").aiSearch({
            query: body.text,
          });
          console.log('Raw AI response:', aiResponse);
          console.log('AI response type:', typeof aiResponse);
          console.log('AI response keys:', Object.keys(aiResponse as object));
          console.log('AI response structure:', JSON.stringify(aiResponse, null, 2));
  
          // Extract just the response text from the AI result
          const aiResult = aiResponse as AIResponse;
          let responseText: string;
  
          if (typeof aiResponse !== 'string' && aiResponse.data?.length === 0) {
  
              // No matching documents
              const messages = [
                  { role: "system", content: "You are a friendly assistant" },
                  {
                    role: "user",
                    content: body.text,
                  },
                ];
              const response = await this.env.AI.run("@cf/openai/gpt-oss-120b", { messages });
              responseText = response;
          }
          
          if (typeof aiResult === 'string') {
            responseText = aiResult;
          } else if (typeof aiResult?.response === 'string') {
            responseText = aiResult.response;
          } else if (aiResult?.response) {
            responseText = JSON.stringify(aiResult.response);
          } else {
            responseText = JSON.stringify(aiResult);
          }
  
          console.log('Final response text:', responseText);
  
          const aiMessage: ChatMessage = {
            id: crypto.randomUUID(),
            text: responseText,
            timestamp: Date.now(),
            isAI: true
          };
  
          this.messages.push(aiMessage);
          await this.state.storage.put('messages', this.messages);
          
          // Return only the new messages
          return new Response(JSON.stringify({ 
            messages: [userMessage, aiMessage]
          }), {
            headers: { 'Content-Type': 'application/json' },
          });
        } catch (error) {
          console.error('Error getting AI response:', error);
          // Return just the user message if AI fails
          return new Response(JSON.stringify({ messages: [userMessage] }), {
            headers: { 'Content-Type': 'application/json' },
          });
        }
      }
  
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