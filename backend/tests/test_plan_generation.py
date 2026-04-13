import pytest
from sqlalchemy import select

from app.models.plan import Plan


async def _signup_verify_login(client, email: str = "plan@test.com", password: str = "pass1234"):
    from app.db.session import SessionLocal
    from app.models.user import User
    from app.services.security import hash_email_token

    await client.post("/auth/signup", json={"email": email, "password": password})

    plain_token = "plan-known-token"
    async with SessionLocal() as session:
        res = await session.execute(select(User).where(User.email == email))
        user = res.scalar_one()
        user.email_verification_token = hash_email_token(plain_token)
        await session.commit()

    await client.get(f"/auth/verify?token={plain_token}")
    resp = await client.post("/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200

    csrf_token = resp.cookies.get("csrf_token")
    client.headers["x-csrf-token"] = csrf_token


@pytest.mark.asyncio
async def test_vacancy_ingest_raw_text_happy_path(client):
    await _signup_verify_login(client, email="vacancy_raw@test.com")

    resp = await client.post(
        "/vacancy/ingest",
        json={"raw_text": "  Python backend engineer with SQL and async experience.  "},
    )
    assert resp.status_code == 200
    assert resp.json()["vacancy_text"] == "Python backend engineer with SQL and async experience."


@pytest.mark.asyncio
async def test_vacancy_ingest_validates_source(client):
    await _signup_verify_login(client, email="vacancy_validation@test.com")

    resp = await client.post(
        "/vacancy/ingest", json={"url": "https://example.com", "raw_text": "x"}
    )
    assert resp.status_code == 422

    resp = await client.post("/vacancy/ingest", json={})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_vacancy_ingest_url_timeout(client, monkeypatch):
    import app.services.vacancy_ingest as vacancy_ingest

    await _signup_verify_login(client, email="vacancy_timeout@test.com")

    class TimeoutClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return None

        async def get(self, url):
            raise vacancy_ingest.httpx.TimeoutException("timeout")

    monkeypatch.setattr(vacancy_ingest.httpx, "AsyncClient", lambda **kwargs: TimeoutClient())

    resp = await client.post("/vacancy/ingest", json={"url": "https://example.com/job"})
    assert resp.status_code == 504


@pytest.mark.asyncio
async def test_vacancy_ingest_url_non_html(client, monkeypatch):
    import app.services.vacancy_ingest as vacancy_ingest

    await _signup_verify_login(client, email="vacancy_non_html@test.com")

    class Response:
        status_code = 200
        headers = {"content-type": "application/json"}
        text = '{"ok":true}'

    class Client:
        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return None

        async def get(self, url):
            return Response()

    monkeypatch.setattr(vacancy_ingest.httpx, "AsyncClient", lambda **kwargs: Client())

    resp = await client.post("/vacancy/ingest", json={"url": "https://example.com/job"})
    assert resp.status_code == 415


@pytest.mark.asyncio
async def test_plan_generate_happy_path(client, monkeypatch):
    from app.db.session import SessionLocal
    from app.models.resume import Resume
    from app.models.user import User

    email = "plan_happy@test.com"
    await _signup_verify_login(client, email=email)

    async with SessionLocal() as session:
        user_res = await session.execute(select(User).where(User.email == email))
        user = user_res.scalar_one()
        session.add(
            Resume(
                user_id=user.id,
                filename="resume.md",
                mime_type="text/markdown",
                file_size_bytes=10,
                content="Python backend developer, FastAPI, SQL",
            )
        )
        await session.commit()

    async def fake_chat_completion(messages, model="openclaw/devius"):
        return {
            "choices": [
                {
                    "message": {
                        "content": '{"summary":"ok","gap_analysis":[],"weeks":[{"week":1,"themes":["Python"],"practice":["solve SQL tasks"],"mock_interview":[],"expected_outcome":"ready","time_budget_hours":8}],"final_readiness_check":["mock"]}'
                    }
                }
            ]
        }

    monkeypatch.setattr("app.api.routes.chat_completion", fake_chat_completion)

    payload = {
        "vacancy_text": "Need Python, SQL, system design",
        "brief": {
            "target_role": "Backend Engineer",
            "level": "Middle",
            "horizon_weeks": 4,
            "time_availability": {"weekday_hours": 2, "weekend_hours": 4},
            "plan_format": "themes+practice",
            "priorities": ["SQL", "Backend Architecture"],
            "constraints": "No leetcode-heavy",
            "language": "RU",
        },
    }

    resp = await client.post("/plan/generate", json=payload)
    assert resp.status_code == 200
    body = resp.json()
    assert body["detail"] == "ok"
    assert body["plan"]["summary"] == "ok"

    async with SessionLocal() as session:
        res = await session.execute(select(Plan))
        plan = res.scalar_one()
        assert "Backend Engineer" in plan.brief_json
        assert "Need Python" in plan.vacancy_text


@pytest.mark.asyncio
async def test_plan_generate_ai_error(client, monkeypatch):
    await _signup_verify_login(client, email="plan_ai_error@test.com")

    async def fake_chat_completion(messages, model="openclaw/devius"):
        raise RuntimeError("ai down")

    monkeypatch.setattr("app.api.routes.chat_completion", fake_chat_completion)

    payload = {
        "resume_text": "Python dev",
        "vacancy_text": "Need Python",
        "brief": {
            "target_role": "Backend Engineer",
            "level": "Middle",
            "horizon_weeks": 4,
            "time_availability": {"weekday_hours": 2, "weekend_hours": 4},
            "plan_format": "themes",
            "priorities": ["SQL"],
            "language": "RU",
        },
    }

    resp = await client.post("/plan/generate", json=payload)
    assert resp.status_code == 502


@pytest.mark.asyncio
async def test_plan_generate_long_vacancy_text(client):
    await _signup_verify_login(client, email="plan_long_text@test.com")

    payload = {
        "resume_text": "Python dev",
        "vacancy_text": "x" * 20001,
        "brief": {
            "target_role": "Backend Engineer",
            "level": "Middle",
            "horizon_weeks": 4,
            "time_availability": {"weekday_hours": 2, "weekend_hours": 4},
            "plan_format": "themes",
            "priorities": ["SQL"],
            "language": "RU",
        },
    }

    resp = await client.post("/plan/generate", json=payload)
    assert resp.status_code == 413
