// ============================================================
// src/index.ts — Cloudflare Worker 入口點
// 負責：
//   1. 靜態資源路由（前端 HTML/JS）
//   2. AI 對話 API 路由（轉發到 ChatState Durable Object）
//   3. 定義 Cloudflare 環境變數型別 (Env)
// ============================================================

import { ChatState } from './chatState';

// Cloudflare Workers 環境變數定義
// 若要新增 binding（如 KV、R2），在此處新增欄位並在 wrangler.jsonc 對應設定
export interface Env {
    CHAT_STATE: DurableObjectNamespace; // 對話狀態儲存（Durable Object）
    ASSETS: Fetcher;                     // 靜態資源（public/ 目錄下的前端檔案）
    // 移除了用不到的 Browser (Puppeteer) 設定，讓系統更輕量
}

// ──────────────────────────────────────────────
// 次要功能：知識來源展示頁面的 HTML 模板
// 用於顯示單一知識來源的詳細內容（目前未被主流程使用，保留供未來擴充）
// ──────────────────────────────────────────────
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

// ──────────────────────────────────────────────
// 主要 Worker 請求處理器
// 所有進來的 HTTP 請求都從這裡分流
// ──────────────────────────────────────────────
export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        const url = new URL(request.url);

        // 路由 1：靜態前端資源 (index.html、bundle.js)
        // → 直接從 Cloudflare Pages Assets 提供，不經過 Worker 邏輯
        if (url.pathname === '/' || url.pathname.startsWith('/bundle.js')) {
            return env.ASSETS.fetch(request);
        }

        // 路由 2：AI 對話 API（/chat/init、/chat/:id）
        // → 轉發到 ChatState Durable Object 處理
        // → Durable Object 保證同一個 'chat' 名稱永遠對到同一個實例（確保對話歷史一致）
        if (url.pathname.startsWith('/chat/')) {
            const id = env.CHAT_STATE.idFromName('chat');
            const obj = env.CHAT_STATE.get(id);

            // /chat/init：初始化並回傳 Durable Object 的唯一 ID 給前端
            if (url.pathname === '/chat/init') {
                return new Response(JSON.stringify({ id: id.toString() }), {
                    headers: { 'Content-Type': 'application/json' },
                });
            }

            // /chat/:id：GET（取得歷史）、POST（傳送新問題）、DELETE（清除歷史）
            return obj.fetch(request);
        }

        return new Response('Not found', { status: 404 });
    },
} satisfies ExportedHandler<Env>;

// 匯出 ChatState，讓 Cloudflare Workers 能夠識別並綁定 Durable Object
export { ChatState };
