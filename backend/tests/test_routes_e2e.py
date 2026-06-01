import json

import pytest
from sqlalchemy import select

from app.models import Plan, Progress, User
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
                        "content": json.dumps(
                            {
                                "summary": "plan",
                                "gap_analysis": [],
                                "weeks": [
                                    {
                                        "week": 1,
                                        "themes": ["Python"],
                                        "practice": ["API"],
                                        "mock_interview": [],
                                        "expected_outcome": "ok",
                                        "time_budget_hours": 6,
                                    }
                                ],
                                "final_readiness_check": ["done"],
                            }
                        )
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

    progress_update = await client.post(
        "/progress",
        json={"topic": "Python", "status": "in_progress"},
    )
    assert progress_update.status_code == 200
    assert progress_update.json()["detail"] == "created"

    progress = await client.get("/progress")
    assert progress.status_code == 200
    progress_payload = progress.json()
    assert progress_payload["summary"] == {
        "total_topics": 1,
        "completed_topics": 0,
        "completion_percent": 0.0,
        "status_counts": {"todo": 0, "in_progress": 1, "done": 0},
    }
    assert progress_payload["topics"] == [
        {
            "topic": "Python",
            "status": "in_progress",
            "updated_at": progress_payload["topics"][0]["updated_at"],
        }
    ]
    assert progress_payload["history"] == [
        {
            "topic": "Python",
            "status": "in_progress",
            "updated_at": progress_payload["history"][0]["updated_at"],
        }
    ]

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


@pytest.mark.asyncio
async def test_progress_aggregates_plan_topics_and_history(client):
    from app.db.session import SessionLocal

    email = "progress-plan@test.com"
    await _register_and_login(client, email)

    async with SessionLocal() as session:
        user = (await session.execute(select(User).where(User.email == email))).scalar_one()
        session.add(
            Plan(
                user_id=user.id,
                resume_text="resume",
                vacancy_text="vacancy",
                brief_json="{}",
                plan_json=json.dumps(
                    {
                        "summary": "plan",
                        "gap_analysis": [],
                        "weeks": [
                            {
                                "week": 1,
                                "themes": ["Python", "SQL"],
                                "practice": [],
                                "mock_interview": [],
                                "expected_outcome": "ok",
                                "time_budget_hours": 4,
                            },
                            {
                                "week": 2,
                                "themes": ["System Design", "Python"],
                                "practice": [],
                                "mock_interview": [],
                                "expected_outcome": "ok",
                                "time_budget_hours": 4,
                            },
                        ],
                        "final_readiness_check": [],
                    }
                ),
                content="{}",
            )
        )
        session.add_all(
            [
                Progress(user_id=user.id, topic="Python", status="todo"),
                Progress(user_id=user.id, topic="Python", status="done"),
                Progress(user_id=user.id, topic="Algorithms", status="in_progress"),
            ]
        )
        await session.commit()

    resp = await client.get("/progress")
    assert resp.status_code == 200

    body = resp.json()
    assert body["summary"] == {
        "total_topics": 4,
        "completed_topics": 1,
        "completion_percent": 25.0,
        "status_counts": {"todo": 2, "in_progress": 1, "done": 1},
    }
    assert body["topics"] == [
        {"topic": "Python", "status": "done", "updated_at": body["topics"][0]["updated_at"]},
        {"topic": "SQL", "status": "todo", "updated_at": None},
        {
            "topic": "System Design",
            "status": "todo",
            "updated_at": None,
        },
        {
            "topic": "Algorithms",
            "status": "in_progress",
            "updated_at": body["topics"][3]["updated_at"],
        },
    ]
    assert [(entry["topic"], entry["status"]) for entry in body["history"]] == [
        ("Algorithms", "in_progress"),
        ("Python", "done"),
        ("Python", "todo"),
    ]


@pytest.mark.asyncio
async def test_progress_upsert_returns_unchanged_when_status_matches_latest(client):
    from app.db.session import SessionLocal

    email = "progress-unchanged@test.com"
    await _register_and_login(client, email)

    async with SessionLocal() as session:
        user = (await session.execute(select(User).where(User.email == email))).scalar_one()
        session.add(Progress(user_id=user.id, topic="Python", status="done"))
        await session.commit()

    unchanged = await client.post("/progress", json={"topic": "  python  ", "status": "done"})
    assert unchanged.status_code == 200
    assert unchanged.json()["detail"] == "unchanged"

    history = await client.get("/progress")
    assert history.status_code == 200
    assert len(history.json()["history"]) == 1
