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

# Cloudflare Vectorize metadata 單欄位上限（bytes）
# 超過此長度的 content 會被截斷，避免上傳時 413/metadata 錯誤
METADATA_MAX_CHARS = 9000

# 內容過短的 chunk 不具查詢價值（如 "# TABLE"、"1"），跳過不向量化
MIN_CONTENT_CHARS = 50

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
        all_chunks = json.load(f)

    # --- 過濾太短的 chunk（噪音，如標題行、頁碼、空白節）---
    chunks = [c for c in all_chunks if len(c.get("content", "")) >= MIN_CONTENT_CHARS]
    skipped = len(all_chunks) - len(chunks)
    if skipped:
        print(f"⚠️  已略過 {skipped} 筆過短 chunk（< {MIN_CONTENT_CHARS} 字元），剩餘 {len(chunks)} 筆")

    # --- 截斷超長 metadata（Cloudflare Vectorize 單欄位 ~10KB 限制）---
    truncated = 0
    for c in chunks:
        if len(c["content"]) > METADATA_MAX_CHARS:
            c["content"] = c["content"][:METADATA_MAX_CHARS]
            truncated += 1
    if truncated:
        print(f"⚠️  已截斷 {truncated} 筆超長 chunk（> {METADATA_MAX_CHARS} 字元）至 {METADATA_MAX_CHARS} 字元")

    # --- 批次向量化 ---
    # batch_size=32 在 GPU 上約 1~2 分鐘/千筆；CPU 上約 10~20 分鐘/千筆
    print(f"⏳ 開始將 {len(chunks)} 筆文字轉換為向量（model: {MODEL_NAME}，請稍候）...")
    texts = [chunk["content"] for chunk in chunks]
    embeddings = model.encode(texts, batch_size=BATCH_SIZE, show_progress_bar=True)

    # --- 打包成 Cloudflare NDJSON 格式 ---
    # 每行一個 JSON 物件：{ id, values（向量）, metadata（原文 + 來源） }
    print("📦 打包成 Cloudflare Vectorize 上傳格式（NDJSON）...")
    ndjson_lines = []
    seen_ids: set[str] = set()
    dupe_count = 0
    for idx, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
        # ID 加入序號 idx，防止相同短內容（如 "# TABLE"）產生 hash 碰撞
        chunk_id = "vec_" + hashlib.md5(
            (chunk["source"] + ":" + str(idx) + ":" + chunk["content"][:128]).encode("utf-8")
        ).hexdigest()[:16]

        # 即使理論上不會發生碰撞，仍防禦性地檢查（Vectorize 以 id 做 upsert）
        if chunk_id in seen_ids:
            chunk_id = chunk_id + f"_{idx}"
            dupe_count += 1
        seen_ids.add(chunk_id)

        record = {
            "id": chunk_id,
            "values": embedding.tolist(),        # float32 → Python list
            "metadata": {
                "content": chunk["content"],     # 查詢命中時返回的原始文字
                "source":  chunk["source"],      # 來源 PDF 檔名，供引用標注
            },
        }
        ndjson_lines.append(json.dumps(record, ensure_ascii=False))

    if dupe_count:
        print(f"⚠️  已修正 {dupe_count} 個重複 ID")

    # --- 寫出檔案 ---
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        f.write("\n".join(ndjson_lines))

    print(f"✅ 已輸出 {OUTPUT_FILE}（{len(ndjson_lines)} 筆向量）")
    print(f"   上傳指令：npx wrangler vectorize insert <INDEX_NAME> --file={OUTPUT_FILE}")


if __name__ == "__main__":
    main()