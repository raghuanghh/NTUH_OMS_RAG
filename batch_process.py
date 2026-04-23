import os
import json
from datalab_sdk import DatalabClient, ConvertOptions

# === 設定區塊 ===
PDF_FOLDER = "Reference_data"
CHUNK_SIZE = 300

def extract_text_with_chandra(file_path: str) -> str:
    """使用 Chandra OCR 2（Datalab API）萃取 PDF 文字，回傳 Markdown 格式純文字"""
    client = DatalabClient()
    try:
        options = ConvertOptions(
            mode="accurate",           # 最高精度模式，適合醫療文件
            output_format="markdown",
            disable_image_extraction=True,
        )
        result = client.convert(file_path, options=options)
        print(f"   📊 解析品質分數: {result.parse_quality_score:.1f}/5.0")
        return result.markdown or ""
    except Exception as e:
        print(f"❌ 讀取發生錯誤: {e}")
        return ""

def main():
    api_key = os.environ.get("DATALAB_API_KEY")
    if not api_key:
        print("❌ 請先設定環境變數 DATALAB_API_KEY")
        print("   export DATALAB_API_KEY=your_api_key_here")
        print("   API Key 取得：https://www.datalab.to/app/keys")
        return

    if not os.path.exists(PDF_FOLDER):
        print(f"找不到 {PDF_FOLDER} 資料夾！")
        return

    print(f"📂 準備讀取資料夾 '{PDF_FOLDER}' 內的所有 PDF 檔案...")
    all_chunks = []

    for filename in os.listdir(PDF_FOLDER):
        if filename.lower().endswith(".pdf"):
            file_path = os.path.join(PDF_FOLDER, filename)
            print(f"⏳ 正在處理: {filename} ...")

            text = extract_text_with_chandra(file_path)

            if text:
                # 將文字切分成 300 字的小區塊
                chunks = [text[i:i + CHUNK_SIZE] for i in range(0, len(text), CHUNK_SIZE)]
                for i, chunk in enumerate(chunks):
                    all_chunks.append({
                        "id": f"{filename.replace('.pdf', '')}_chunk_{i}",
                        "content": chunk,
                        "source": filename
                    })
                print(f"   ✅ 切出 {len(chunks)} 個區塊")

    if all_chunks:
        output_filename = "document_chunks.json"
        with open(output_filename, "w", encoding="utf-8") as f:
            json.dump(all_chunks, f, ensure_ascii=False, indent=2)
        print(f"\n✅ 處理完成！共萃取出 {len(all_chunks)} 個文字區塊。")
        print(f"已輸出 {output_filename}！")
    else:
        print("\n⚠️ 沒有產出內容。")

if __name__ == "__main__":
    main()