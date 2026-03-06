"""
FastAPI 應用入口
提供賓果賓果開獎資料的 REST API，並掛載排程自動更新
"""
import logging
from contextlib import asynccontextmanager
from datetime import datetime

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware

from config import CORS_ORIGINS, SCRAPE_INTERVAL_SECONDS, SERVER_HOST, SERVER_PORT
from models import ApiResponse
from scraper import fetch_latest, fetch_history, update_today, update_csv_for_date, backfill_date_range

# 日誌設定
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

# 排程器實例
scheduler = AsyncIOScheduler()


async def scheduled_update():
    """排程工作：自動更新今日資料"""
    logger.info("排程觸發：開始更新今日開獎資料...")
    try:
        count = await update_today()
        logger.info("排程完成：新增 %d 期資料", count)
    except Exception as e:
        logger.error("排程更新失敗: %s", e)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """應用生命週期管理：啟動時初始化排程"""
    logger.info("啟動排程器（間隔: %d 秒）", SCRAPE_INTERVAL_SECONDS)
    scheduler.add_job(
        scheduled_update,
        "interval",
        seconds=SCRAPE_INTERVAL_SECONDS,
        id="bingo_update",
        replace_existing=True,
    )
    scheduler.start()

    # 啟動時立即更新一次
    logger.info("伺服器啟動，立即執行一次資料更新...")
    await scheduled_update()

    yield

    # 關閉排程器
    scheduler.shutdown()
    logger.info("排程器已關閉")


# FastAPI 應用
app = FastAPI(
    title="賓果賓果爬蟲 API",
    description="台灣彩券賓果賓果開獎資料爬取與查詢服務",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS 中介層
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ========== API 路由 ==========

@app.get("/api/latest", response_model=ApiResponse)
async def get_latest():
    """取得最新一期賓果賓果開獎結果"""
    result = await fetch_latest()
    if result:
        return ApiResponse(success=True, data=result)
    return ApiResponse(success=False, message="無法取得最新開獎資料")


@app.get("/api/history", response_model=ApiResponse)
async def get_history(
    date: str = Query(
        default=None,
        description="查詢日期 (YYYY-MM-DD)，預設為今天",
    ),
    page: int = Query(default=1, ge=1, description="頁碼"),
    size: int = Query(default=50, ge=1, le=50, description="每頁筆數"),
):
    """查詢指定日期的歷史開獎資料"""
    if not date:
        date = datetime.now().strftime("%Y-%m-%d")

    result = await fetch_history(date, page, size)
    if result:
        return ApiResponse(success=True, data=result)
    return ApiResponse(success=False, message=f"無法取得 {date} 的歷史資料")


@app.post("/api/update", response_model=ApiResponse)
async def trigger_update(
    date: str = Query(
        default=None,
        description="更新日期 (YYYY-MM-DD)，預設為今天",
    ),
):
    """手動觸發指定日期的 CSV 更新"""
    if not date:
        date = datetime.now().strftime("%Y-%m-%d")

    count = await update_csv_for_date(date)
    return ApiResponse(
        success=True,
        message=f"已更新 {date}，新增 {count} 期",
        data={"date": date, "newCount": count},
    )


@app.post("/api/backfill", response_model=ApiResponse)
async def trigger_backfill(
    start: str = Query(description="起始日期 (YYYY-MM-DD)"),
    end: str = Query(description="結束日期 (YYYY-MM-DD)"),
):
    """批次回填指定日期範圍的歷史資料至 CSV"""
    count = await backfill_date_range(start, end)
    return ApiResponse(
        success=True,
        message=f"回填完成 {start} ~ {end}，共新增 {count} 期",
        data={"start": start, "end": end, "newCount": count},
    )


@app.get("/api/health")
async def health_check():
    """健康檢查"""
    return {"status": "ok", "timestamp": datetime.now().isoformat()}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host=SERVER_HOST, port=SERVER_PORT, reload=True)
