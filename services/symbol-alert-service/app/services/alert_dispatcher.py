"""
Alert dispatcher.

1. Queries Symbol Subscription Service for subscribers of the symbol.
2. Checks Redis cooldown for each subscriber.
3. Publishes email send requests to the Email Service via RabbitMQ.
"""

import json
import logging
from datetime import datetime, timezone

import httpx
from aio_pika import Message, DeliveryMode, ExchangeType

from app.config import settings
from app.rabbitmq.connection import RabbitMQConnection
from app.services.cooldown import is_on_cooldown, set_cooldown

logger = logging.getLogger(__name__)


# Cache for user email lookups to avoid repeated HTTP calls
_user_email_cache: dict[str, str] = {}


async def _get_user_email(user_id: str) -> str | None:
    """Lookup user email from User Service by user ID (internal endpoint, no JWT)."""
    if user_id in _user_email_cache:
        return _user_email_cache[user_id]

    url = f"{settings.user_service_url}/users/internal/{user_id}"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            data = resp.json()
            email = data.get("email")
            if email:
                _user_email_cache[user_id] = email
            return email
    except Exception as e:
        logger.error(f"Failed to lookup email for user {user_id}: {e}")
        return None


async def dispatch_alert(
    symbol: str,
    sentiment: float,
    title: str,
    reason: str,
    link: str = "",
) -> int:
    """
    Look up subscribers for `symbol`, apply cooldown, and send email requests.
    Returns the number of users notified.
    """
    # 1. Get subscribers from Subscription Service
    subscribers = await _get_subscribers(symbol)
    if not subscribers:
        logger.info(f"No subscribers for {symbol}, skipping alert")
        # Still publish alert event to ws-gateway for real-time display
        await _publish_alert_notification(symbol, sentiment, title, reason, 0, link)
        return 0

    logger.info(f"Found {len(subscribers)} subscriber(s) for {symbol}")

    # 2. For each subscriber, check cooldown and publish email
    sent_count = 0
    for user_id in subscribers:
        if await is_on_cooldown(user_id, symbol):
            logger.debug(f"User {user_id} on cooldown for {symbol}, skipping")
            continue

        # Lookup real email address from User Service
        email = await _get_user_email(user_id)
        if not email:
            logger.warning(f"Could not find email for user {user_id}, skipping")
            continue

        await _publish_email_request(email, user_id, symbol, sentiment, title, reason, link)
        await set_cooldown(user_id, symbol)
        sent_count += 1

    logger.info(f"Dispatched {sent_count} alert email(s) for {symbol}")

    # 3. Publish alert notification to ws-gateway via alert.exchange
    await _publish_alert_notification(symbol, sentiment, title, reason, sent_count, link)

    return sent_count


async def _get_subscribers(symbol: str) -> list[str]:
    """Call Subscription Service to get subscriber user IDs."""
    url = f"{settings.subscription_service_url}/api/subscriptions/symbol/{symbol.upper()}/subscribers"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            data = resp.json()
            return data.get("subscribers", [])
    except Exception as e:
        logger.error(f"Failed to fetch subscribers for {symbol}: {e}")
        return []


async def _publish_email_request(
    email: str,
    user_id: str,
    symbol: str,
    sentiment: float,
    title: str,
    reason: str,
    link: str = "",
) -> None:
    """Publish an email request message to the email exchange."""
    try:
        exchange = await RabbitMQConnection.declare_exchange(
            settings.email_exchange, ExchangeType.TOPIC, durable=True
        )

        sentiment_label = "TÍCH CỰC 📈" if sentiment > 0 else "TIÊU CỰC 📉"
        link_html = f'<p><b>Bài báo gốc:</b> <a href="{link}">{link}</a></p>' if link else ""
        email_body = (
            f"<h2>Cảnh báo {symbol}: {sentiment_label}</h2>"
            f"<p><b>Tiêu đề:</b> {title}</p>"
            f"<p><b>Phân tích:</b> {reason}</p>"
            f"<p><b>Điểm sentiment:</b> {sentiment:.2f}</p>"
            f"{link_html}"
            f"<hr><p><i>USTrading Alert System</i></p>"
        )

        payload = {
            "event": "email.send.alert",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "source": "symbol-alert-service",
            "data": {
                "to": email,
                "subject": f"[USTrading] {symbol} – {sentiment_label}",
                "body": email_body,
            },
        }

        msg = Message(
            body=json.dumps(payload).encode(),
            delivery_mode=DeliveryMode.PERSISTENT,
            content_type="application/json",
        )
        await exchange.publish(msg, routing_key=settings.email_routing_key)
        logger.info(f"Email request published for user {user_id} ({email}) (symbol={symbol})")

    except Exception as e:
        logger.error(f"Failed to publish email request: {e}")


async def _publish_alert_notification(
    symbol: str,
    sentiment: float,
    title: str,
    reason: str,
    notified_count: int,
    link: str = "",
) -> None:
    """Publish an alert notification to alert.exchange for ws-gateway to push to frontend."""
    try:
        exchange = await RabbitMQConnection.declare_exchange(
            settings.alert_exchange, ExchangeType.TOPIC, durable=True
        )

        sentiment_label = "POSITIVE" if sentiment > 0 else "NEGATIVE"
        payload = {
            "event": "alert.notification",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "source": "symbol-alert-service",
            "data": {
                "type": "sentiment_alert",
                "symbol": symbol,
                "sentiment": sentiment,
                "sentiment_label": sentiment_label,
                "title": title,
                "reason": reason,
                "link": link,
                "notified_count": notified_count,
            },
        }

        msg = Message(
            body=json.dumps(payload).encode(),
            delivery_mode=DeliveryMode.PERSISTENT,
            content_type="application/json",
        )
        await exchange.publish(msg, routing_key=f"alert.notification.{symbol.lower()}")
        logger.info(f"Alert notification published to ws-gateway ({symbol}, notified={notified_count})")

    except Exception as e:
        logger.error(f"Failed to publish alert notification: {e}")
