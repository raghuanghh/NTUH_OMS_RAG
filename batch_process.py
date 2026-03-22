import os
import json
import fitz  # 這就是我們剛剛安裝的 PyMuPDF 套件

# === 設定區塊 ===
PDF_FOLDER = "Reference_data" 
CHUNK_SIZE = 300 

def extract_text_from_pdf(file_path):
    """使用 PyMuPDF 擷取 PDF 文字"""
    text = ""
    try:
        doc = fitz.open(file_path)
        for page in doc:
            text += page.get_text()
        return text.strip()
    except Exception as e:
        print(f"❌ 讀取發生錯誤: {e}")
        return ""

def main():
    if not os.path.exists(PDF_FOLDER):
        print(f"找不到 {PDF_FOLDER} 資料夾！")
        return

    print(f"📂 準備讀取資料夾 '{PDF_FOLDER}' 內的所有 PDF 檔案...")
    all_chunks = []
    
    for filename in os.listdir(PDF_FOLDER):
        if filename.lower().endswith(".pdf"):
            file_path = os.path.join(PDF_FOLDER, filename)
            print(f"⏳ 正在處理: {filename} ...")
            
            # 💡 直接在本地端秒速萃取文字，不用再連線上網被擋！
            text = extract_text_from_pdf(file_path)
            
            if text:
                # 將長文章切分成 300 字的小區塊
                chunks = [text[i:i + CHUNK_SIZE] for i in range(0, len(text), CHUNK_SIZE)]
                for i, chunk in enumerate(chunks):
                    all_chunks.append({
                        "id": f"{filename.replace('.pdf', '')}_chunk_{i}",
                        "content": chunk,
                        "source": filename
                    })
                    
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