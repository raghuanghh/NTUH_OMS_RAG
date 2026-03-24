# 🦷 NTUH_OMS_RAG — 臺大醫院口腔顎面外科 AI 衛教助理

> 部署於 Cloudflare Workers 的醫療 RAG 問答系統，結合本地臨床知識庫與外部醫學文獻，以繁體中文回答病患衛教問題。

🌐 **線上體驗**：[https://ntuh-oms-rag.raghuanghh.workers.dev](https://ntuh-oms-rag.raghuanghh.workers.dev)

---

## ⚡ 常用指令速查

> 每次開啟 Codespace 後，先 `cd /workspaces/NTUH_OMS_RAG`，再執行以下指令。

### 修改程式碼後 → 編譯 + 部署（最常用）

```bash
npm run build && npx wrangler deploy
```

### 只重新部署（Worker 後端，不需重新編譯前端）

```bash
npx wrangler deploy
```

### 只重新編譯前端（修改 `src/client.tsx` 後）

```bash
npm run build
```

### 本地開發預覽（不會影響線上版本）

```bash
npx wrangler dev
```

### 上傳新的臨床指引到知識庫

```bash
# 先把文件放入 Reference_data/ 資料夾，再執行：
python3 batch_process.py
```

### 推送變更到 GitHub（需先 build）

```bash
# 1. 編譯前端
npm run build

# 2. 加入所有變更
git add .

# 3. 寫上版本備註並提交
git commit -m "你的備註說明"

# 4. 推送（透過 Python API，因 Codespace 無 git 憑證）
python3 - <<'EOF'
import base64, urllib.request, json, os, subprocess

TOKEN = open('/workspaces/.codespaces/shared/.env').read()
TOKEN = [l.split('=',1)[1] for l in TOKEN.splitlines() if l.startswith('GITHUB_TOKEN=')][0]

files = ['src/chatState.ts', 'src/index.ts', 'src/client.tsx', 'public/bundle.js']
for path in files:
    r = urllib.request.urlopen(urllib.request.Request(
        f'https://api.github.com/repos/raghuanghh/NTUH_OMS_RAG/contents/{path}?ref=main',
        headers={'Authorization': f'token {TOKEN}', 'Accept': 'application/vnd.github+json', 'User-Agent': 'py'}
    ))
    sha = json.loads(r.read())['sha']
    with open(path, 'rb') as f:
        b64 = base64.b64encode(f.read()).decode()
    req = urllib.request.Request(
        f'https://api.github.com/repos/raghuanghh/NTUH_OMS_RAG/contents/{path}',
        data=json.dumps({"message": "update", "content": b64, "sha": sha, "branch": "main"}).encode(),
        method='PUT',
        headers={'Authorization': f'token {TOKEN}', 'Content-Type': 'application/json', 'Accept': 'application/vnd.github+json', 'User-Agent': 'py'}
    )
    print(f"✅ {path}")
    urllib.request.urlopen(req)
EOF
```

---

## 📖 系統簡介

本系統是專為臺大醫院口腔顎面外科設計的 AI 衛教查詢助理，病患可輸入手術名稱、術後問題或相關症狀，系統會根據以下流程產生回答：

1. **本地知識庫優先**：搜尋已上傳的臨床指引（Cloudflare Vectorize 向量資料庫）
2. **外部補充檢索**：若本地知識庫相似度不足，自動搜尋 PubMed 文獻與醫療資料庫（Tavily）
3. **AI 生成回答**：使用 DeepSeek-R1-Distill-Qwen-32B 推理模型，以繁體中文生成白話衛教說明

> ⚠️ 本系統僅供衛教參考，實際治療請諮詢您的主治醫師。

---

## 🏗️ 系統架構

```
使用者瀏覽器（React UI）
        │
        ▼
Cloudflare Worker（src/index.ts）
        │
        ▼
ChatState Durable Object（src/chatState.ts）
   ├── 1. BGE Embedding → 向量化問題
   ├── 2. Vectorize 本地知識庫搜尋（臨床指引）
   ├── 3. PubMed + Tavily 外部補充搜尋（選擇性）
   └── 4. DeepSeek-R1 LLM 生成回答
```

### 技術堆疊

| 元件 | 技術 |
|------|------|
| 前端 | React 18 + Emotion Styled Components |
| 後端 | Cloudflare Workers（TypeScript）|
| 對話持久化 | Cloudflare Durable Objects |
| 向量資料庫 | Cloudflare Vectorize |
| Embedding 模型 | `@cf/baai/bge-base-en-v1.5` |
| LLM | `@cf/deepseek-ai/deepseek-r1-distill-qwen-32b` |
| 外部搜尋 | PubMed NCBI E-utilities API + Tavily |
| 靜態資源 | Cloudflare R2 |

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
const response = await this.env.AI.run('@cf/deepseek-ai/deepseek-r1-distill-qwen-32b', {
  // 更換為其他 Cloudflare Workers AI 支援的模型
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