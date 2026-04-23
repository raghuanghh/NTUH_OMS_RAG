import os
import json
import fitz  # PyMuPDF，僅用於取得頁數（不做 OCR）
from datalab_sdk import DatalabClient, ConvertOptions

# === 設定區塊 ===
PDF_FOLDER = "Reference_data"
CHUNK_SIZE = 300       # 最終文字切片大小（字元數）
PAGES_PER_BATCH = 50   # Chandra 每次呼叫處理的頁數上限

def get_page_count(file_path: str) -> int:
    """使用 PyMuPDF 快速取得 PDF 頁數（不做 OCR）"""
    try:
        doc = fitz.open(file_path)
        return len(doc)
    except Exception as e:
        print(f"   ⚠️ 無法取得頁數，將嘗試整份送出: {e}")
        return 0

def extract_text_with_chandra(file_path: str, page_start: int, page_end: int) -> str:
    """
    使用 Chandra OCR 2 解析指定頁範圍（0-indexed）
    例如 page_start=0, page_end=49 → page_range="0-49"
    """
    client = DatalabClient()
    try:
        page_range = f"{page_start}-{page_end}"
        options = ConvertOptions(
            mode="accurate",
            output_format="markdown",
            page_range=page_range,
            disable_image_extraction=True,
        )
        result = client.convert(file_path, options=options)
        score = result.parse_quality_score or 0
        print(f"   📄 第 {page_start+1}–{page_end+1} 頁 → 品質分數: {score:.1f}/5.0")
        return result.markdown or ""
    except Exception as e:
        print(f"   ❌ 第 {page_start+1}–{page_end+1} 頁解析失敗: {e}")
        return ""

def process_pdf(file_path: str) -> str:
    """
    自動偵測 PDF 頁數，按 PAGES_PER_BATCH 分批送 Chandra 解析，
    合併所有批次的 Markdown 文字後回傳。
    """
    total_pages = get_page_count(file_path)

    if total_pages == 0:
        # 無法取得頁數，整份送出（讓 API 自行決定）
        return extract_text_with_chandra(file_path, 0, 9999)

    print(f"   📑 共 {total_pages} 頁，每批 {PAGES_PER_BATCH} 頁，"
          f"共 {-(-total_pages // PAGES_PER_BATCH)} 批")

    all_text_parts = []
    for batch_start in range(0, total_pages, PAGES_PER_BATCH):
        batch_end = min(batch_start + PAGES_PER_BATCH - 1, total_pages - 1)
        text = extract_text_with_chandra(file_path, batch_start, batch_end)
        if text:
            all_text_parts.append(text)

    return "\n\n".join(all_text_parts)

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

    for filename in sorted(os.listdir(PDF_FOLDER)):
        if not filename.lower().endswith(".pdf"):
            continue

        file_path = os.path.join(PDF_FOLDER, filename)
        print(f"\n⏳ 正在處理: {filename} ...")

        text = process_pdf(file_path)

        if text:
            chunks = [text[i:i + CHUNK_SIZE] for i in range(0, len(text), CHUNK_SIZE)]
            base_name = filename.replace(".pdf", "")
            for i, chunk in enumerate(chunks):
                all_chunks.append({
                    "id": f"{base_name}_chunk_{i}",
                    "content": chunk,
                    "source": filename
                })
            print(f"   ✅ 切出 {len(chunks)} 個區塊")
        else:
            print(f"   ⚠️ 未能取得文字，略過此檔案")

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