"""
REST routes for Symbol Alert Service (manual testing).
"""

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.services.alert_dispatcher import dispatch_alert

router = APIRouter(prefix="/api/alerts", tags=["Alerts"])


class ManualAlertRequest(BaseModel):
    symbol: str = Field(..., description="Trading symbol, e.g. BTCUSDT")
    sentiment: float = Field(..., ge=-1, le=1, description="Sentiment score")
    title: str = Field("Manual test alert", description="Alert title")
    reason: str = Field("Triggered manually via API", description="Reason")


@router.post("/trigger")
async def trigger_alert(req: ManualAlertRequest):
    """Manually trigger an alert for testing."""
    notified_count = await dispatch_alert(
        symbol=req.symbol,
        sentiment=req.sentiment,
        title=req.title,
        reason=req.reason,
    )
    return {"status": "dispatched", "symbol": req.symbol, "notified_count": notified_count}
