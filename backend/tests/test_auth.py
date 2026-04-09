import pytest


@pytest.mark.asyncio
async def test_signup_login(client):
    resp = await client.post("/auth/signup", json={"email": "a@b.com", "password": "pass1234"})
    assert resp.status_code == 200

    # Login blocked until email verified
    resp = await client.post("/auth/login", json={"email": "a@b.com", "password": "pass1234"})
    assert resp.status_code == 403

    # Verify email
    from app.db.session import SessionLocal
    from app.models.user import User
    from sqlalchemy import select

    async with SessionLocal() as session:
        res = await session.execute(select(User).where(User.email == "a@b.com"))
        user = res.scalar_one()
        token = user.email_verification_token

    resp = await client.get(f"/auth/verify?token={token}")
    assert resp.status_code == 307

    resp = await client.post("/auth/login", json={"email": "a@b.com", "password": "pass1234"})
    assert resp.status_code == 200
    assert "session" in resp.cookies


@pytest.mark.asyncio
async def test_protected_requires_auth(client):
    resp = await client.get("/progress")
    assert resp.status_code == 401
