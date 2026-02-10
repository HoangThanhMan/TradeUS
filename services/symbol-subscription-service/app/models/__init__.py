"""
Pydantic models / schemas for subscriptions.
"""

from datetime import datetime, timezone
from typing import Optional

from pydantic import BaseModel, Field


class SubscriptionCreate(BaseModel):
    """Request body to subscribe to a symbol."""
    user_id: str = Field(..., description="User ID")
    symbol: str = Field(..., description="Trading symbol, e.g. BTCUSDT")


class SubscriptionResponse(BaseModel):
    """Single subscription record."""
    id: str = Field(..., alias="_id")
    user_id: str
    symbol: str
    created_at: datetime

    class Config:
        populate_by_name = True


class SubscriptionListResponse(BaseModel):
    """List of subscriptions."""
    subscriptions: list[SubscriptionResponse]
    total: int
