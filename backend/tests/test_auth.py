import pytest
from sqlalchemy import select

from app.models.user import User
from app.services.security import hash_email_token


@pytest.mark.asyncio
async def test_signup_login(client):
    resp = await client.post("/auth/signup", json={"email": "a@b.com", "password": "pass1234"})
    assert resp.status_code == 200

    resp = await client.post("/auth/login", json={"email": "a@b.com", "password": "pass1234"})
    assert resp.status_code == 403

    from app.db.session import SessionLocal

    async with SessionLocal() as session:
        res = await session.execute(select(User).where(User.email == "a@b.com"))
        user = res.scalar_one()
        token_hash = user.email_verification_token

    assert token_hash is not None
    assert len(token_hash) == 64

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
@pytest.mark.parametrize(
    ("email", "password", "expected_status"),
    [
        ("bad-login@test.com", "wrong-pass", 401),
        ("bad-login-2@test.com", "incorrect", 401),
    ],
)
async def test_login_with_invalid_credentials(client, email, password, expected_status):
    await client.post("/auth/signup", json={"email": email, "password": "pass1234"})

    resp = await client.post(
        "/auth/login",
        json={"email": email, "password": password},
    )
    assert resp.status_code == expected_status


@pytest.mark.asyncio
async def test_signup_duplicate_email(client):
    payload = {"email": "duplicate@test.com", "password": "pass1234"}
    first = await client.post("/auth/signup", json=payload)
    second = await client.post("/auth/signup", json=payload)

    assert first.status_code == 200
    assert second.status_code == 400


@pytest.mark.asyncio
async def test_protected_requires_auth(client):
    resp = await client.get("/progress")
    assert resp.status_code == 401


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("email", "verify_before_resend", "expected_detail", "expect_token_rotated"),
    [
        ("resend@test.com", False, "verification_sent", True),
        ("verified@test.com", True, "verification_sent", False),
    ],
)
async def test_resend_verification_behaviour(
    client,
    email,
    verify_before_resend,
    expected_detail,
    expect_token_rotated,
):
    from app.db.session import SessionLocal

    await client.post("/auth/signup", json={"email": email, "password": "pass1234"})

    plain_token = f"token-{email}"
    async with SessionLocal() as session:
        res = await session.execute(select(User).where(User.email == email))
        user = res.scalar_one()
        old_token_hash = user.email_verification_token
        user.email_verification_token = hash_email_token(plain_token)
        await session.commit()

    if verify_before_resend:
        await client.get(f"/auth/verify?token={plain_token}")

    resp = await client.post(
        "/auth/resend-verification",
        json={"email": email},
    )

    assert resp.status_code == 200
    assert resp.json()["detail"] == expected_detail

    async with SessionLocal() as session:
        res = await session.execute(select(User).where(User.email == email))
        user = res.scalar_one()
        if expect_token_rotated:
            assert user.email_verification_token != old_token_hash
        else:
            assert user.email_verification_token is None
