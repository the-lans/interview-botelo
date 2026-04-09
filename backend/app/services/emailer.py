from __future__ import annotations

import smtplib
from email.mime.text import MIMEText

from app.core.config import get_settings


def send_email(to_email: str, subject: str, body: str) -> None:
    settings = get_settings()
    if settings.APP_ENV == "test":
        return
    if not settings.SMTP_HOST or not settings.SMTP_USER or not settings.SMTP_PASSWORD:
        return

    from_email = settings.SMTP_FROM or settings.SMTP_USER

    msg = MIMEText(body, "plain", "utf-8")
    msg["Subject"] = subject
    msg["From"] = from_email
    msg["To"] = to_email

    server = smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT)
    try:
        server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        server.sendmail(from_email, [to_email], msg.as_string())
    finally:
        server.quit()
