from datetime import datetime, timezone

import pytest

from app.models.question import Question


@pytest.mark.asyncio
async def test_get_questions_without_filters_returns_all(client):
    from app.db.session import SessionLocal

    async with SessionLocal() as db:
        db.add_all(
            [
                Question(
                    text="Explain Python GIL",
                    topic="python",
                    difficulty="middle",
                    tags="python,concurrency",
                    created_at=datetime.now(timezone.utc),
                ),
                Question(
                    text="What is index in PostgreSQL?",
                    topic="database",
                    difficulty="junior",
                    tags="postgres,index",
                    created_at=datetime.now(timezone.utc),
                ),
            ]
        )
        await db.commit()

    response = await client.get("/questions")

    assert response.status_code == 200
    payload = response.json()
    assert len(payload) == 2
    assert {item["topic"] for item in payload} == {"python", "database"}


@pytest.mark.asyncio
async def test_get_questions_topic_filter(client):
    from app.db.session import SessionLocal

    async with SessionLocal() as db:
        db.add_all(
            [
                Question(
                    text="Q1",
                    topic="python",
                    difficulty="middle",
                    tags="python",
                    created_at=datetime.now(timezone.utc),
                ),
                Question(
                    text="Q2",
                    topic="system-design",
                    difficulty="senior",
                    tags="architecture",
                    created_at=datetime.now(timezone.utc),
                ),
            ]
        )
        await db.commit()

    response = await client.get("/questions", params={"topic": "python"})

    assert response.status_code == 200
    payload = response.json()
    assert len(payload) == 1
    assert payload[0]["topic"] == "python"


@pytest.mark.asyncio
async def test_get_questions_difficulty_filter(client):
    from app.db.session import SessionLocal

    async with SessionLocal() as db:
        db.add_all(
            [
                Question(
                    text="Q1",
                    topic="python",
                    difficulty="junior",
                    tags="python",
                    created_at=datetime.now(timezone.utc),
                ),
                Question(
                    text="Q2",
                    topic="python",
                    difficulty="senior",
                    tags="python",
                    created_at=datetime.now(timezone.utc),
                ),
            ]
        )
        await db.commit()

    response = await client.get("/questions", params={"difficulty": "senior"})

    assert response.status_code == 200
    payload = response.json()
    assert len(payload) == 1
    assert payload[0]["difficulty"] == "senior"


@pytest.mark.asyncio
async def test_get_questions_tags_filter(client):
    from app.db.session import SessionLocal

    async with SessionLocal() as db:
        db.add_all(
            [
                Question(
                    text="Q1",
                    topic="python",
                    difficulty="middle",
                    tags="python,asyncio",
                    created_at=datetime.now(timezone.utc),
                ),
                Question(
                    text="Q2",
                    topic="python",
                    difficulty="middle",
                    tags="python,oop",
                    created_at=datetime.now(timezone.utc),
                ),
            ]
        )
        await db.commit()

    response = await client.get("/questions", params=[("tags", "asyncio")])

    assert response.status_code == 200
    payload = response.json()
    assert len(payload) == 1
    assert payload[0]["text"] == "Q1"


@pytest.mark.asyncio
async def test_get_questions_combined_filters(client):
    from app.db.session import SessionLocal

    async with SessionLocal() as db:
        db.add_all(
            [
                Question(
                    text="Q1",
                    topic="python",
                    difficulty="middle",
                    tags="python,asyncio",
                    created_at=datetime.now(timezone.utc),
                ),
                Question(
                    text="Q2",
                    topic="python",
                    difficulty="senior",
                    tags="python,asyncio",
                    created_at=datetime.now(timezone.utc),
                ),
            ]
        )
        await db.commit()

    response = await client.get(
        "/questions",
        params=[("topic", "python"), ("difficulty", "middle"), ("tags", "asyncio")],
    )

    assert response.status_code == 200
    payload = response.json()
    assert len(payload) == 1
    assert payload[0]["text"] == "Q1"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "params",
    [
        {"topic": ""},
        {"difficulty": ""},
        {"difficulty": "invalid-level"},
        [("tags", "")],
    ],
)
async def test_get_questions_invalid_filters_return_422(client, params):
    response = await client.get("/questions", params=params)
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_get_questions_empty_db_returns_empty_list(client):
    response = await client.get("/questions")

    assert response.status_code == 200
    assert response.json() == []


@pytest.mark.asyncio
async def test_get_questions_filters_without_matches_returns_empty_list(client):
    from app.db.session import SessionLocal

    async with SessionLocal() as db:
        db.add(
            Question(
                text="Q1",
                topic="python",
                difficulty="middle",
                tags="python,asyncio",
                created_at=datetime.now(timezone.utc),
            )
        )
        await db.commit()

    response = await client.get("/questions", params={"topic": "go"})

    assert response.status_code == 200
    assert response.json() == []
