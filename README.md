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
| 第一優先 | 本地臨床指引（Reference_data/） | 永遠優先搜尋 | `（參考資料：臨床指引參考資料）` |
| 第二優先 | PubMed 醫學文獻 | 本地相似度 < 0.55 | `（參考資料：PubMed 連結）（外部參考資料，僅供參考）` |
| 第三優先 | Tavily 醫療網域搜尋 | 本地相似度 < 0.55 | `（參考資料：來源網址）（外部參考資料，僅供參考）` |
| 無資料 | — | 三者皆無相符 | 回覆建議病患諮詢主治醫師 |

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
├── src/                          # 後端 Worker 與前端原始碼
│   ├── index.ts                  # Cloudflare Worker 入口點，定義 HTTP 路由
│   ├── chatState.ts              # 核心 AI 邏輯（Durable Object，執行完整 RAG 流程）
│   ├── client.tsx                # React 前端介面（Emotion 樣式，編譯成 public/bundle.js）
│   └── scrapegq.ts               # 保留供未來擴充的網頁抓取腳本（目前未啟用）
│
├── public/                       # 靜態前端資源（部署到 Cloudflare Assets）
│   ├── index.html                # 前端 HTML 頁面主體
│   └── bundle.js                 # npm run build 編譯 client.tsx 後的產出套件
│
├── Reference_data/               # 臨床指引與手術同意書 PDF（向量化來源）
│   ├── NCCN guidelines dor patients Mouth Cancer.pdf
│   ├── Nasopharyngeal carcinoma ESMO-EURACAN Clinical Practice Guideline.pdf
│   ├── Pan-Asian adaptation of the EHNSeESMOeESTRO Clinical Practice.pdf
│   ├── Sinonasal malignancy ESMO_EURACAN Clinical Practice Guideline.pdf
│   ├── 一般牙齒及阻生齒拔除手術說明暨同意書去識別.pdf
│   ├── 正顎手術說明暨同意書去識別.pdf
│   ├── 頭頸部惡性腫瘤切除手術說明暨同意書去識別.pdf
│   ├── 頭頸部感染手術說明暨同意書去識別.pdf
│   └── 頭頸部良性病變、腫瘤、囊腫手術說明暨同意書去識別.pdf
│
├── test/                         # 單元測試與測試環境設定
│   ├── index.spec.ts             # Vitest 單元測試（測試 Worker HTTP 路由回應）
│   ├── env.d.ts                  # 測試環境 TypeScript 型別定義
│   ├── tsconfig.json             # 測試專用 TypeScript 編譯設定
│   └── openaioss_chat_and_on_taylor_travis_autorag_w_newheights_gq_v1.0.zip
│                                 # 舊版 RAG 方案備份壓縮包
│
├── batch_process.py              # 步驟 1：讀取 Reference_data/ 內 PDF，
│                                 #   使用 PyMuPDF 萃取文字並切成 300 字區塊，
│                                 #   輸出 document_chunks.json
│
├── upload_prep.py                # 步驟 2：讀取 document_chunks.json，
│                                 #   以本地 BAAI/bge-base-en-v1.5 模型轉換向量，
│                                 #   輸出 vectorize_upload.ndjson 供上傳 Cloudflare Vectorize
│
├── document_chunks.json          # batch_process.py 產生的文字切片（中間產物，不需提交）
│
├── wrangler.jsonc                # Cloudflare Workers 部署設定
│                                 #   - Durable Objects（ChatState）
│                                 #   - Vectorize（medical-index）
│                                 #   - R2 Bucket（taylor-rag-articles）
│                                 #   - Workers AI binding
│                                 #   - 靜態資源（public/）
│
├── package.json                  # npm 套件管理與腳本
│                                 #   build: esbuild 編譯前端
│                                 #   dev: wrangler dev 本地開發
│                                 #   deploy: wrangler deploy 部署
│                                 #   test: vitest 執行單元測試
│
├── tsconfig.json                 # 主程式 TypeScript 編譯設定
├── vitest.config.mts             # Vitest 測試框架設定（使用 Cloudflare Workers 環境池）
├── worker-configuration.d.ts     # Wrangler 自動產生的 Workers 環境型別定義
├── .editorconfig                 # 跨編輯器縮排與換行一致性設定
├── .prettierrc                   # Prettier 程式碼自動格式化設定
└── package-lock.json             # npm 依賴鎖定版本
```

### 各檔案功能說明

#### `src/index.ts` — Worker 入口點

Cloudflare Worker 的主程式，負責接收所有 HTTP 請求並分流：

| 路由 | 方法 | 功能 |
|------|------|------|
| `/` | GET | 回傳前端 HTML 頁面（from Cloudflare Assets）|
| `/bundle.js` | GET | 回傳前端 JS 套件（from Cloudflare Assets）|
| `/chat/init` | GET | 初始化對話，回傳 Durable Object ID |
| `/chat/:id` | GET | 取得對話歷史紀錄 |
| `/chat/:id` | POST | 送出問題，執行 RAG 流程並回傳 AI 回答 |
| `/chat/:id` | DELETE | 清除對話歷史 |

#### `src/chatState.ts` — 核心 AI 邏輯（Durable Object）

系統的智慧核心，負責執行完整的 RAG 問答流程（詳見 [RAG 運行邏輯](#-rag-運行邏輯與資料檢索優先級)）。主要包含：

- 對話歷史的持久化儲存（SQLite via Durable Object）
- BGE 向量 Embedding
- Vectorize 本地知識庫搜尋
- PubMed NCBI / Tavily 外部補充搜尋
- System Prompt 建構與 Llama 3.3 70B 推論

#### `src/client.tsx` — React 前端介面

使用 React 18 + Emotion Styled Components 建立的聊天介面，包含：
- 醫院公告區與快速提問按鈕
- 對話訊息串列（支援 Markdown 渲染）
- 輸入框與送出按鈕
- 可透過頂部常數自訂標題、說明文字與連結按鈕

#### `Reference_data/` — 臨床知識庫來源

存放所有要向量化並上傳至 Cloudflare Vectorize 的原始 PDF：

| 類型 | 檔案 |
|------|------|
| 國際臨床指引（英文）| NCCN 口腔癌、ESMO 鼻咽癌、ESMO 鼻竇惡性腫瘤、Pan-Asian HPV 指引 |
| 手術說明暨同意書（中文）| 拔牙、正顎手術、頭頸部惡性腫瘤切除、頭頸部感染、頭頸部良性病變 |

#### `batch_process.py` + `upload_prep.py` — 知識庫建置流程

兩支 Python 腳本組成知識庫建置的兩階段流程：

```
Reference_data/*.pdf
        │
        ▼  batch_process.py（PyMuPDF 萃取 + 300字切片）
document_chunks.json
        │
        ▼  upload_prep.py（BAAI/bge-base-en-v1.5 本地向量化）
vectorize_upload.ndjson
        │
        ▼  npx wrangler vectorize insert medical-index --file=vectorize_upload.ndjson
Cloudflare Vectorize（medical-index）
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

---

## 🎛️ RAG 參數調整指南

所有參數都在 `src/chatState.ts` 中，修改後執行 `npm run build && npx wrangler deploy` 即可更新。

### 目前參數總覽

| 參數 | 目前值 | 位置 |
|------|--------|------|
| `LOCAL_SCORE_THRESHOLD` | `0.55` | `chatState.ts` 頂部 |
| `topK`（Vectorize 回傳筆數） | `5` | 步驟 2 |
| `temperature`（LLM 創意度） | `0.3` | 步驟 5 |
| `max_tokens`（回答長度上限） | `2048` | 步驟 5 |
| PubMed 最多回傳筆數 | `3` | `searchPubMed()` |
| Tavily 最多回傳筆數 | `3` | `searchTavily()` |
| Tavily 摘要截取字數 | `400` | `searchTavily()` |

---

### LOCAL_SCORE_THRESHOLD（外部搜尋觸發門檻）

```typescript
const LOCAL_SCORE_THRESHOLD = 0.55;  // 目前值：0.55
```

本地 Vectorize 搜尋的最高相似度分數，低於此值才會啟動 PubMed + Tavily 外部搜尋。

| 值 | 效果 |
|----|------|
| `0.7` 以上 | 幾乎每次都觸發外部搜尋（延遲較高） |
| `0.55`（目前） | 平衡：本地有相關資料就優先用本地 |
| `0.4` 以下 | 幾乎只用本地知識庫，很少觸發外部搜尋 |

---

### topK（本地知識庫搜尋筆數）

```typescript
const vectorResults = await this.env.VECTORIZE_INDEX.query(queryVector.data[0], {
  topK: 5,  // 目前值：5
  returnMetadata: true,
});
```

從 Vectorize 撈出最相似的前 N 筆臨床指引片段，全部塞進 Prompt 作為參考資料。

| 值 | 效果 |
|----|------|
| `3` | Prompt 較短，回答較快，但可能遺漏相關資訊 |
| `5`（目前） | 平衡 |
| `10` | 涵蓋更多資料，但 Prompt 變長，費用與延遲增加 |

---

### temperature（LLM 回答的隨機度 / 創意度）

```typescript
temperature: 0.3,  // 目前值：0.3，範圍 0.0 ~ 1.0
```

控制 LLM 回答的穩定性與創意度。

| 值 | 效果 |
|----|------|
| `0.0` | 完全確定性輸出，每次回答幾乎相同，最保守 |
| `0.1 ~ 0.3`（目前 0.3） | 穩定為主，語氣稍有變化，適合醫療場景 |
| `0.5 ~ 0.7` | 語氣更自然，但偶爾措辭不一致 |
| `1.0` | 高度隨機，不適合醫療用途 |

> 💡 醫療場景建議維持 `0.1 ~ 0.3`，避免 AI 回答內容每次差異過大。

---

### max_tokens（回答長度上限）

```typescript
max_tokens: 2048,  // 目前值：2048
```

LLM 單次回答的最大 token 數（約 1 token ≈ 0.75 個英文字 / 0.5 個中文字）。

| 值 | 效果 |
|----|------|
| `512` | 簡短回答，適合快速問答 |
| `1024` | 中等長度 |
| `2048`（目前） | 足以包含完整的術後衛教說明 |
| `4096` | 更長，但延遲增加，一般衛教問題不需要 |

---

### PubMed / Tavily 搜尋筆數

```typescript
// PubMed（searchPubMed 函式）
retmax=3  // 目前值：3

// Tavily（searchTavily 函式）
max_results: 3,  // 目前值：3
content: (r.content ?? '').substring(0, 400),  // 每筆摘要截取前 400 字
```

外部搜尋的結果數量，影響 Prompt 長度與費用：

| 參數 | 調高效果 | 調低效果 |
|------|---------|---------|
| `retmax` / `max_results` | 更多參考資料，但 Prompt 更長 | 搜尋更快，Prompt 較短 |
| `substring(0, 400)` | 每筆摘要更完整 | 減少 token 用量 |

---

## 📄 授權

本專案僅供醫療研究與教育用途，請勿將 AI 回答作為正式醫療診斷依據。