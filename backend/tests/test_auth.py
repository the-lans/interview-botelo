import pytest
from sqlalchemy import select

from app.models.user import User
from app.services.security import hash_email_token


@pytest.mark.asyncio
async def test_signup_login(client):
    resp = await client.post("/auth/signup", json={"email": "a@b.com", "password": "pass1234"})
    assert resp.status_code == 200

    # Login blocked until email verified
    resp = await client.post("/auth/login", json={"email": "a@b.com", "password": "pass1234"})
    assert resp.status_code == 403

    # Verify email
    from app.db.session import SessionLocal

    async with SessionLocal() as session:
        res = await session.execute(select(User).where(User.email == "a@b.com"))
        user = res.scalar_one()
        token_hash = user.email_verification_token

    assert token_hash is not None
    assert len(token_hash) == 64

    # Для теста корректности верификации напрямую подменяем токен известным значением.
    plain_token = "known-token-for-test"
    async with SessionLocal() as session:
        res = await session.execute(select(User).where(User.email == "a@b.com"))
        user = res.scalar_one()
        user.email_verification_token = hash_email_token(plain_token)
        await session.commit()

    resp = await client.get(f"/auth/verify?token={plain_token}")
    assert resp.status_code == 307

    resp = await client.post("/auth/login", json={"email": "a@b.com", "password": "pass1234"})
    assert resp.status_code == 200
    assert "session" in resp.cookies


@pytest.mark.asyncio
async def test_protected_requires_auth(client):
    resp = await client.get("/progress")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_resend_verification_rotates_token(client):
    from app.db.session import SessionLocal

    await client.post("/auth/signup", json={"email": "resend@test.com", "password": "pass1234"})

    async with SessionLocal() as session:
        res = await session.execute(select(User).where(User.email == "resend@test.com"))
        user = res.scalar_one()
        old_token_hash = user.email_verification_token

    resp = await client.post(
        "/auth/resend-verification",
        json={"email": "resend@test.com"},
    )
    assert resp.status_code == 200

    async with SessionLocal() as session:
        res = await session.execute(select(User).where(User.email == "resend@test.com"))
        user = res.scalar_one()
        assert user.email_verification_token != old_token_hash
