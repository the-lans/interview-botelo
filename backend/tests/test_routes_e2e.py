import pytest
from sqlalchemy import select

from app.models import Progress, User
from app.services.security import hash_email_token


async def _register_and_login(client, email: str, password: str = "pass1234"):
    from app.db.session import SessionLocal

    signup = await client.post("/auth/signup", json={"email": email, "password": password})
    assert signup.status_code == 200

    token = "e2e-token"
    async with SessionLocal() as session:
        res = await session.execute(select(User).where(User.email == email))
        user = res.scalar_one()
        user.email_verification_token = hash_email_token(token)
        await session.commit()

    verified = await client.get(f"/auth/verify?token={token}")
    assert verified.status_code in (200, 307)

    login = await client.post("/auth/login", json={"email": email, "password": password})
    assert login.status_code == 200
    csrf = login.cookies.get("csrf_token")
    assert csrf
    client.headers["x-csrf-token"] = csrf


@pytest.mark.asyncio
async def test_e2e_core_flow(client, monkeypatch):
    from app.db.session import SessionLocal
    from app.models import Question

    await _register_and_login(client, "e2e-core@test.com")

    async with SessionLocal() as session:
        session.add_all(
            [
                Question(text="Q1", topic="python", difficulty="middle", tags="python"),
                Question(text="Q2", topic="sql", difficulty="middle", tags="sql"),
            ]
        )
        await session.commit()

    # upload rtf resume
    rtf_payload = b"{\\rtf1\\ansi Senior Python Engineer with FastAPI and SQL}"
    upload = await client.post(
        "/upload/resume",
        files={"file": ("resume.rtf", rtf_payload, "application/rtf")},
    )
    assert upload.status_code == 200

    # vacancy ingest via raw text
    vacancy = await client.post(
        "/vacancy/ingest",
        json={"raw_text": "  Python backend role with async and SQL.  "},
    )
    assert vacancy.status_code == 200

    # generate plan
    async def fake_plan(messages, model="openclaw/devius"):
        return {
            "choices": [
                {
                    "message": {
                        "content": '{"summary":"plan","gap_analysis":[],"weeks":[{"week":1,"themes":["Python"],"practice":["API"],"mock_interview":[],"expected_outcome":"ok","time_budget_hours":6}],"final_readiness_check":["done"]}'
                    }
                }
            ]
        }

    # interview feedback
    async def fake_feedback(messages, model="openclaw/devius"):
        return {"choices": [{"message": {"content": "good"}}]}

    from app.api import routes

    monkeypatch.setattr(routes, "chat_completion", fake_plan)

    generated = await client.post(
        "/plan/generate",
        json={
            "vacancy_text": vacancy.json()["vacancy_text"],
            "brief": {
                "target_role": "Backend Engineer",
                "level": "Middle",
                "horizon_weeks": 4,
                "time_availability": {"weekday_hours": 2, "weekend_hours": 4},
                "plan_format": "themes",
                "priorities": ["Python"],
                "language": "RU",
            },
        },
    )
    assert generated.status_code == 200

    questions = await client.get("/questions")
    assert questions.status_code == 200
    assert len(questions.json()) >= 1

    start = await client.post("/interview/start")
    assert start.status_code == 200

    monkeypatch.setattr(routes, "chat_completion", fake_feedback)
    answer = await client.post(
        "/interview/answer",
        json={
            "session_id": start.json()["session_id"],
            "question_id": start.json()["question_id"],
            "answer": "my answer",
        },
    )
    assert answer.status_code == 200

    async with SessionLocal() as session:
        user = (await session.execute(select(User).where(User.email == "e2e-core@test.com"))).scalar_one()
        session.add(Progress(user_id=user.id, topic="python", status="in_progress"))
        await session.commit()

    progress = await client.get("/progress")
    assert progress.status_code == 200
    assert len(progress.json()) == 1

    logout = await client.post("/auth/logout")
    assert logout.status_code == 200


@pytest.mark.asyncio
async def test_routes_error_scenarios_extra(client, monkeypatch):
    await _register_and_login(client, "e2e-errors@test.com")

    # .doc parse error branch
    class ProcRes:
        returncode = 1
        stdout = ""

    from app.api import routes

    monkeypatch.setattr(routes.subprocess, "run", lambda *args, **kwargs: ProcRes())
    bad_doc = await client.post(
        "/upload/resume",
        files={"file": ("resume.doc", b"doc-bytes", "application/msword")},
    )
    assert bad_doc.status_code == 415

    # empty resume after parsing
    empty_text = await client.post(
        "/upload/resume",
        files={"file": ("resume.txt", b"   ", "text/plain")},
    )
    assert empty_text.status_code == 400

    # plan without resume and without resume_text
    no_resume = await client.post(
        "/plan/generate",
        json={
            "vacancy_text": "Need Python",
            "brief": {
                "target_role": "Backend Engineer",
                "level": "Middle",
                "horizon_weeks": 4,
                "time_availability": {"weekday_hours": 2, "weekend_hours": 4},
                "plan_format": "themes",
                "priorities": ["Python"],
                "language": "RU",
            },
        },
    )
    assert no_resume.status_code == 400

    async def invalid_json(messages, model="openclaw/devius"):
        return {"choices": [{"message": {"content": "not json"}}]}

    monkeypatch.setattr(routes, "chat_completion", invalid_json)

    bad_plan = await client.post(
        "/plan/generate",
        json={
            "resume_text": "Python dev",
            "vacancy_text": "Need Python",
            "brief": {
                "target_role": "Backend Engineer",
                "level": "Middle",
                "horizon_weeks": 4,
                "time_availability": {"weekday_hours": 2, "weekend_hours": 4},
                "plan_format": "themes",
                "priorities": ["Python"],
                "language": "RU",
            },
        },
    )
    assert bad_plan.status_code == 502
