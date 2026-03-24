# 🦷 NTUH_OMS_RAG — 臺大醫院口腔顎面外科 AI 衛教助理

> 部署於 Cloudflare Workers 的醫療 RAG 問答系統，結合本地臨床知識庫與外部醫學文獻，以繁體中文回答病患衛教問題。

🌐 **線上體驗**：[https://ntuh-oms-rag.raghuanghh.workers.dev](https://ntuh-oms-rag.raghuanghh.workers.dev)

---

## 📖 系統簡介

本系統是專為臺大醫院口腔顎面外科設計的 AI 衛教查詢助理，病患可輸入手術名稱、術後問題或相關症狀，系統會根據本地臨床指引優先、外部文獻補充的原則，以白話繁體中文生成回答。

> ⚠️ 本系統僅供衛教參考，實際治療請諮詢您的主治醫師。

---

## 🏗️ 系統架構

```
使用者瀏覽器（React UI）
        │
        ▼
Cloudflare Worker（src/index.ts）
  ├── GET  /          → 回傳靜態前端頁面
  ├── GET  /chat/:id  → 讀取對話歷史
  ├── POST /chat/:id  → 送出問題，執行 RAG 流程
  └── DELETE /chat/:id → 清除對話歷史
        │
        ▼
ChatState Durable Object（src/chatState.ts）
   ├── 步驟 1：BGE Embedding（向量化問題）
   ├── 步驟 2：Vectorize 本地知識庫搜尋
   ├── 步驟 3：PubMed + Tavily 外部補充搜尋（有條件觸發）
   ├── 步驟 4：建構 System Prompt
   └── 步驟 5：Llama 3.3 70B 生成回答
```

### 技術堆疊

| 元件 | 技術 |
|------|------|
| 前端 | React 18 + Emotion Styled Components |
| 後端 | Cloudflare Workers（TypeScript）|
| 對話持久化 | Cloudflare Durable Objects |
| 向量資料庫 | Cloudflare Vectorize（`medical-index`）|
| Embedding 模型 | `@cf/baai/bge-base-en-v1.5` |
| LLM | `@cf/meta/llama-3.3-70b-instruct-fp8-fast` |
| 外部搜尋 | PubMed NCBI E-utilities API + Tavily |
| 靜態資源 | Cloudflare R2 |

---

## 🔍 RAG 運行邏輯與資料檢索優先級

### 完整流程（每次收到病患問題時執行）

```
病患提問
   │
   ▼
【步驟 1】BGE Embedding
   將問題文字轉換成 1536 維向量
   模型：@cf/baai/bge-base-en-v1.5
   │
   ▼
【步驟 2】Vectorize 本地知識庫搜尋（最高優先）
   在 Reference_data/ 上傳的臨床指引中，找最相似的 5 筆片段（topK=5）
   計算相似度分數（0.0 ~ 1.0），取最高分作為判斷依據
   │
   ├── 分數 ≥ 0.55 → 本地知識庫足夠，跳過外部搜尋
   │
   └── 分數 < 0.55 → 本地不足，進入步驟 3
          │
          ▼
       【步驟 3】外部補充搜尋（PubMed + Tavily，並行執行）
          ├── PubMed NCBI：搜尋相關醫學文獻（最多 3 筆）
          └── Tavily：搜尋可信醫療網域（PubMed、MedlinePlus、Cochrane、
                       UpToDate、NEJM、BMJ、The Lancet）
   │
   ▼
【步驟 4】建構 System Prompt
   按優先順序將資料組合進 Prompt：
   ① 本地臨床指引（最高優先）
   ② 外部醫學資料（補充，需標注來源）
   │
   ▼
【步驟 5】Llama 3.3 70B 生成回答
   模型：@cf/meta/llama-3.3-70b-instruct-fp8-fast
   temperature=0.3（穩定但自然）
   max_tokens=2048
   │
   ▼
回傳給病患
```

### 資料來源優先級

| 優先級 | 來源 | 觸發條件 | 參考資料標注 |
|--------|------|----------|-------------|
| 🥇 第一優先 | 本地臨床指引（Reference_data/） | 永遠優先搜尋 | `（參考資料：臨床指引參考資料）` |
| 🥈 第二優先 | PubMed 醫學文獻 | 本地相似度 < 0.55 | `（參考資料：PubMed 連結）（外部參考資料，僅供參考）` |
| 🥉 第三優先 | Tavily 醫療網域搜尋 | 本地相似度 < 0.55 | `（參考資料：來源網址）（外部參考資料，僅供參考）` |
| ❌ 無資料 | — | 三者皆無相符 | 回覆建議病患諮詢主治醫師 |

### AI 回答規則（System Prompt 規定）

- **語言**：自動偵測病患使用的語言回應（繁體中文 / 英文 / 日文等）
- **語氣**：全程使用「您」，溫和有耐心，具同理心
- **醫學名詞**：中英對照，格式為「截骨手術（Osteotomy）」
- **亂碼輸入**：溫和提示病患重新輸入
- **無關問題**：說明系統服務範圍，建議轉介適當科別
- **禁止捏造**：不可假設任何醫療數據、手術風險或診斷結果

### 外部搜尋門檻調整

在 `src/chatState.ts` 中修改 `LOCAL_SCORE_THRESHOLD`：

```typescript
// 調高 → 更常觸發外部搜尋（例如 0.7）
// 調低 → 更依賴本地知識庫（例如 0.4）
const LOCAL_SCORE_THRESHOLD = 0.55;
```

---

## 🚀 本地開發與部署

### 前置需求

- Node.js 18+
- Cloudflare 帳號（已建立 Vectorize Index: `medical-index`）
- Wrangler CLI

### 安裝與啟動

```bash
# 安裝依賴
npm install

# 編譯前端
npm run build

# 本地開發（Wrangler dev）
npx wrangler dev

# 部署到 Cloudflare Workers
npx wrangler deploy
```

### 設定 Tavily API 金鑰（外部搜尋，選填）

```bash
npx wrangler secret put TAVILY_API_KEY
# 輸入你的 Tavily API Key
```

---

## 📂 專案結構

```
NTUH_OMS_RAG/
├── src/
│   ├── index.ts          # Worker 入口點，HTTP 路由
│   ├── chatState.ts      # 核心 AI 邏輯（RAG + LLM，Durable Object）
│   └── client.tsx        # React 前端介面
├── public/
│   ├── index.html        # HTML 頁面
│   └── bundle.js         # 編譯後的前端（由 npm run build 產生）
├── Reference_data/       # 臨床指引原始文件（上傳用）
├── batch_process.py      # 批次上傳文件到 Vectorize 的腳本
├── wrangler.jsonc        # Cloudflare Workers 設定
└── package.json
```

---

## 📚 新增臨床知識庫

將 PDF 或文字檔放入 `Reference_data/` 資料夾，再執行：

```bash
python3 batch_process.py
```

腳本會自動切分文件並上傳到 Cloudflare Vectorize（`medical-index`）。

---

## ⚙️ 自訂介面文字

編輯 `src/client.tsx` 頂部的常數即可修改公告區顯示內容：

```typescript
const HOSPITAL_INTRO_TITLE = '口腔顎面外科衛教查詢';
const HOSPITAL_INTRO_DESC  = '輸入手術名稱、術後問題或相關症狀...';
const HOSPITAL_INTRO_WARNING = '⚠️ 本系統僅供衛教參考...';

// 連結按鈕（可加入掛號系統、衛教資料頁面等）
const HOSPITAL_ANNOUNCEMENTS = [
  // { label: '門診預約掛號', href: 'https://reg.ntuh.gov.tw', emoji: '📅' },
];
```

修改後執行 `npm run build && npx wrangler deploy` 即可更新。

---

## 🔧 調整 AI 行為

### 切換 LLM 模型

在 `src/chatState.ts` 中修改：

```typescript
const response = await this.env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
  // 可替換為其他 Cloudflare Workers AI 支援的模型
  // 模型列表：https://developers.cloudflare.com/workers-ai/models/
});
```

### 調整外部搜尋門檻

```typescript
// 本地知識庫相似度低於此值時，才啟動 PubMed + Tavily 補充搜尋
const LOCAL_SCORE_THRESHOLD = 0.55;
```

---

## 📄 授權

本專案僅供醫療研究與教育用途，請勿將 AI 回答作為正式醫療診斷依據。