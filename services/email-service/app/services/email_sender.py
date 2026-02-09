"""
Email sender with Strategy Pattern.

Strategies:
  - SmtpEmailStrategy: Sends real emails via SMTP.
  - ConsoleEmailStrategy: Logs emails to console (for development/testing).
"""

import logging
from abc import ABC, abstractmethod
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional

import aiosmtplib

from app.config import settings

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Strategy interface
# ---------------------------------------------------------------------------

class EmailStrategy(ABC):
    """Abstract base class for email sending strategies."""

    @abstractmethod
    async def send(self, to: str, subject: str, body: str) -> bool:
        """Send an email. Returns True on success."""
        ...


# ---------------------------------------------------------------------------
# Concrete strategies
# ---------------------------------------------------------------------------

class GmailSmtpStrategy(EmailStrategy):
    """
    Send emails via Gmail SMTP.

    Requirements:
      - Enable 2-Step Verification on Google Account.
      - Create an App Password at https://myaccount.google.com/apppasswords
      - Set SMTP_USERNAME = your Gmail address
      - Set SMTP_PASSWORD = the 16-char App Password
    """

    async def send(self, to: str, subject: str, body: str) -> bool:
        try:
            # Gmail requires From = the authenticated Gmail address
            from_addr = settings.smtp_username or settings.smtp_from_email

            msg = MIMEMultipart("alternative")
            msg["From"] = f"{settings.smtp_from_name} <{from_addr}>"
            msg["To"] = to
            msg["Subject"] = subject
            msg.attach(MIMEText(body, "html"))

            await aiosmtplib.send(
                msg,
                hostname=settings.smtp_host,
                port=settings.smtp_port,
                username=settings.smtp_username,
                password=settings.smtp_password,
                start_tls=True,
            )
            logger.info(f"[Gmail SMTP] Email sent to {to}")
            return True
        except Exception as e:
            logger.error(f"[Gmail SMTP] Failed to send email to {to}: {e}")
            return False


class ConsoleEmailStrategy(EmailStrategy):
    """Print emails to console (development mode)."""

    async def send(self, to: str, subject: str, body: str) -> bool:
        logger.info(
            f"\n{'='*60}\n"
            f"[CONSOLE EMAIL]\n"
            f"  To:      {to}\n"
            f"  Subject: {subject}\n"
            f"  Body:    {body[:200]}{'...' if len(body) > 200 else ''}\n"
            f"{'='*60}"
        )
        return True


# ---------------------------------------------------------------------------
# Sender (context) that uses a strategy
# ---------------------------------------------------------------------------

class EmailSender:
    """Email sender that delegates to a strategy."""

    def __init__(self, strategy: EmailStrategy) -> None:
        self._strategy = strategy

    @property
    def strategy_name(self) -> str:
        return self._strategy.__class__.__name__

    def set_strategy(self, strategy: EmailStrategy) -> None:
        """Change the email sending strategy at runtime."""
        self._strategy = strategy
        logger.info(f"Email strategy changed to {self.strategy_name}")

    async def send(self, to: str, subject: str, body: str) -> bool:
        return await self._strategy.send(to, subject, body)


# ---------------------------------------------------------------------------
# Factory / singleton
# ---------------------------------------------------------------------------

_sender: Optional[EmailSender] = None


def get_email_sender() -> EmailSender:
    """Get the singleton EmailSender with the configured strategy."""
    global _sender
    if _sender is None:
        if settings.email_strategy == "smtp":
            strategy: EmailStrategy = GmailSmtpStrategy()
        else:
            strategy = ConsoleEmailStrategy()
        _sender = EmailSender(strategy)
        logger.info(f"Email sender initialised with strategy: {_sender.strategy_name}")
    return _sender
