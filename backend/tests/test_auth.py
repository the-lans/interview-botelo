import pytest


@pytest.mark.asyncio
async def test_signup_login(client):
    resp = await client.post("/auth/signup", json={"email": "a@b.com", "password": "pass1234"})
    assert resp.status_code == 200

    resp = await client.post("/auth/login", json={"email": "a@b.com", "password": "pass1234"})
    assert resp.status_code == 200
    assert "session" in resp.cookies


@pytest.mark.asyncio
async def test_protected_requires_auth(client):
    resp = await client.get("/progress")
    assert resp.status_code == 401
