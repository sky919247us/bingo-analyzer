"""
設定模組
集中管理 API URL、更新間隔、CSV 路徑等設定
"""
import os
from pathlib import Path

# 台灣彩券 API 端點
TLC_API_BASE = "https://api.taiwanlottery.com/TLCAPIWeB/Lottery"
TLC_LATEST_URL = f"{TLC_API_BASE}/LatestBingoResult"
TLC_HISTORY_URL = f"{TLC_API_BASE}/BingoResult"

# 請求 Headers — 模擬來自官網的請求
TLC_HEADERS = {
    "Referer": "https://www.taiwanlottery.com/",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "application/json",
}

# CSV 資料目錄（指向前端 public/data/）
CSV_DATA_DIR = Path(os.getenv(
    "CSV_DATA_DIR",
    str(Path(__file__).parent.parent / "public" / "data")
))

# 自動更新間隔（秒）— 每 5 分鐘
SCRAPE_INTERVAL_SECONDS = int(os.getenv("SCRAPE_INTERVAL", "300"))

# 歷史查詢每頁筆數（台彩 API 最大 50）
HISTORY_PAGE_SIZE = 50

# FastAPI CORS — 允許的前端來源
CORS_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:5180",
    "http://localhost:3000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5180",
]

# 伺服器設定
SERVER_HOST = os.getenv("SERVER_HOST", "0.0.0.0")
SERVER_PORT = int(os.getenv("SERVER_PORT", "8888"))
