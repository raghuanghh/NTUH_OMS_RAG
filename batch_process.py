"""
[Pipeline 第 1 步] batch_process.py
─────────────────────────────────────────────────────────────────────
用途：批次讀取 Reference_data/ 中所有 PDF，依頁數切批後送 OCR，
      將辨識結果（Markdown 文字）整理成 chunk 列表並儲存。

OCR 雙通道：
  1. Datalab Marker API（雲端，需 DATALAB_API_KEY，品質最佳）
  2. 本地 marker-pdf（免費，需 GPU/CPU，作為備援或主力）

輸入：Reference_data/ 中的 PDF 檔案
輸出：document_chunks.json（供 upload_prep.py 進行向量化）

使用方式：
    # 使用 Datalab API
    $env:DATALAB_API_KEY = "your_key"
    py -3.12 batch_process.py

    # 使用本地 Marker（免費）
    py -3.12 -m pip install marker-pdf
    py -3.12 batch_process.py          # 無 API Key 時會詢問是否用 Marker
─────────────────────────────────────────────────────────────────────
"""

import os
import re
import json
import time
import shutil
import tempfile
import requests
from pypdf import PdfReader, PdfWriter

# === 設定區塊 ===
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PDF_FOLDER = os.path.join(SCRIPT_DIR, "Reference_data")
OUTPUT_FILE = os.path.join(SCRIPT_DIR, "document_chunks.json")
PAGES_PER_BATCH = 100      # 單次切出並上傳的頁數（大型彩色 PDF 會由 MAX_FILE_MB 自動縮減）
MAX_FILE_MB = 30           # 單批切出的臨時 PDF 超過此大小時自動縮小
API_BASE = "https://www.datalab.to/api/v1"
POLL_INTERVAL = 10         # 輪詢間隔（秒）
POLL_TIMEOUT = 1800        # 最長等待時間（秒）
MAX_RETRIES = 3            # 單批次最大重試次數

# === 雙通道 OCR 設定 ===
# "auto"    → 優先 Datalab API，失敗時自動切換到 Marker 本地版
# "datalab" → 只用 Datalab API（需要 DATALAB_API_KEY）
# "marker"  → 只用本地 Marker（完全免費，需要 pip install marker-pdf）
OCR_ENGINE = "auto"

# === Marker 本地版 GPU 設定 ===
# "auto" → 自動偵測：CUDA > MPS（Apple Silicon）> CPU
# "cuda" → 強制使用 NVIDIA GPU（需安裝 CUDA 版 torch）
# "mps"  → 強制使用 Apple Silicon GPU
# "cpu"  → 強制使用 CPU（速度最慢，約 2~5 秒/頁）
MARKER_DEVICE = "cuda"

_marker_models = None   # Marker 模型快取（避免每批重新載入）
_datalab_ok    = None   # None=未測試, True=可用, False=已停用（一次失敗後全程略過）
_abort         = False  # 用戶選擇不繼續時設為 True，通知 main 停止迴圈


# ─────────────────────────────────────────────────────────────────────
# [工具函式] Windows 超長路徑處理
# ─────────────────────────────────────────────────────────────────────
def make_long_path(path: str) -> str:
    r"""Windows 超長路徑（>260 字元）加上 \\?\ 前綴"""
    if os.name == "nt" and not path.startswith("\\\\?\\"):
        return "\\\\?\\" + path
    return path



# ─────────────────────────────────────────────────────────────────────
# [PDF 頁面操作] 快速取頁數 / 切頁存暫存檔
# ─────────────────────────────────────────────────────────────────────
def get_page_count(file_path: str) -> int:
    """使用 pypdf 快速取得 PDF 頁數（不做 OCR）"""
    try:
        return len(PdfReader(file_path).pages)
    except Exception as e:
        print(f"   ⚠️ 無法取得頁數，將整份送出: {e}")
        return 0


def extract_pages_to_temp(src_path: str, page_start: int, page_end: int) -> tuple[str, int]:
    """
    從 src_path 抽出 page_start~page_end 頁，寫入暫存檔。
    若切出後超過 MAX_FILE_MB，迭代對半縮小範圍直到符合限制。
    單頁超大時直接接受（無法再縮小）。
    回傳 (暫存檔路徑, 實際結束頁碼) — actual_end 可能小於原本的 page_end。
    """
    reader = PdfReader(src_path)
    actual_end = min(page_end, len(reader.pages) - 1)  # 不超出 PDF 實際頁數

    while True:
        writer = PdfWriter()
        for i in range(page_start, actual_end + 1):
            writer.add_page(reader.pages[i])

        tmp = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False)
        tmp.close()
        try:
            with open(tmp.name, "wb") as f:
                writer.write(f)
        except Exception:
            os.unlink(tmp.name)
            raise

        size_mb = os.path.getsize(tmp.name) / (1024 * 1024)
        if size_mb <= MAX_FILE_MB or actual_end <= page_start:
            # 已在限制內，或已縮到單頁（無法再縮小，直接接受）
            return tmp.name, actual_end

        # 仍超大：縮小範圍後重試（清除本次暫存）
        os.unlink(tmp.name)
        actual_end = (page_start + actual_end) // 2



# ─────────────────────────────────────────────────────────────────────
# [OCR 通道 1] Datalab Marker API（雲端，需 DATALAB_API_KEY）
# ─────────────────────────────────────────────────────────────────────
def _fetch_chunks_datalab(tmp_file: str, page_start: int, page_end: int, api_key: str) -> list[dict]:
    """
    上傳已切出的暫存 PDF（tmp_file）給 Datalab Marker API，回傳 chunk 列表。
    tmp_file 只包含 page_start~page_end 的頁面，上傳時不帶 page_range 參數。
    401/403 驗證失敗時立即設定全域旗標，後續批次不再嘗試 Datalab。
    """
    global _datalab_ok, OCR_ENGINE, _abort
    headers = {"X-Api-Key": api_key}

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            with open(tmp_file, "rb") as f:
                resp = requests.post(
                    f"{API_BASE}/marker",
                    headers=headers,
                    files={"file": (f"batch_{page_start}_{page_end}.pdf", f, "application/pdf")},
                    data={
                        "mode": "accurate",
                        "output_format": "chunks",
                        "disable_image_extraction": "true",
                    },
                    timeout=120,
                )
        except Exception as e:
            print(f"      ❌ 送出失敗（第 {page_start + 1}–{page_end + 1} 頁，第 {attempt} 次）: {e}")
            if attempt < MAX_RETRIES:
                time.sleep(15)
                continue
            return []

        # 驗證失敗：立即停用 Datalab，不重試
        if resp.status_code in (401, 403):
            print(f"      ❌ Datalab API Key 驗證失敗（{resp.status_code}），後續所有批次將改用 Marker 本地版")
            _datalab_ok = False
            # auto 模式才詢問；datalab 模式直接放棄並中止（無 fallback）
            if OCR_ENGINE == "auto":
                if not _ask_use_marker():
                    # 用戶選 n 或 marker 未安裝 → 設旗標讓後續全部停止
                    OCR_ENGINE = "disabled"
                    _abort = True
            else:  # OCR_ENGINE == "datalab"
                print("      ❌ OCR_ENGINE=datalab 但 API Key 無效，無法繼續，請修正 API Key 或改用 marker 模式")
                _abort = True
            return []

        if resp.status_code == 413:
            print(f"      ❌ 413 Payload Too Large（第 {page_start + 1}–{page_end + 1} 頁），檔案仍過大，請降低 PAGES_PER_BATCH 或 MAX_FILE_MB")
            return []

        try:
            resp.raise_for_status()
            initial = resp.json()
        except Exception as e:
            print(f"      ❌ API 錯誤（第 {page_start + 1}–{page_end + 1} 頁，第 {attempt} 次）: {e}")
            if attempt < MAX_RETRIES:
                time.sleep(15)
                continue
            return []

        check_url = initial.get("request_check_url")
        if not check_url:
            print(f"      ❌ 回應中沒有 request_check_url: {initial}")
            if attempt < MAX_RETRIES:
                time.sleep(15)
                continue
            return []

        # 輪詢直到完成
        elapsed = 0
        while elapsed < POLL_TIMEOUT:
            time.sleep(POLL_INTERVAL)
            elapsed += POLL_INTERVAL
            try:
                poll = requests.get(check_url, headers=headers, timeout=30).json()
            except Exception as e:
                print(f"      ⚠️ 輪詢失敗，重試中: {e}")
                continue

            status = poll.get("status", "")
            if status == "complete":
                chunks = poll.get("chunks") or []
                score = poll.get("parse_quality_score") or 0
                print(f"      📄 第 {page_start + 1}–{page_end + 1} 頁 (Datalab) → 品質: {score:.1f}/5.0，{len(chunks)} 個 chunk")
                return chunks
            elif status == "error":
                print(f"      ❌ 解析失敗（第 {page_start + 1}–{page_end + 1} 頁，第 {attempt} 次）: {poll.get('error')}")
                break
        else:
            print(f"      ⏰ 等待逾時（第 {page_start + 1}–{page_end + 1} 頁，第 {attempt} 次）")

        if attempt < MAX_RETRIES:
            print(f"      🔄 15 秒後重試...")
            time.sleep(15)

    return []



# ─────────────────────────────────────────────────────────────────────
# [OCR 通道 2] 本地 Marker（免費，需 pip install marker-pdf + GPU/CPU）
# ─────────────────────────────────────────────────────────────────────
def _get_marker_device() -> str:
    """
    偵測可用運算裝置（CUDA > MPS > CPU），或依 MARKER_DEVICE 強制指定。
    同時設定 TORCH_DEVICE 環境變數（Marker 新版用此變數決定裝置）。
    """
    if MARKER_DEVICE != "auto":
        os.environ["TORCH_DEVICE"] = MARKER_DEVICE
        print(f"   🖥️  強制使用裝置：{MARKER_DEVICE}（MARKER_DEVICE 設定值）")
        return MARKER_DEVICE

    try:
        import torch
        # 印出 torch 版本與編譯時的 CUDA 版本（用於診斷）
        cuda_built = torch.version.cuda or "無（CPU-only 版本）"
        print(f"   ℹ️  PyTorch {torch.__version__}，編譯 CUDA 版本：{cuda_built}")

        if torch.cuda.is_available():
            gpu_name = torch.cuda.get_device_name(0)
            print(f"   🖥️  偵測到 NVIDIA GPU：{gpu_name}，使用 CUDA 加速")
            os.environ["TORCH_DEVICE"] = "cuda"
            return "cuda"
        else:
            if cuda_built == "無（CPU-only 版本）":
                print("   ⚠️  PyTorch 為 CPU-only 版本，無法使用 GPU。")
                print("       請重新安裝 CUDA 版：pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121")
            else:
                print(f"   ⚠️  PyTorch 已含 CUDA {cuda_built}，但偵測不到 GPU。")
                print("       請確認：①驅動是否安裝（nvidia-smi）②是否有其他程式佔用 GPU 記憶體")
            print("       若確定有 GPU，可在 batch_process.py 頂部設定：MARKER_DEVICE = \"cuda\"")

        try:
            if torch.backends.mps.is_available():
                print("   🖥️  偵測到 Apple Silicon，使用 MPS 加速")
                os.environ["TORCH_DEVICE"] = "mps"
                return "mps"
        except AttributeError:
            pass

    except ImportError:
        print("   ⚠️  torch 未安裝，Marker 將使用預設裝置（通常為 CPU）")

    print("   🖥️  使用 CPU（速度約 2~5 秒/頁）")
    os.environ["TORCH_DEVICE"] = "cpu"
    return "cpu"


def _fetch_chunks_marker_local(tmp_file: str, page_start: int, page_end: int) -> list[dict]:
    """
    使用本地 Marker 解析已切出的暫存 PDF（完全免費，需要 pip install marker-pdf）。
    回傳以 Markdown 標題拆分的 chunk 列表，格式與 Datalab 回傳相容。
    GPU 加速：自動偵測 CUDA / MPS，或依 MARKER_DEVICE 設定指定。
    """
    global _marker_models
    try:
        from marker.converters.pdf import PdfConverter
        from marker.models import create_model_dict
        from marker.output import text_from_rendered
    except ImportError:
        print("      ❌ Marker 未安裝，請執行: pip install marker-pdf")
        return []

    try:
        if _marker_models is None:
            device = _get_marker_device()
            print(f"   🔄 載入 Marker 本地模型（device={device}，首次載入需 30~60 秒）...")
            try:
                _marker_models = create_model_dict(device=device)
            except TypeError:
                # 舊版 marker-pdf 不接受 device 參數，依賴 torch 自動偵測
                _marker_models = create_model_dict()
            print("   ✅ Marker 模型載入完成")

        converter = PdfConverter(artifact_dict=_marker_models)
        rendered = converter(tmp_file)
        text, _, _ = text_from_rendered(rendered)
    except Exception as e:
        print(f"      ❌ Marker 本地解析失敗: {e}")
        return []

    if not text.strip():
        return []

    # 依 Markdown 標題（h1/h2/h3）或雙換行分割成語意 chunk
    sections = re.split(r'\n(?=#{1,3} )', text.strip())
    chunks = [{"markdown": s.strip(), "text": s.strip()} for s in sections if s.strip()]
    print(f"      📄 第 {page_start + 1}–{page_end + 1} 頁 (Marker本地) → {len(chunks)} 個 chunk")
    return chunks



# ─────────────────────────────────────────────────────────────────────
# [雙通道分派器] 依引擎設定路由至 Datalab 或 Marker
# ─────────────────────────────────────────────────────────────────────
def fetch_chunks(tmp_file: str, page_start: int, page_end: int, api_key: str | None) -> list[dict]:
    """
    雙通道 OCR 分派：
    - OCR_ENGINE="auto"     → 優先 Datalab（首次 401/403 後詢問用戶），否則直接 Marker
    - OCR_ENGINE="datalab"  → 只用 Datalab API
    - OCR_ENGINE="marker"   → 只用 Marker 本地版（完全免費）
    - OCR_ENGINE="disabled" → 用戶中止，直接回傳空串列
    _datalab_ok 旗標：None=未試過, True=可用, False=已停用（一旦 401/403 永久略過）
    """
    global _datalab_ok

    if OCR_ENGINE == "disabled" or _abort:
        return []

    if OCR_ENGINE in ("auto", "datalab") and api_key and _datalab_ok is not False:
        result = _fetch_chunks_datalab(tmp_file, page_start, page_end, api_key)
        # 只要 Datalab 沒有 401/403（_datalab_ok 未被設為 False），即視為可用
        if _datalab_ok is not False and not _abort:
            _datalab_ok = True
        if result:
            return result
        if OCR_ENGINE in ("datalab", "disabled"):
            return []
        if not _abort:
            # 非驗證失敗（超時、網路、空結果等），本次切換 Marker，下次還會再試 Datalab
            print(f"      🔄 Datalab 未回傳內容，切換至 Marker 本地版...")

    if OCR_ENGINE in ("auto", "marker") and not _abort:
        return _fetch_chunks_marker_local(tmp_file, page_start, page_end)

    return []



# ─────────────────────────────────────────────────────────────────────
# [主要處理函式] 單一 PDF → 切頁批次 OCR → chunk 列表
# ─────────────────────────────────────────────────────────────────────
def process_pdf(file_path: str, filename: str, api_key: str | None) -> list[dict]:
    """把 PDF 切成小檔分批 OCR（雙通道：Datalab API 或 Marker 本地版），收集所有 chunk 並加上 source metadata"""
    total_pages = get_page_count(file_path)
    file_mb = os.path.getsize(file_path) / (1024 * 1024)
    print(f"   📁 檔案大小: {file_mb:.1f} MB")
    raw_chunks = []

    if total_pages == 0:
        # 無法取得頁數，整份直接上傳
        tmp = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False)
        tmp.close()
        try:
            shutil.copy2(file_path, tmp.name)
            raw_chunks = fetch_chunks(tmp.name, 0, 0, api_key)
        finally:
            if os.path.exists(tmp.name):
                os.unlink(tmp.name)
    else:
        # 計算每批頁數：若檔案較小可用 PAGES_PER_BATCH，較大時按比例縮小
        pages_per_batch = max(1, min(PAGES_PER_BATCH, int(PAGES_PER_BATCH * MAX_FILE_MB / max(file_mb, 1))))
        num_batches = -(-total_pages // pages_per_batch)
        print(f"   📑 共 {total_pages} 頁，每批約 {pages_per_batch} 頁，共 {num_batches} 批")
        start = 0
        while start < total_pages:
            if _abort:
                break
            end = min(start + pages_per_batch - 1, total_pages - 1)
            print(f"      ✂️ 切出第 {start + 1}–{end + 1} 頁...")
            tmp_path, actual_end = extract_pages_to_temp(file_path, start, end)
            tmp_mb = os.path.getsize(tmp_path) / (1024 * 1024)
            if actual_end < end:
                print(f"         暫存檔大小: {tmp_mb:.1f} MB（縮減至第 {start + 1}–{actual_end + 1} 頁）")
            else:
                print(f"         暫存檔大小: {tmp_mb:.1f} MB")
            try:
                raw_chunks.extend(fetch_chunks(tmp_path, start, actual_end, api_key))
            finally:
                os.unlink(tmp_path)
            start = actual_end + 1  # 從實際結束頁的下一頁繼續，不跳過任何頁

    all_chunks = []
    base = filename.replace(".pdf", "")
    for i, chunk in enumerate(raw_chunks):
        if isinstance(chunk, str):
            content = chunk
        else:
            content = (
                chunk.get("markdown")
                or chunk.get("text")
                or chunk.get("html")
                or ""
            )
        if content:
            all_chunks.append({
                "id": f"{base}_c{i}",
                "content": content,
                "source": filename,
            })
    return all_chunks



# ─────────────────────────────────────────────────────────────────────
# [互動輔助] Marker 安裝檢查 / 詢問用戶是否切換引擎
# ─────────────────────────────────────────────────────────────────────
def _check_marker_available() -> bool:
    """檢查 marker-pdf 是否已安裝"""
    try:
        import marker  # noqa: F401
        return True
    except ImportError:
        return False


def _ask_use_marker() -> bool:
    """
    詢問用戶是否改用 Marker 本地版。
    - y → 確認 marker 是否已安裝，未安裝則提示指令後返回 False（讓 main 退出）
    - n → 返回 False（main 將退出）
    """
    print()
    print("=" * 60)
    print("  Datalab API 無法使用（Key 無效或未設定）")
    print("  是否改用本地 Marker OCR？（免費，需 GPU/CPU 本機運算）")
    print("=" * 60)
    while True:
        ans = input("  使用 Marker？[y/n]: ").strip().lower()
        if ans in ("y", "n"):
            break
        print("  請輸入 y 或 n")

    if ans == "n":
        print("❌ 已取消，退出。")
        return False

    # 回答 y，檢查是否已安裝
    if _check_marker_available():
        print("✅ 偵測到 marker-pdf，將使用本地 Marker 繼續執行。")
        return True
    else:
        print()
        print("❌ 未偵測到 marker-pdf，請先安裝：")
        print()
        print("   py -3.12 -m pip install marker-pdf")
        print()
        print("安裝完成後重新執行 batch_process.py")
        return False



# ─────────────────────────────────────────────────────────────────────
# [主程式] 引擎初始化 → 掃描 Reference_data/ → 逐檔處理 → 輸出 JSON
# ─────────────────────────────────────────────────────────────────────
def main():
    global OCR_ENGINE, _datalab_ok, _abort

    api_key = os.environ.get("DATALAB_API_KEY")

    # === 決定使用哪個引擎 ===
    if OCR_ENGINE == "datalab":
        if not api_key:
            print("❌ OCR_ENGINE='datalab' 需要設定環境變數 DATALAB_API_KEY")
            print("   PowerShell: $env:DATALAB_API_KEY = \"your_api_key_here\"")
            return
        print("🔑 使用 Datalab API（引擎: datalab）")

    elif OCR_ENGINE == "marker":
        print("🖥️  使用 Marker 本地版 OCR（完全免費）")
        if not _check_marker_available():
            print("❌ 未偵測到 marker-pdf，請先安裝：py -3.12 -m pip install marker-pdf")
            return

    elif OCR_ENGINE == "auto":
        if not api_key:
            print("⚠️  未設定 DATALAB_API_KEY")
            if not _ask_use_marker():
                return
            OCR_ENGINE = "marker"
        else:
            print("🔑 使用 Datalab API（引擎: auto，失敗自動切換 Marker）")

    if not os.path.exists(PDF_FOLDER):
        print(f"找不到 {PDF_FOLDER} 資料夾！")
        return

    # 載入既有 chunks，支援斷點續跑
    if os.path.exists(OUTPUT_FILE):
        try:
            with open(OUTPUT_FILE, "r", encoding="utf-8") as f:
                all_chunks = json.load(f)
            done_sources = {c["source"] for c in all_chunks}
            print(f"📂 載入已有 {len(all_chunks)} 個 chunk，已完成 {len(done_sources)} 個檔案，將略過已處理的 PDF...")
        except (json.JSONDecodeError, KeyError) as e:
            print(f"⚠️  {OUTPUT_FILE} 讀取失敗（{e}），將重新開始（舊檔已備份為 .bak）")
            os.replace(OUTPUT_FILE, OUTPUT_FILE + ".bak")
            all_chunks = []
            done_sources = set()
    else:
        all_chunks = []
        done_sources = set()
        print(f"📂 全新開始，準備處理 '{PDF_FOLDER}' 內的所有 PDF...")

    for filename in sorted(os.listdir(PDF_FOLDER)):
        if _abort:
            print("\n❌ 處理已中止（用戶取消或 Marker 未安裝）")
            break

        if not filename.lower().endswith(".pdf"):
            continue

        if filename in done_sources:
            print(f"\n⏩ 已完成，略過: {filename}")
            continue

        file_path = make_long_path(os.path.join(PDF_FOLDER, filename))

        print(f"\n⏳ 正在處理: {filename} ...")

        chunks = process_pdf(file_path, filename, api_key)
        if chunks:
            all_chunks.extend(chunks)
            # 每處理完一個檔案就存檔，避免中途中斷丟失進度
            with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
                json.dump(all_chunks, f, ensure_ascii=False, indent=2)
            print(f"   ✅ 共取得 {len(chunks)} 個區塊（累計 {len(all_chunks)} 個）")
        else:
            print("   ⚠️ 未能取得內容，略過此檔案")

    if _abort:
        print(f"\n⚠️  已中止處理。已完成 {len(all_chunks)} 個文字區塊，已輸出 {OUTPUT_FILE}")
    else:
        print(f"\n✅ 全部完成！共 {len(all_chunks)} 個文字區塊，已輸出 {OUTPUT_FILE}")


if __name__ == "__main__":
    main()