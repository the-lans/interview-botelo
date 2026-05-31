import pytest
from sqlalchemy import select

from app.models import InterviewAnswer, InterviewSession, Question, User
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
@pytest.mark.parametrize(
    ("params", "min_len", "expected_status"),
    [
        ({"topic": "python", "difficulty": "middle"}, 1, 200),
        ([("tags", "python"), ("tags", "concurrency")], 1, 200),
        ([("tags", "python"), ("tags", " ")], 0, 422),
    ],
)
async def test_questions_filters_and_validation(client, params, min_len, expected_status):
    await _seed_questions()
    resp = await client.get("/questions", params=params)
    assert resp.status_code == expected_status
    if expected_status == 200:
        assert len(resp.json()) >= min_len


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
    from app.db.session import SessionLocal

    await _auth(client, email="interview@test.com")
    await _seed_questions()

    async def fake_chat_completion(messages, model="openclaw/devius"):
        return {"choices": [{"message": {"content": "good answer"}}]}

    monkeypatch.setattr("app.api.routes.chat_completion", fake_chat_completion)

    start = await client.post("/interview/start")
    assert start.status_code == 200
    payload = start.json()

    first_answer = await client.post(
        "/interview/answer",
        json={
            "session_id": payload["session_id"],
            "question_id": payload["question_id"],
            "answer": "Подробно объясню архитектуру, компромиссы и практические детали решения.",
        },
    )
    assert first_answer.status_code == 200
    first_payload = first_answer.json()
    assert first_payload["feedback"] == "good answer"
    assert first_payload["completed"] is False
    assert first_payload["next_question_id"] is not None
    assert first_payload["next_question_id"] != payload["question_id"]
    assert first_payload["score"] > 0

    second_answer = await client.post(
        "/interview/answer",
        json={
            "session_id": payload["session_id"],
            "question_id": first_payload["next_question_id"],
            "answer": "Разберу пример, ограничения, SQL и граничные случаи.",
        },
    )
    assert second_answer.status_code == 200
    second_payload = second_answer.json()
    assert second_payload["completed"] is False
    assert second_payload["next_question_id"] is not None
    assert second_payload["next_question_id"] not in {
        payload["question_id"],
        first_payload["next_question_id"],
    }

    final_answer = await client.post(
        "/interview/answer",
        json={
            "session_id": payload["session_id"],
            "question_id": second_payload["next_question_id"],
            "answer": "Итоговый ответ с терминами, деталями и понятной структурой.",
        },
    )
    assert final_answer.status_code == 200
    final_payload = final_answer.json()
    assert final_payload["completed"] is True
    assert final_payload["next_question_id"] is None
    assert final_payload["session_score"] is not None
    assert "Итоговый балл" in final_payload["summary"]

    async with SessionLocal() as session:
        answers = (
            (
                await session.execute(
                    select(InterviewAnswer).where(
                        InterviewAnswer.session_id == payload["session_id"]
                    )
                )
            )
            .scalars()
            .all()
        )
        assert len(answers) == 3
        assert len({item.question_id for item in answers}) == 3

        interview_session = (
            await session.execute(
                select(InterviewSession).where(InterviewSession.id == payload["session_id"])
            )
        ).scalar_one()
        assert interview_session.question_id is None
        assert interview_session.completed_at is not None
        assert float(interview_session.score) == final_payload["session_score"]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("mode", "session_id", "question_id", "expected_status", "expected_detail"),
    [
        ("missing_session", 9999, 1, 404, None),
        ("question_mismatch", None, 99999, 400, "Question mismatch"),
        ("empty_answer", None, None, 422, "Answer must not be empty"),
    ],
)
async def test_interview_answer_error_cases(
    client,
    mode,
    session_id,
    question_id,
    expected_status,
    expected_detail,
):
    await _auth(client, email=f"{mode}@test.com")
    answer = "x"

    if mode in {"question_mismatch", "empty_answer"}:
        await _seed_questions()
        start = await client.post("/interview/start")
        payload = start.json()
        session_id = payload["session_id"]
        if mode == "empty_answer":
            question_id = payload["question_id"]
            answer = "   "

    resp = await client.post(
        "/interview/answer",
        json={"session_id": session_id, "question_id": question_id, "answer": answer},
    )
    assert resp.status_code == expected_status
    if expected_detail:
        assert resp.json()["detail"] == expected_detail


@pytest.mark.asyncio
async def test_interview_answer_question_not_found_after_session_update(client):
    from app.db.session import SessionLocal

    await _auth(client, email="qnf@test.com")
    await _seed_questions()
    start = await client.post("/interview/start")
    payload = start.json()

    async with SessionLocal() as session:
        res = await session.execute(
            select(InterviewSession).where(InterviewSession.id == payload["session_id"])
        )
        interview_session = res.scalar_one()
        await session.execute(
            Question.__table__.delete().where(Question.id == interview_session.question_id)
        )
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


@pytest.mark.asyncio
async def test_interview_single_question_completes_session(client, monkeypatch):
    from app.db.session import SessionLocal

    await _auth(client, email="single@test.com")

    async with SessionLocal() as session:
        session.add(
            Question(text="Only question", topic="python", difficulty="middle", tags="python")
        )
        await session.commit()

    async def fake_chat_completion(messages, model="openclaw/devius"):
        return {"choices": [{"message": {"content": "good answer"}}]}

    monkeypatch.setattr("app.api.routes.chat_completion", fake_chat_completion)

    start = await client.post("/interview/start")
    payload = start.json()

    answer = await client.post(
        "/interview/answer",
        json={
            "session_id": payload["session_id"],
            "question_id": payload["question_id"],
            "answer": "Полный ответ с деталями и примерами.",
        },
    )
    assert answer.status_code == 200
    result = answer.json()
    assert result["completed"] is True
    assert result["next_question"] is None
    assert result["session_score"] == result["score"]


@pytest.mark.asyncio
async def test_interview_cannot_answer_completed_session(client, monkeypatch):
    await _auth(client, email="completed@test.com")
    await _seed_questions()

    async def fake_chat_completion(messages, model="openclaw/devius"):
        return {"choices": [{"message": {"content": "good answer"}}]}

    monkeypatch.setattr("app.api.routes.chat_completion", fake_chat_completion)

    start = await client.post("/interview/start")
    current_question_id = start.json()["question_id"]

    for _ in range(3):
        response = await client.post(
            "/interview/answer",
            json={
                "session_id": start.json()["session_id"],
                "question_id": current_question_id,
                "answer": "Развёрнутый ответ с терминологией и примерами.",
            },
        )
        assert response.status_code == 200
        payload = response.json()
        if payload["completed"]:
            break
        current_question_id = payload["next_question_id"]

    completed_response = await client.post(
        "/interview/answer",
        json={
            "session_id": start.json()["session_id"],
            "question_id": current_question_id,
            "answer": "Ещё один ответ после завершения.",
        },
    )
    assert completed_response.status_code == 400
    assert completed_response.json()["detail"] == "Session already completed"


@pytest.mark.asyncio
async def test_interview_uses_average_score_when_question_pool_shrinks(client, monkeypatch):
    from app.db.session import SessionLocal

    await _auth(client, email="shrink@test.com")
    await _seed_questions()

    async def fake_chat_completion(messages, model="openclaw/devius"):
        return {"choices": [{"message": {"content": "good answer"}}]}

    monkeypatch.setattr("app.api.routes.chat_completion", fake_chat_completion)

    start = await client.post("/interview/start")
    start_payload = start.json()

    first_answer = await client.post(
        "/interview/answer",
        json={
            "session_id": start_payload["session_id"],
            "question_id": start_payload["question_id"],
            "answer": "Короткий ответ.",
        },
    )
    assert first_answer.status_code == 200
    first_payload = first_answer.json()

    async with SessionLocal() as session:
        remaining_question_ids = (
            (
                await session.execute(
                    select(Question.id).where(
                        Question.id.not_in(
                            [start_payload["question_id"], first_payload["next_question_id"]]
                        )
                    )
                )
            )
            .scalars()
            .all()
        )
        assert len(remaining_question_ids) == 1
        await session.execute(
            Question.__table__.delete().where(Question.id == remaining_question_ids[0])
        )
        await session.commit()

    second_answer = await client.post(
        "/interview/answer",
        json={
            "session_id": start_payload["session_id"],
            "question_id": first_payload["next_question_id"],
            "answer": "Очень подробный ответ с архитектурой, SQL, trade-offs и примерами.",
        },
    )
    assert second_answer.status_code == 200
    closing_payload = second_answer.json()
    assert closing_payload["completed"] is True

    async with SessionLocal() as session:
        answer_scores = (
            await session.execute(
                select(InterviewAnswer.score).where(
                    InterviewAnswer.session_id == start_payload["session_id"]
                )
            )
        ).scalars().all()
    expected_session_score = round(
        sum(float(score) for score in answer_scores if score is not None) / len(answer_scores), 2
    )
    assert closing_payload["session_score"] == expected_session_score
