"""
REST routes for Email Service (manual trigger / testing).
"""

import json
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from aio_pika import ExchangeType, Message, DeliveryMode

from app.config import settings
from app.services.email_sender import get_email_sender
from app.rabbitmq.connection import RabbitMQConnection

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/email", tags=["Email"])


class SendEmailRequest(BaseModel):
    to: str = Field(..., description="Recipient email address")
    subject: str = Field(..., description="Email subject")
    body: str = Field(..., description="Email body (HTML)")


@router.post("/send")
async def send_email(req: SendEmailRequest):
    """Send an email directly (for testing or manual trigger)."""
    sender = get_email_sender()
    success = await sender.send(to=req.to, subject=req.subject, body=req.body)

    status = "sent" if success else "failed"

    # Publish status to alert.exchange for ws-gateway
    try:
        exchange = await RabbitMQConnection.declare_exchange(
            settings.alert_exchange, ExchangeType.TOPIC, durable=True
        )
        payload = {
            "event": "alert.email.status",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "source": "email-service",
            "data": {
                "type": "email_status",
                "to": req.to,
                "subject": req.subject,
                "status": status,
            },
        }
        msg = Message(
            body=json.dumps(payload).encode(),
            delivery_mode=DeliveryMode.PERSISTENT,
            content_type="application/json",
        )
        await exchange.publish(msg, routing_key=settings.alert_routing_key)
    except Exception as e:
        logger.error(f"Failed to publish email status: {e}")

    if not success:
        raise HTTPException(status_code=500, detail="Failed to send email")
    return {"status": "sent", "to": req.to}
