"""
[診斷工具] check_pdfs.py
─────────────────────────────────────────────────────────────────────
用途：掃描 Reference_data/ 中所有 PDF 檔案，報告：
      ① 檔案大小（MB）② 頁數 ③ 是否含可萃取文字層（或為掃描版）
      ④ 損毀/無法讀取的 PDF 標記為錯誤

建議在執行 batch_process.py 前先跑此工具，確認所有 PDF 狀態正常。

輸入：Reference_data/ 資料夾中的 PDF 檔案
輸出：終端機印出診斷表（不寫入任何檔案）

使用方式：
    py -3.12 check_pdfs.py
─────────────────────────────────────────────────────────────────────
"""

import os
from pypdf import PdfReader

# === 設定 ===
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))


def main():
    folder = os.path.join(SCRIPT_DIR, "Reference_data")

    # === 掃描並輸出 ===
    print(f"{'狀態':<5} {'大小':>8} {'頁數':>6}  {'檔案名稱'}")
    print("-" * 80)

    ok_count = 0
    err_count = 0

    for fname in sorted(os.listdir(folder)):
        if not fname.lower().endswith(".pdf"):
            continue
        fpath = os.path.join(folder, fname)
        size_mb = os.path.getsize(fpath) / (1024 * 1024)
        try:
            r = PdfReader(fpath)
            pages = len(r.pages)
            # 嘗試讀取第一頁文字，判斷是否有文字層（或純掃描版）
            try:
                first_text = r.pages[0].extract_text() or ""
                has_text = "有文字層" if first_text.strip() else "無文字層（掃描版，需 OCR）"
            except Exception as e2:
                has_text = f"文字讀取失敗: {e2}"
            print(f"✅    {size_mb:>7.1f}MB  {pages:>5}p  {fname}")
            print(f"       └─ {has_text}")
            ok_count += 1
        except Exception as e:
            print(f"❌    {size_mb:>7.1f}MB  {'ERR':>5}   {fname}")
            print(f"       └─ 錯誤: {e}")
            err_count += 1

    print("-" * 80)
    print(f"\n共 {ok_count + err_count} 個 PDF：✅ {ok_count} 個正常，❌ {err_count} 個異常")


if __name__ == "__main__":
    main()
