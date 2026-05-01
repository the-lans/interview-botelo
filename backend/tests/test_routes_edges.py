from datetime import datetime, timedelta

import pytest
from sqlalchemy import select

from app.models.user import User
from app.services.security import hash_email_token


async def _signup_verify_login(client, email: str = "edge@test.com", password: str = "pass1234"):
    from app.db.session import SessionLocal

    await client.post("/auth/signup", json={"email": email, "password": password})

    plain_token = "edge-token"
    async with SessionLocal() as session:
        res = await session.execute(select(User).where(User.email == email))
        user = res.scalar_one()
        user.email_verification_token = hash_email_token(plain_token)
        await session.commit()

    await client.get(f"/auth/verify?token={plain_token}")
    resp = await client.post("/auth/login", json={"email": email, "password": password})
    client.headers["x-csrf-token"] = resp.cookies.get("csrf_token")


@pytest.mark.asyncio
async def test_signup_returns_503_when_email_delivery_fails(client, monkeypatch):
    from app.api import routes
    from app.services.emailer import EmailDeliveryError

    def fail(*args, **kwargs):
        raise EmailDeliveryError("smtp down")

    monkeypatch.setattr(routes, "send_email", fail)

    resp = await client.post("/auth/signup", json={"email": "fail-signup@test.com", "password": "pass1234"})
    assert resp.status_code == 503


@pytest.mark.asyncio
async def test_login_returns_429_when_rate_limit_hits(client, monkeypatch):
    from app.api import routes

    monkeypatch.setattr(routes, "check_rate_limit", lambda key: False)

    resp = await client.post("/auth/login", json={"email": "x@test.com", "password": "pass1234"})
    assert resp.status_code == 429


@pytest.mark.asyncio
async def test_verify_invalid_and_expired_token(client):
    from app.db.session import SessionLocal

    invalid = await client.get("/auth/verify", params={"token": "missing-token"})
    assert invalid.status_code == 400

    await client.post("/auth/signup", json={"email": "expired@test.com", "password": "pass1234"})
    async with SessionLocal() as session:
        res = await session.execute(select(User).where(User.email == "expired@test.com"))
        user = res.scalar_one()
        user.email_verification_token = hash_email_token("expired-token")
        user.email_verification_expires_at = datetime.utcnow() - timedelta(minutes=1)
        await session.commit()

    expired = await client.get("/auth/verify", params={"token": "expired-token"})
    assert expired.status_code == 400
    assert expired.json()["detail"] == "Token expired"


@pytest.mark.asyncio
async def test_resend_verification_rate_limited_and_email_fail(client, monkeypatch):
    from app.api import routes
    from app.services.emailer import EmailDeliveryError

    await client.post("/auth/signup", json={"email": "resend-fail@test.com", "password": "pass1234"})

    monkeypatch.setattr(routes, "check_rate_limit", lambda key: False)
    limited = await client.post("/auth/resend-verification", json={"email": "resend-fail@test.com"})
    assert limited.status_code == 429

    monkeypatch.setattr(routes, "check_rate_limit", lambda key: True)
    monkeypatch.setattr(routes, "send_email", lambda *args, **kwargs: (_ for _ in ()).throw(EmailDeliveryError("smtp fail")))
    failed = await client.post("/auth/resend-verification", json={"email": "resend-fail@test.com"})
    assert failed.status_code == 503


@pytest.mark.asyncio
async def test_interview_answer_returns_502_on_ai_error(client, monkeypatch):
    from app.db.session import SessionLocal
    from app.models import Question

    await _signup_verify_login(client, email="edge-interview@test.com")

    async with SessionLocal() as session:
        session.add(Question(text="Q", topic="python", difficulty="middle", tags="python"))
        await session.commit()

    start = await client.post("/interview/start")
    payload = start.json()

    async def broken_ai(messages, model="openclaw/devius"):
        raise RuntimeError("ai down")

    from app.api import routes

    monkeypatch.setattr(routes, "chat_completion", broken_ai)

    resp = await client.post(
        "/interview/answer",
        json={
            "session_id": payload["session_id"],
            "question_id": payload["question_id"],
            "answer": "answer",
        },
    )
    assert resp.status_code == 502


@pytest.mark.asyncio
async def test_progress_requires_auth(client):
    resp = await client.get("/progress")
    assert resp.status_code == 401
