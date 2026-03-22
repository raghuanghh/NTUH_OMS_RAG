import { ChatState } from './chatState';

export interface Env {
    CHAT_STATE: DurableObjectNamespace;
    ASSETS: Fetcher;
    // 移除了用不到的 Browser (Puppeteer) 設定，讓系統更輕量
}

// 建立專業的醫療風格基礎網頁
function createSourcePageHTML(title: string, content: string): string {
    return `
<!DOCTYPE html>
<html lang="zh-TW">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} | 臺大醫院口腔顎面外科</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'PingFang TC', 'Microsoft JhengHei', -apple-system, sans-serif;
            /* 改為專業的醫療藍色漸層背景 */
            background: linear-gradient(135deg, #e0f2fe 0%, #bae6fd 50%, #7dd3fc 100%);
            min-height: 100vh;
            color: #1e293b;
            line-height: 1.6;
        }
        
        .container {
            max-width: 800px;
            margin: 0 auto;
            padding: 40px 20px;
            background: rgba(255, 255, 255, 0.85);
            backdrop-filter: blur(10px);
            border-radius: 16px;
            margin-top: 40px;
            margin-bottom: 20px;
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.5);
        }
        
        .header {
            text-align: center;
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 2px solid #38bdf8;
        }
        
        .header h1 {
            font-size: 2.2rem;
            font-weight: 700;
            color: #0369a1;
            margin-bottom: 10px;
        }
        
        .back-link {
            display: inline-block;
            background: #0ea5e9;
            color: white;
            padding: 10px 20px;
            border-radius: 8px;
            text-decoration: none;
            font-weight: 500;
            margin-bottom: 20px;
            transition: all 0.2s ease;
        }
        
        .back-link:hover {
            background: #0284c7;
            transform: translateY(-2px);
        }
        
        .content {
            background: #ffffff;
            color: #334155;
            padding: 30px;
            border-radius: 12px;
            box-shadow: inset 0 2px 4px rgba(0,0,0,0.02);
            font-size: 1.1rem;
            line-height: 1.8;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <a href="/" class="back-link">← 返回 AI 助理對話</a>
            <h1>${title}</h1>
        </div>
        <div class="content">
            ${content}
        </div>
    </div>
</body>
</html>`;
}

export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        const url = new URL(request.url);

        // 處理靜態檔案 (網頁前端畫面)
        if (url.pathname === '/' || url.pathname.startsWith('/bundle.js')) {
            return env.ASSETS.fetch(request);
        }

        // 處理 AI 對話的核心 API
        if (url.pathname.startsWith('/chat/')) {
            const id = env.CHAT_STATE.idFromName('chat');
            const obj = env.CHAT_STATE.get(id);

            if (url.pathname === '/chat/init') {
                return new Response(JSON.stringify({ id: id.toString() }), {
                    headers: { 'Content-Type': 'application/json' },
                });
            }

            return obj.fetch(request);
        }

        return new Response('Not found', { status: 404 });
    },
} satisfies ExportedHandler<Env>;

export { ChatState };