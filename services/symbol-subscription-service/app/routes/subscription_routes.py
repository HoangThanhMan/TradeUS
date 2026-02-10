"""
REST routes for Symbol Subscription management.
"""

import logging

from fastapi import APIRouter, HTTPException
from pymongo.errors import DuplicateKeyError

from app.models import SubscriptionCreate, SubscriptionResponse, SubscriptionListResponse
from app.repositories import SubscriptionRepository

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/subscriptions", tags=["Subscriptions"])


@router.post("/", status_code=201)
async def subscribe(req: SubscriptionCreate):
    """Subscribe a user to a symbol."""
    try:
        doc = await SubscriptionRepository.subscribe(req.user_id, req.symbol)
        return {"status": "subscribed", "subscription": doc}
    except DuplicateKeyError:
        raise HTTPException(status_code=409, detail="Already subscribed to this symbol")


@router.delete("/")
async def unsubscribe(user_id: str, symbol: str):
    """Unsubscribe a user from a symbol."""
    deleted = await SubscriptionRepository.unsubscribe(user_id, symbol)
    if not deleted:
        raise HTTPException(status_code=404, detail="Subscription not found")
    return {"status": "unsubscribed"}


@router.get("/user/{user_id}")
async def get_user_subscriptions(user_id: str):
    """Get all symbols a user is subscribed to."""
    docs = await SubscriptionRepository.get_user_subscriptions(user_id)
    return {"subscriptions": docs, "total": len(docs)}


@router.get("/symbol/{symbol}/subscribers")
async def get_symbol_subscribers(symbol: str):
    """Get all user IDs subscribed to a given symbol."""
    user_ids = await SubscriptionRepository.get_subscribers_by_symbol(symbol)
    return {"symbol": symbol.upper(), "subscribers": user_ids, "total": len(user_ids)}


@router.get("/check")
async def check_subscription(user_id: str, symbol: str):
    """Check if a user is subscribed to a symbol."""
    subscribed = await SubscriptionRepository.is_subscribed(user_id, symbol)
    return {"subscribed": subscribed}
