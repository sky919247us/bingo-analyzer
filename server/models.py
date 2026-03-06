"""
Pydantic 資料模型
定義台彩 API 回傳格式與內部使用的資料結構
"""
from pydantic import BaseModel


class BingoDraw(BaseModel):
    """單期賓果賓果開獎資料"""
    drawTerm: int
    """期數，如 115012874"""

    dDate: str
    """開獎時間，如 '2026-03-05T14:05:00'"""

    bigShowOrder: list[str]
    """由小到大排列的 20 顆開獎號碼"""

    openShowOrder: list[str]
    """實際開出順序的 20 顆號碼"""

    bullEye: str
    """超級獎號"""

    highLow: str
    """大小結果（大/小/－）"""

    oddEven: str
    """單雙結果（單/雙/－）"""


class LatestResponse(BaseModel):
    """最新開獎 API 回傳格式"""
    drawTerm: int
    dDate: str
    bigShowOrder: list[str]
    openShowOrder: list[str]
    superNumber: str
    highLow: str
    oddEven: str


class HistoryResponse(BaseModel):
    """歷史查詢 API 回傳格式"""
    totalSize: int
    draws: list[BingoDraw]


class ApiResponse(BaseModel):
    """統一 API 回應格式"""
    success: bool
    message: str | None = None
    data: dict | list | None = None
