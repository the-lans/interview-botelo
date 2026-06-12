from datetime import timedelta

import pytest
from sqlalchemy import select

from app.api import routes
from app.core.time import utc_now
from app.db.session import SessionLocal
from app.models import Question
from app.models.user import User
from app.services.emailer import EmailDeliveryError
from app.services.security import hash_email_token


async def _signup_verify_login(
    client,
    email: str = "edge@test.com",
    password: str = "pass1234",
) -> None:
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
@pytest.mark.parametrize(
    ("endpoint", "payload", "precreate_user"),
    [
        ("/auth/signup", {"email": "fail-signup@test.com", "password": "pass1234"}, False),
        ("/auth/resend-verification", {"email": "resend-fail@test.com"}, True),
    ],
)
async def test_email_delivery_returns_503(client, monkeypatch, endpoint, payload, precreate_user):
    if precreate_user:
        await client.post("/auth/signup", json={"email": payload["email"], "password": "pass1234"})

    monkeypatch.setattr(routes, "check_rate_limit", lambda key: True)
    monkeypatch.setattr(
        routes,
        "send_email",
        lambda *args, **kwargs: (_ for _ in ()).throw(EmailDeliveryError("smtp down")),
    )

    resp = await client.post(endpoint, json=payload)
    assert resp.status_code == 503

    if endpoint == "/auth/signup":
        async with SessionLocal() as session:
            res = await session.execute(select(User).where(User.email == payload["email"]))
            assert res.scalar_one_or_none() is None


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("endpoint", "payload", "precreate_user"),
    [
        ("/auth/login", {"email": "x@test.com", "password": "pass1234"}, False),
        ("/auth/resend-verification", {"email": "resend-rate@test.com"}, True),
    ],
)
async def test_rate_limit_returns_429(client, monkeypatch, endpoint, payload, precreate_user):
    if precreate_user:
        await client.post("/auth/signup", json={"email": payload["email"], "password": "pass1234"})

    monkeypatch.setattr(routes, "check_rate_limit", lambda key: False)

    resp = await client.post(endpoint, json=payload)
    assert resp.status_code == 429


@pytest.mark.asyncio
async def test_verify_invalid_and_expired_token(client):
    invalid = await client.get("/auth/verify", params={"token": "missing-token"})
    assert invalid.status_code == 400

    await client.post("/auth/signup", json={"email": "expired@test.com", "password": "pass1234"})
    async with SessionLocal() as session:
        res = await session.execute(select(User).where(User.email == "expired@test.com"))
        user = res.scalar_one()
        user.email_verification_token = hash_email_token("expired-token")
        user.email_verification_expires_at = utc_now() - timedelta(minutes=1)
        await session.commit()

    expired = await client.get("/auth/verify", params={"token": "expired-token"})
    assert expired.status_code == 400
    assert expired.json()["detail"] == "Token expired"


@pytest.mark.asyncio
async def test_interview_answer_returns_502_on_ai_error(client, monkeypatch):
    await _signup_verify_login(client, email="edge-interview@test.com")

    async with SessionLocal() as session:
        session.add(Question(text="Q", topic="python", difficulty="middle", tags="python"))
        await session.commit()

    start = await client.post("/interview/start")
    payload = start.json()

    async def broken_ai(messages, model="openclaw/devius"):
        raise RuntimeError("ai down")

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


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "payload",
    [
        {"topic": "   ", "status": "todo"},
        {"topic": "Python", "status": "paused"},
    ],
)
async def test_progress_rejects_invalid_payload(client, payload):
    await _signup_verify_login(client, email="edge-progress@test.com")

    resp = await client.post("/progress", json=payload)
    assert resp.status_code == 422
