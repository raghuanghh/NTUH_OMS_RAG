# 🦷 NTUH_OMS_RAG — 臺大醫院口腔顎面外科 AI 衛教助理

> 部署於 Cloudflare Workers 的醫療 RAG 問答系統，結合本地臨床知識庫與外部醫學文獻，以繁體中文回答病患衛教問題。

🌐 **線上體驗**：[https://ntuh-oms-rag.raghuanghh.workers.dev](https://ntuh-oms-rag.raghuanghh.workers.dev)

> ⚠️ 本系統僅供衛教參考，實際治療請諮詢您的主治醫師。

> 📌 **本專案基於** [hxrsh-3/chat-w-taylor-on-newheights-and-travis-gq-autorag-openaioss](https://github.com/hxrsh-3/chat-w-taylor-on-newheights-and-travis-gq-autorag-openaioss) **改作**，在保留 Cloudflare Workers + Durable Objects 基礎架構的前提下，針對醫療衛教場景進行大幅重構，詳見下方「與原始專案的差異」。

---

## 技術堆疊

| 元件 | 技術 | 版本 |
|------|------|------|
| 前端 | React + Emotion Styled Components | React 18.2 / Emotion 11 |
| 後端 | Cloudflare Workers（TypeScript）| TypeScript 5.5 / Wrangler 4.12 |
| 對話持久化 | Cloudflare Durable Objects（SQLite backend）| compatibility_date 2025-08-13 |
| 向量資料庫 | Cloudflare Vectorize（`medical-index`，768 維，cosine）| — |
| Embedding | `@cf/baai/bge-base-en-v1.5` | — |
| LLM | `@cf/meta/llama-3.3-70b-instruct-fp8-fast` | — |
| 外部搜尋 | PubMed NCBI E-utilities + Tavily | — |
| PDF OCR | Marker（本地 GPU）+ Datalab API（備援）| marker-pdf 1.x / Python 3.12 |
| 測試 | Vitest | 3.0 |

---

## 系統架構

```
病患提問 (front-end UI)
   │
   ▼
Cloudflare Worker（src/index.ts）─ HTTP 路由分流
   │
   ▼
ChatState Durable Object（src/chatState.ts）
   │
   ├─[1] BGE Embedding：問題向量化
   │
   ├─[2] Vectorize 本地知識庫搜尋（topK=5）
   │       ├── 相似度 ≥ 0.55 → 直接進入步驟 4
   │       └── 相似度 < 0.55 → 進入步驟 3
   │
   ├─[3] 外部補充搜尋（PubMed + Tavily，並行）
   │
   ├─[4] 組合 System Prompt（本地優先、外部補充）
   │
   └─[5] Llama 3.3 70B 生成回答 → 回傳給病患
```

### RAG 資料來源優先級

| 優先級 | 來源 | 觸發條件 |
|--------|------|----------|
| 1 | 本地臨床指引（Reference_data/） | 永遠搜尋 |
| 2 | PubMed 醫學文獻 | 本地相似度 < 0.55 |
| 3 | Tavily 醫療網域搜尋 | 本地相似度 < 0.55 |

### AI 回答規則

- **語言**：自動偵測（繁體中文 / 英文等）
- **語氣**：全程使用「您」，溫和具同理心
- **醫學名詞**：中英對照，如「截骨手術（Osteotomy）」
- **禁止捏造**：不可假設任何醫療數據或診斷結果

---

## 專案結構

```
NTUH_OMS_RAG/
├── src/
│   ├── index.ts              # Worker 入口，HTTP 路由
│   ├── chatState.ts          # 核心 RAG 邏輯（Durable Object）
│   ├── client.tsx            # React 前端介面
│   └── scrapegq.ts           # 網頁抓取（未啟用，保留備用）
├── public/
│   ├── index.html            # 前端頁面
│   └── bundle.js             # npm run build 產出
├── test/
│   ├── index.spec.ts         # Vitest 單元測試
│   ├── env.d.ts              # 測試環境型別定義
│   └── tsconfig.json         # 測試專用 TS 設定
├── Reference_data/           # 原始 PDF 知識庫
│
├── batch_process.py          # ✅ 步驟 1：PDF → OCR → document_chunks.json
├── upload_prep.py            # ✅ 步驟 2：chunks → 向量化 → vectorize_upload.ndjson
├── check_pdfs.py             # 🔧 診斷工具：檢查 PDF 可讀性與頁數
├── analyze_chunks.py         # 🔧 診斷工具：分析 chunks 內容與來源統計
│
├── document_chunks.json      # 中間產物（已加入 .gitignore，不需提交，可從 PDF 重新生成）
├── wrangler.jsonc            # Cloudflare Workers 部署設定
├── package.json              # npm 腳本（build / dev / deploy / test）
├── tsconfig.json             # TypeScript 編譯設定
├── .env.example              # Python 腳本 API Key 範本
└── .dev.vars.example         # Wrangler 本地開發 API Key 範本
```

### HTTP 路由（src/index.ts）

| 方法 | 路由 | 功能 |
|------|------|------|
| GET | `/` | 前端頁面 |
| GET | `/chat/init` | 初始化對話，回傳 Session ID |
| GET | `/chat/:id` | 取得對話歷史 |
| POST | `/chat/:id` | 送出問題，執行 RAG 流程 |
| DELETE | `/chat/:id` | 清除對話 |

### 自訂介面文字（src/client.tsx）

```typescript
const HOSPITAL_INTRO_TITLE   = '口腔顎面外科衛教查詢';
const HOSPITAL_INTRO_DESC    = '輸入手術名稱、術後問題或相關症狀...';
const HOSPITAL_INTRO_WARNING = '⚠️ 本系統僅供衛教參考...';
const HOSPITAL_ANNOUNCEMENTS = [
  // { label: '門診預約掛號', href: 'https://reg.ntuh.gov.tw', emoji: '📅' },
];
```

修改後執行 `npm run build && npx wrangler deploy` 更新。

---

## 快速開始

### 第一步：取得 API 金鑰

| 服務 | 說明 | 連結 |
|------|------|------|
| Cloudflare ✅ | 部署 Worker、向量庫、AI 推論 | [dash.cloudflare.com](https://dash.cloudflare.com) → API Tokens |
| Datalab（選填）| OCR 備援，$5 免費額度 | [datalab.to/app/keys](https://www.datalab.to/app/keys) |
| Tavily（選填）| 外部醫療文獻搜尋 | [tavily.com](https://tavily.com) |

```powershell
npx wrangler login   # Cloudflare 登入（只需做一次）
```

---

### 第二步：建立 Cloudflare 資源（只需做一次）

```powershell
# 向量資料庫（必要）
npx wrangler vectorize create medical-index --dimensions=768 --metric=cosine

# Durable Object migration（第一次部署時 Cloudflare 會自動執行，無需手動操作）
# R2 Bucket：wrangler.jsonc 中有設定 binding，但目前系統未實際使用，可略過
# npx wrangler r2 bucket create taylor-rag-articles
```

---

### 第三步：設定本地環境變數

```powershell
# 複製範本檔
cp .env.example .env
cp .dev.vars.example .dev.vars
```

編輯 `.env`（Python 腳本用）：
```env
DATALAB_API_KEY=你的_Datalab_API_Key   # 選填
```

編輯 `.dev.vars`（Wrangler 本地開發用）：
```env
TAVILY_API_KEY=你的_Tavily_API_Key
```

> ✅ 這兩個檔案已被 `.gitignore` 排除，不會上傳到 GitHub

---

### 第四步：建置知識庫

知識庫建置流程：`Reference_data/*.pdf` → OCR → 向量化 → 上傳 Vectorize

#### 4a. OCR 解析 PDF

本系統支援雙通道 OCR，`OCR_ENGINE` 預設為 `"auto"`：

| 引擎設定 | 行為 | 費用 | 速度 |
|---------|------|------|------|
| `"auto"`（預設）| 有 API Key 先用 Datalab；失敗或無 Key 自動切換 Marker | 視情況 | — |
| `"marker"` | 只用本地 Marker，完全免費 | 免費 | GPU ~0.1 秒/頁；CPU ~2~5 秒/頁 |
| `"datalab"` | 只用 Datalab API | ~$0.01/頁 | 雲端非同步 |

```powershell
# 安裝依賴（使用 Python 3.12）
py -3.12 -m pip install pypdf requests marker-pdf sentence-transformers

# 載入 API Key 到環境變數
# 在 PowerShell 中：
$env:DATALAB_API_KEY = Get-Content .env | Select-String "DATALAB_API_KEY" | ForEach-Object { $_.ToString().Split('=')[1] }
# 或直接編輯 PowerShell session：
# $env:DATALAB_API_KEY = "your_datalab_key_here"

# 在 Bash/Mac 中：
# export $(cat .env | xargs)

# （選填）NVIDIA GPU 加速，約快 10x，詳見下方「GPU 排錯」
# 確認 CUDA 版本：nvidia-smi

# 執行 OCR（支援斷點續跑）
py -3.12 batch_process.py
# 輸出：document_chunks.json
```

> 首次執行 Marker 會下載模型（約 4GB），之後可離線使用。

#### 4b. 向量化並上傳

```powershell
# 向量化（若未安裝 sentence-transformers 請先安裝）
py -3.12 upload_prep.py
# 輸出：vectorize_upload.ndjson

# 上傳到 Cloudflare Vectorize
npx wrangler vectorize insert medical-index --file=vectorize_upload.ndjson
```

---

### 第五步：部署

```powershell
# 安裝 Node 依賴並編譯前端
npm install
npm run build

# 設定 Tavily 金鑰到正式環境（輸入 Key 後按 Enter）
npx wrangler secret put TAVILY_API_KEY

# 部署
npx wrangler deploy
```

部署後透過 `https://<worker名稱>.<帳號>.workers.dev` 存取。

#### 本地開發

⚠️ **重要限制**：Vectorize 在本地開發環境不支持，必須綁定到生產環境索引

```powershell
# 使用 --experimental-vectorize-bind-to-prod 連接到生產環境的 medical-index
npx wrangler dev --experimental-vectorize-bind-to-prod

# 或簡單版本（但 Vectorize 會失敗）
npx wrangler dev
# 開啟 http://localhost:8787
```

> ⚠️ 若使用 `--experimental-vectorize-bind-to-prod`，本地開發會使用真實的生產向量庫，可能產生查詢費用。建議仅用於測試完整流程。

---

## 參數調整

### RAG 參數（`src/chatState.ts`）

修改後執行 `npm run build && npx wrangler deploy` 更新。

| 參數 | 預設值 | 說明 |
|------|--------|------|
| `LOCAL_SCORE_THRESHOLD` | `0.55` | 低於此值才觸發外部搜尋（調高 → 更常用外部；調低 → 更依賴本地）|
| `topK` | `5` | Vectorize 回傳最相似筆數 |
| `temperature` | `0.3` | LLM 創意度（醫療場景建議 0.1~0.3）|
| `max_tokens` | `2048` | 回答長度上限 |
| PubMed `retmax` | `3` | 外部搜尋最多回傳筆數 |
| Tavily `max_results` | `3` | 外部搜尋最多回傳筆數 |

### OCR 參數（`batch_process.py` 頂部）

| 參數 | 預設值 | 說明 |
|------|--------|------|
| `OCR_ENGINE` | `"auto"` | `"auto"` / `"marker"`（本地免費）/ `"datalab"`（雲端）|
| `MARKER_DEVICE` | `"cuda"` | `"auto"` / `"cuda"` / `"mps"` / `"cpu"` |
| `PAGES_PER_BATCH` | `100` | 每批切出頁數（大型 PDF 由 MAX_FILE_MB 自動縮減）|
| `MAX_FILE_MB` | `30` | 單批暫存 PDF 大小上限（超過自動對半遞迴縮減）|
| `MAX_RETRIES` | `3` | 單批最大重試次數 |
| `POLL_TIMEOUT` | `1800` | Datalab 最長等待秒數（30 分鐘）|

> 若遇到 413 Payload Too Large：調低 `MAX_FILE_MB`（例如改為 `15`）

### 斷點續跑

`batch_process.py` 每處理完一個完整 PDF 就立即寫入 `document_chunks.json`。**中途 Ctrl+C 中斷後，重新執行會自動跳過已完成的檔案，從下一個 PDF 繼續。**

#### 中途改 code 再繼續的操作流程

```powershell
# 1. 隨時可以 Ctrl+C 停止，document_chunks.json 已保存目前進度

# 2. 確認已完成哪些 PDF（查看 source 清單）
py -3.12 analyze_chunks.py

# 3. 修改 batch_process.py（改參數、改邏輯都可以）

# 4. 直接重新執行，已完成的 PDF 自動跳過
py -3.12 batch_process.py
```

#### 若要重新處理特定 PDF

```powershell
# 從 document_chunks.json 移除特定檔案的 chunks，讓它重跑
py -3.12 -c "
import json
TARGET = '要重新處理的檔名.pdf'
chunks = json.load(open('document_chunks.json', encoding='utf-8'))
chunks = [c for c in chunks if c['source'] != TARGET]
json.dump(chunks, open('document_chunks.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
print(f'已移除 {TARGET}，重新執行 batch_process.py 即可重跑')
"
py -3.12 batch_process.py
```

#### 若要完全重頭開始

```powershell
del document_chunks.json   # 或手動刪除
py -3.12 batch_process.py
```

### GPU 排錯

若出現「未偵測到 GPU」但你確定有 NVIDIA 顯卡，通常是 PyTorch 安裝的是 CPU-only 版：

```powershell
# 步驟 1：確認 nvidia-smi 正常（顯示驅動版本和 CUDA 版本）
nvidia-smi

# 步驟 2：確認 PyTorch 是否含 CUDA（輸出 None 表示 CPU-only）
py -3.12 -c "import torch; print('CUDA built:', torch.version.cuda)"

# 步驟 3：若輸出 None，重新安裝 CUDA 版（依 nvidia-smi 顯示的 CUDA 版本調整）
py -3.12 -m pip uninstall torch torchvision -y
py -3.12 -m pip install torch torchvision --index-url https://download.pytorch.org/whl/cu128

# 步驟 4：確認 GPU 偵測正常（輸出 True）
py -3.12 -c "import torch; print(torch.cuda.is_available(), torch.cuda.get_device_name(0))"
```

若 torch 正常但 Marker 仍不用 GPU，在 `batch_process.py` 頂部直接強制指定：
```python
MARKER_DEVICE = "cuda"   # 強制使用 CUDA，不做自動偵測
```

---

## 與原始專案的差異

本專案從 [hxrsh-3/chat-w-taylor-on-newheights-and-travis-gq-autorag-openaioss](https://github.com/hxrsh-3/chat-w-taylor-on-newheights-and-travis-gq-autorag-openaioss) 改作，保留了 Cloudflare Workers + Durable Objects 對話持久化的骨架，其餘幾乎全面重構。

### 功能差異對照

| 面向 | 原始專案 | 本專案（NTUH_OMS_RAG）|
|------|----------|----------------------|
| **應用領域** | 娛樂（Taylor Swift 播客、Travis Kelce GQ 專訪） | 醫療（臺大醫院口腔顎面外科衛教）|
| **LLM** | `@cf/openai/gpt-oss-120b`（OpenAI GPT-OSS via Cloudflare）| `@cf/meta/llama-3.3-70b-instruct-fp8-fast`（Meta Llama，Cloudflare 原生）|
| **知識庫建構** | Cloudflare **AutoRAG**（全託管，自動 ingestion）| 手動流程：PDF → OCR → BGE Embedding → Cloudflare Vectorize |
| **知識庫查詢** | `env.AI.autorag("索引名").aiSearch({ query })` 單一呼叫 | BGE Embedding → Vectorize `query(topK=5, returnMetadata)`，取回原文 chunks 自行組合 |
| **外部補充檢索** | ❌ 無 | ✅ PubMed NCBI E-utilities + Tavily（相似度 < 0.55 時自動觸發）|
| **網頁即時抓取** | ✅ Cloudflare Browser Rendering（Puppeteer 抓取 GQ 文章）| ❌ 無（知識庫改用本地 PDF 離線建置）|
| **回退策略** | AutoRAG 無結果 → GPT-OSS 120B 直接回答（無知識庫）| 本地向量不足 → PubMed + Tavily 補充搜尋，仍有知識庫 context |
| **System Prompt** | `"You are a friendly assistant"`（單行）| 詳細醫療衛教 Prompt：角色定義、語言偵測規則、語氣規範、引用格式、安全守則（見 `src/chatState.ts` 步驟 4）|
| **語言支援** | 英文 | 自動偵測語言（繁體中文 / 英文 / 日文等），預設繁體中文台灣用語 |
| **醫療安全機制** | ❌ 無 | ✅ 禁止捏造醫療數據、必須附引用來源、無資料時引導就醫 |
| **OCR 管線** | ❌ 無（AutoRAG 自動處理）| ✅ 雙通道：Datalab Marker API（雲端）+ 本地 marker-pdf（GPU），支援斷點續跑 |
| **向量化腳本** | ❌ 無 | ✅ `batch_process.py`（OCR）、`upload_prep.py`（BGE 向量化 + NDJSON）|

### 資料檢索來源差異

**原始專案的資料流**：
```
使用者問題
   └─→ Cloudflare AutoRAG（全託管索引 "proud-thunder-70c9"）
           └─→ 有結果：直接回傳 AutoRAG 的 response 字串
           └─→ 無結果：GPT-OSS 120B 直接生成（無任何知識庫 context）
```

**本專案的資料流**：
```
使用者問題
   ├─[1] BGE Embedding 向量化問題
   ├─[2] Vectorize 本地知識庫搜尋（Reference_data/ 的 PDF 臨床指引）
   │       ├── 相似度 ≥ 0.55 → 本地 context 帶入 Prompt
   │       └── 相似度 < 0.55 → 觸發下方外部搜尋
   ├─[3] 外部補充（並行）
   │       ├── PubMed NCBI E-utilities（免費，醫學文獻）
   │       └── Tavily 限定醫療網域搜尋（pubmed / medlineplus / cochrane 等）
   └─[4] 組合 Prompt + Llama 3.3 70B 生成回答
```

---

## 授權

本專案僅供醫療研究與教育用途，請勿將 AI 回答作為正式醫療診斷依據。

---
