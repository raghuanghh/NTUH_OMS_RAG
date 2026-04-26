"""
[Pipeline 第 2 步] upload_prep.py
─────────────────────────────────────────────────────────────────────
用途：將 batch_process.py 產生的 document_chunks.json 轉換為向量，
      並打包成 Cloudflare Vectorize 可直接上傳的 NDJSON 格式。

使用模型：BAAI/bge-base-en-v1.5（與 Cloudflare AI 內建模型相同，
          確保查詢向量與儲存向量在同一空間，語意搜尋結果一致）

輸入：document_chunks.json（batch_process.py 的輸出）
輸出：vectorize_upload.ndjson（Cloudflare Vectorize 上傳格式）

使用方式：
    py -3.12 upload_prep.py

上傳指令（Wrangler CLI）：
    npx wrangler vectorize insert <INDEX_NAME> --file=vectorize_upload.ndjson
─────────────────────────────────────────────────────────────────────
"""

import json
import os
import hashlib
from sentence_transformers import SentenceTransformer

# === 設定 ===
SCRIPT_DIR  = os.path.dirname(os.path.abspath(__file__))
CHUNKS_FILE = os.path.join(SCRIPT_DIR, "document_chunks.json")
OUTPUT_FILE = os.path.join(SCRIPT_DIR, "vectorize_upload.ndjson")
BATCH_SIZE  = 32   # 每批向量化的 chunk 數（影響記憶體用量與速度）

# === 嵌入模型名稱 ===
# 使用與 Cloudflare 雲端完全相同的開源模型，確保向量空間一致
MODEL_NAME = "BAAI/bge-base-en-v1.5"


def main():
    # --- 載入嵌入模型（在 main() 內載入，避免 import 時觸發模型下載）---
    print(f"⏳ 載入嵌入模型 {MODEL_NAME}...")
    model = SentenceTransformer(MODEL_NAME)
    # --- 讀取 chunks ---
    print("📂 讀取 document_chunks.json 中...")
    if not os.path.exists(CHUNKS_FILE):
        print(f"❌ 找不到 {CHUNKS_FILE}，請先執行 batch_process.py")
        return

    with open(CHUNKS_FILE, "r", encoding="utf-8") as f:
        chunks = json.load(f)

    # --- 批次向量化 ---
    # batch_size=32 在 GPU 上約 1~2 分鐘/千筆；CPU 上約 10~20 分鐘/千筆
    print(f"⏳ 開始將 {len(chunks)} 筆文字轉換為向量（model: {MODEL_NAME}，請稍候）...")
    texts = [chunk["content"] for chunk in chunks]
    embeddings = model.encode(texts, batch_size=BATCH_SIZE, show_progress_bar=True)

    # --- 打包成 Cloudflare NDJSON 格式 ---
    # 每行一個 JSON 物件：{ id, values（向量）, metadata（原文 + 來源） }
    print("📦 打包成 Cloudflare Vectorize 上傳格式（NDJSON）...")
    ndjson_lines = []
    for chunk, embedding in zip(chunks, embeddings):
        # 用來源檔名 + 內容前 128 字元產生穩定 ID，重跑 upload_prep 不會打亂既有向量
        chunk_id = "vec_" + hashlib.md5(
            (chunk["source"] + ":" + chunk["content"][:128]).encode("utf-8")
        ).hexdigest()[:16]
        record = {
            "id": chunk_id,
            "values": embedding.tolist(),        # float32 → Python list
            "metadata": {
                "content": chunk["content"],     # 查詢命中時返回的原始文字
                "source":  chunk["source"],      # 來源 PDF 檔名，供引用標注
            },
        }
        ndjson_lines.append(json.dumps(record, ensure_ascii=False))

    # --- 寫出檔案 ---
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        f.write("\n".join(ndjson_lines))

    print(f"✅ 已輸出 {OUTPUT_FILE}（{len(ndjson_lines)} 筆向量）")
    print(f"   上傳指令：npx wrangler vectorize insert <INDEX_NAME> --file={OUTPUT_FILE}")


if __name__ == "__main__":
    main()