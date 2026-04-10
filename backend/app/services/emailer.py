from __future__ import annotations

import logging
import smtplib
from email.mime.text import MIMEText

from app.core.config import get_settings


logger = logging.getLogger(__name__)


class EmailDeliveryError(RuntimeError):
    pass


def send_email(to_email: str, subject: str, body: str) -> None:
    settings = get_settings()
    if settings.APP_ENV == "test":
        logger.info("Skip email delivery in test env")
        return
    if not settings.SMTP_HOST or not settings.SMTP_USER or not settings.SMTP_PASSWORD:
        if settings.APP_ENV in {"dev", "test"}:
            logger.warning("SMTP is not configured, skip email delivery in non-prod env")
            return
        raise EmailDeliveryError("SMTP is not configured")

    from_email = settings.SMTP_FROM or settings.SMTP_USER

    msg = MIMEText(body, "plain", "utf-8")
    msg["Subject"] = subject
    msg["From"] = from_email
    msg["To"] = to_email

    server = smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT)
    try:
        server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        server.sendmail(from_email, [to_email], msg.as_string())
    except smtplib.SMTPException as error:
        raise EmailDeliveryError("Failed to deliver email") from error
    finally:
        server.quit()
