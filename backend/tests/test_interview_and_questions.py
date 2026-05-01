import pytest
from sqlalchemy import select

from app.models import InterviewSession, Question, User
from app.services.security import hash_email_token


async def _auth(client, *, email: str = "qa@test.com", password: str = "pass1234"):
    from app.db.session import SessionLocal

    await client.post("/auth/signup", json={"email": email, "password": password})

    token = "known-token"
    async with SessionLocal() as session:
        res = await session.execute(select(User).where(User.email == email))
        user = res.scalar_one()
        user.email_verification_token = hash_email_token(token)
        await session.commit()

    await client.get(f"/auth/verify?token={token}")
    resp = await client.post("/auth/login", json={"email": email, "password": password})
    client.headers["x-csrf-token"] = resp.cookies.get("csrf_token")


async def _seed_questions():
    from app.db.session import SessionLocal

    async with SessionLocal() as session:
        session.add_all(
            [
                Question(text="Q1", topic="python", difficulty="middle", tags="python,concurrency"),
                Question(text="Q2", topic="sql", difficulty="junior", tags="sql,database"),
                Question(text="Q3", topic="python", difficulty="senior", tags="python,asyncio"),
            ]
        )
        await session.commit()


@pytest.mark.asyncio
async def test_questions_filter_by_topic_and_difficulty(client):
    await _seed_questions()
    resp = await client.get("/questions", params={"topic": "python", "difficulty": "middle"})
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) >= 1
    assert all(item["topic"] == "python" for item in data)
    assert all(item["difficulty"] == "middle" for item in data)


@pytest.mark.asyncio
async def test_questions_filter_by_tags_and_validation(client):
    await _seed_questions()
    ok = await client.get("/questions", params=[("tags", "python"), ("tags", "concurrency")])
    assert ok.status_code == 200
    assert len(ok.json()) >= 1

    bad = await client.get("/questions", params=[("tags", "python"), ("tags", " ")])
    assert bad.status_code == 422


@pytest.mark.asyncio
async def test_interview_start_requires_questions(client):
    from app.db.session import SessionLocal

    await _auth(client, email="noq@test.com")

    async with SessionLocal() as session:
        await session.execute(Question.__table__.delete())
        await session.commit()

    resp = await client.post("/interview/start")
    assert resp.status_code == 400
    assert resp.json()["detail"] == "No questions in database"


@pytest.mark.asyncio
async def test_interview_happy_path_and_followup(client, monkeypatch):
    await _auth(client, email="interview@test.com")
    await _seed_questions()

    async def fake_chat_completion(messages, model="openclaw/devius"):
        return {"choices": [{"message": {"content": "good answer"}}]}

    monkeypatch.setattr("app.api.routes.chat_completion", fake_chat_completion)

    start = await client.post("/interview/start")
    assert start.status_code == 200
    payload = start.json()

    answer = await client.post(
        "/interview/answer",
        json={
            "session_id": payload["session_id"],
            "question_id": payload["question_id"],
            "answer": "my answer",
        },
    )
    assert answer.status_code == 200
    assert answer.json()["feedback"] == "good answer"


@pytest.mark.asyncio
async def test_interview_answer_not_found_session(client):
    await _auth(client, email="nf@test.com")

    resp = await client.post(
        "/interview/answer",
        json={"session_id": 9999, "question_id": 1, "answer": "x"},
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_interview_answer_question_mismatch(client):
    await _auth(client, email="mismatch@test.com")
    await _seed_questions()

    start = await client.post("/interview/start")
    session_id = start.json()["session_id"]

    resp = await client.post(
        "/interview/answer",
        json={"session_id": session_id, "question_id": 99999, "answer": "x"},
    )
    assert resp.status_code == 400
    assert resp.json()["detail"] == "Question mismatch"


@pytest.mark.asyncio
async def test_interview_answer_question_not_found_after_session_update(client):
    from app.db.session import SessionLocal

    await _auth(client, email="qnf@test.com")
    await _seed_questions()
    start = await client.post("/interview/start")
    payload = start.json()

    async with SessionLocal() as session:
        res = await session.execute(select(InterviewSession).where(InterviewSession.id == payload["session_id"]))
        interview_session = res.scalar_one()
        await session.execute(Question.__table__.delete().where(Question.id == interview_session.question_id))
        await session.commit()

    resp = await client.post(
        "/interview/answer",
        json={
            "session_id": payload["session_id"],
            "question_id": payload["question_id"],
            "answer": "x",
        },
    )
    assert resp.status_code == 400
    assert resp.json()["detail"] == "Question not found"
