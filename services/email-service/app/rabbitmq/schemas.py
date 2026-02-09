"""
RabbitMQ message schemas for Email Service.
"""

from datetime import datetime, timezone
from typing import Optional
from enum import Enum

from pydantic import BaseModel, Field


class EmailEventType(str, Enum):
    """Event types for email messages."""
    SEND_EMAIL = "email.send"
    SEND_VERIFICATION = "email.send.verification"
    SEND_ALERT = "email.send.alert"


class BaseMessage(BaseModel):
    """Base schema for all RabbitMQ messages."""
    event: str = Field(..., description="Event type")
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    source: str = Field(default="unknown", description="Source service")
    correlation_id: Optional[str] = None


class EmailRequestData(BaseModel):
    """Data payload for email send requests."""
    to: str = Field(..., description="Recipient email address")
    subject: str = Field(..., description="Email subject")
    body: str = Field(..., description="Email body (HTML supported)")
    template: Optional[str] = Field(None, description="Template name (optional)")
    template_data: Optional[dict] = Field(None, description="Template variables")


class EmailRequestMessage(BaseMessage):
    """Schema for incoming email send requests."""
    event: str = EmailEventType.SEND_EMAIL.value
    data: EmailRequestData
