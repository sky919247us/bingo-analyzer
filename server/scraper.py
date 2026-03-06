"""
台灣彩券賓果賓果爬蟲模組
負責從台彩 API 抓取最新開獎與歷史資料，並增量更新 CSV
"""
import csv
import logging
from datetime import datetime, timedelta
from pathlib import Path

import httpx

from config import (
    TLC_LATEST_URL,
    TLC_HISTORY_URL,
    TLC_HEADERS,
    CSV_DATA_DIR,
    HISTORY_PAGE_SIZE,
)

logger = logging.getLogger(__name__)


async def fetch_latest() -> dict | None:
    """
    取得最新一期賓果賓果開獎結果
    Returns: 解析後的開獎資料 dict，失敗回傳 None
    """
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(TLC_LATEST_URL, headers=TLC_HEADERS)
            resp.raise_for_status()
            data = resp.json()

        if data.get("rtCode") != 0:
            logger.warning("台彩 API 回傳異常: %s", data.get("rtMsg"))
            return None

        post = data["content"]["lotteryBingoLatestPost"]

        return {
            "drawTerm": post["drawTerm"],
            "dDate": post["dDate"],
            "bigShowOrder": post["bigShowOrder"],
            "openShowOrder": post["openShowOrder"],
            "superNumber": post["prizeNum"]["bullEye"],
            "highLow": post["prizeNum"]["highLow"],
            "oddEven": post["prizeNum"]["oddEven"],
        }
    except Exception as e:
        logger.error("取得最新開獎失敗: %s", e)
        return None


async def fetch_history(date: str, page: int = 1, size: int = HISTORY_PAGE_SIZE) -> dict | None:
    """
    查詢指定日期的歷史開獎資料

    Args:
        date: 查詢日期，格式 YYYY-MM-DD
        page: 頁碼
        size: 每頁筆數（最大 50）
    Returns: 包含 totalSize 與 draws 的 dict
    """
    try:
        params = {"openDate": date, "pageNum": page, "pageSize": size}
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(TLC_HISTORY_URL, params=params, headers=TLC_HEADERS)
            resp.raise_for_status()
            data = resp.json()

        if data.get("rtCode") != 0:
            logger.warning("歷史查詢 API 回傳異常: %s", data.get("rtMsg"))
            return None

        content = data["content"]
        draws = []
        for item in content.get("bingoQueryResult", []):
            draws.append({
                "drawTerm": item["drawTerm"],
                "dDate": item.get("dDate", ""),
                "bigShowOrder": item["bigShowOrder"],
                "openShowOrder": item["openShowOrder"],
                "superNumber": item.get("bullEyeTop", ""),
                "highLow": item.get("highLowTop", "－"),
                "oddEven": item.get("oddEvenTop", "－"),
            })

        return {
            "totalSize": content.get("totalSize", 0),
            "draws": draws,
        }
    except Exception as e:
        logger.error("歷史查詢失敗 (date=%s): %s", date, e)
        return None


async def fetch_all_draws_for_date(date: str) -> list[dict]:
    """
    取得指定日期的所有期次資料（自動翻頁）
    """
    all_draws: list[dict] = []
    page = 1

    while True:
        result = await fetch_history(date, page=page, size=HISTORY_PAGE_SIZE)
        if not result or not result["draws"]:
            break

        all_draws.extend(result["draws"])

        # 如果已取到所有資料就停止
        if len(all_draws) >= result["totalSize"]:
            break

        page += 1

    return all_draws


def _get_csv_path(year: int) -> Path:
    """取得指定年份的 CSV 檔案路徑"""
    return CSV_DATA_DIR / f"賓果賓果_{year}.csv"


def _read_existing_terms(csv_path: Path) -> set[int]:
    """讀取 CSV 檔中已存在的期數（避免重複寫入）"""
    terms: set[int] = set()
    if not csv_path.exists():
        return terms

    try:
        with open(csv_path, "r", encoding="utf-8-sig") as f:
            reader = csv.reader(f)
            next(reader, None)  # 跳過表頭
            for row in reader:
                if len(row) >= 2 and row[1].strip():
                    try:
                        terms.add(int(row[1].strip()))
                    except ValueError:
                        continue
    except Exception as e:
        logger.warning("讀取 CSV 失敗 (%s): %s", csv_path, e)

    return terms


def _draw_to_csv_row(draw: dict, date_str: str) -> list[str]:
    """
    將 API 回傳的 draw dict 轉為 CSV 行格式
    與現有 CSV 格式保持一致：
    遊戲名稱, 期別, 開獎日期, 銷售金額, 銷售注數, 總獎金,
    開獎號碼(20欄), 超級獎號, 猜大小, 猜單雙
    """
    numbers = draw["bigShowOrder"]

    # 銷售金額等欄位可能不可用，用空字串填充
    row = [
        "賓果賓果",
        str(draw["drawTerm"]),
        date_str,
        "",  # 銷售金額
        "",  # 銷售注數
        "",  # 總獎金
    ]

    # 20 個開獎號碼
    for n in numbers:
        row.append(str(int(n)))  # 去掉前導零

    # 超級獎號
    super_num = draw.get("superNumber", "")
    row.append(str(int(super_num)) if super_num and super_num != "－" else "")

    # 猜大小、猜單雙
    row.append(draw.get("highLow", "－"))
    row.append(draw.get("oddEven", "－"))

    return row


CSV_HEADER = [
    "遊戲名稱", "期別", "開獎日期",
    "銷售金額", "銷售注數", "總獎金",
    *[f"號碼{i}" for i in range(1, 21)],
    "超級獎號", "猜大小", "猜單雙",
]


async def update_csv_for_date(date: str) -> int:
    """
    抓取指定日期的所有開獎資料並增量寫入對應年份的 CSV

    Args:
        date: 格式 YYYY-MM-DD
    Returns: 新增的筆數
    """
    # 解析年份
    dt = datetime.strptime(date, "%Y-%m-%d")
    year = dt.year

    # 格式化日期為 CSV 中的格式
    date_str = f"{year}/{dt.month:02d}/{dt.day:02d}"

    csv_path = _get_csv_path(year)

    # 確保目錄存在
    csv_path.parent.mkdir(parents=True, exist_ok=True)

    # 讀取已存在的期數
    existing_terms = _read_existing_terms(csv_path)

    # 抓取該日所有資料
    draws = await fetch_all_draws_for_date(date)

    # 篩選出尚未寫入的期數
    new_draws = [d for d in draws if d["drawTerm"] not in existing_terms]

    if not new_draws:
        logger.info("日期 %s: 無新增資料", date)
        return 0

    # 如果 CSV 不存在，先寫入表頭
    write_header = not csv_path.exists()

    with open(csv_path, "a", encoding="utf-8-sig", newline="") as f:
        writer = csv.writer(f)
        if write_header:
            writer.writerow(CSV_HEADER)

        for draw in new_draws:
            row = _draw_to_csv_row(draw, date_str)
            writer.writerow(row)

    logger.info("日期 %s: 新增 %d 期資料至 %s", date, len(new_draws), csv_path.name)
    return len(new_draws)


async def update_today() -> int:
    """更新今天的資料"""
    today = datetime.now().strftime("%Y-%m-%d")
    return await update_csv_for_date(today)


async def backfill_date_range(start_date: str, end_date: str) -> int:
    """
    批次回填指定日期範圍的歷史資料

    Args:
        start_date: 起始日期 YYYY-MM-DD
        end_date: 結束日期 YYYY-MM-DD
    Returns: 總新增筆數
    """
    start = datetime.strptime(start_date, "%Y-%m-%d")
    end = datetime.strptime(end_date, "%Y-%m-%d")

    total_new = 0
    current = start

    while current <= end:
        date_str = current.strftime("%Y-%m-%d")
        try:
            count = await update_csv_for_date(date_str)
            total_new += count
        except Exception as e:
            logger.error("回填日期 %s 失敗: %s", date_str, e)

        current += timedelta(days=1)

    logger.info("回填完成: %s ~ %s，共新增 %d 期", start_date, end_date, total_new)
    return total_new
