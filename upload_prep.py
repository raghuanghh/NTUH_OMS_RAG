import json
from sentence_transformers import SentenceTransformer

# 💡 關鍵：我們在這裡使用與 Cloudflare 雲端完全相同的開源模型，確保無縫接軌！
model = SentenceTransformer('BAAI/bge-base-en-v1.5')

def main():
    print("📂 讀取 document_chunks.json 中...")
    with open("document_chunks.json", "r", encoding="utf-8") as f:
        chunks = json.load(f)

    print(f"⏳ 開始將 {len(chunks)} 筆文字轉換為向量 (這會花幾分鐘，請喝口水稍候)...")
    texts = [chunk["content"] for chunk in chunks]
    
    # 批次轉換，加快速度
    embeddings = model.encode(texts, batch_size=32, show_progress_bar=True)

    print("📦 正在打包成 Cloudflare 上傳格式 (NDJSON)...")
    ndjson_data = []
    for i, chunk in enumerate(chunks):
        record = {
            "id": f"vec_{i}",
            "values": embeddings[i].tolist(), # 轉成數學陣列
            "metadata": {
                "content": chunk["content"],
                "source": chunk["source"]
            }
        }
        # Cloudflare 要求每一行都是一個獨立的 JSON
        ndjson_data.append(json.dumps(record, ensure_ascii=False))

    with open("vectorize_upload.ndjson", "w", encoding="utf-8") as f:
        f.write("\n".join(ndjson_data))

    print("✅ 已生成 vectorize_upload.ndjson，準備上傳！")

if __name__ == "__main__":
    main()