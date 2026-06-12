from datetime import datetime, timezone

import pytest

from app.models.question import Question


async def _seed_questions(items):
    from app.db.session import SessionLocal

    async with SessionLocal() as db:
        db.add_all(
            [
                Question(
                    text=item["text"],
                    topic=item["topic"],
                    difficulty=item["difficulty"],
                    tags=item["tags"],
                    created_at=datetime.now(timezone.utc),
                )
                for item in items
            ]
        )
        await db.commit()


@pytest.mark.asyncio
async def test_get_questions_without_filters_returns_all(client):
    await _seed_questions(
        [
            {
                "text": "Explain Python GIL",
                "topic": "python",
                "difficulty": "middle",
                "tags": "python,concurrency",
            },
            {
                "text": "What is index in PostgreSQL?",
                "topic": "database",
                "difficulty": "junior",
                "tags": "postgres,index",
            },
        ]
    )

    response = await client.get("/questions")

    assert response.status_code == 200
    payload = response.json()
    assert len(payload) == 2
    assert {item["topic"] for item in payload} == {"python", "database"}


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("params", "items", "expected_len", "field", "expected_value"),
    [
        (
            {"topic": "python"},
            [
                {"text": "Q1", "topic": "python", "difficulty": "middle", "tags": "python"},
                {
                    "text": "Q2",
                    "topic": "system-design",
                    "difficulty": "senior",
                    "tags": "architecture",
                },
            ],
            1,
            "topic",
            "python",
        ),
        (
            {"difficulty": "senior"},
            [
                {"text": "Q1", "topic": "python", "difficulty": "junior", "tags": "python"},
                {"text": "Q2", "topic": "python", "difficulty": "senior", "tags": "python"},
            ],
            1,
            "difficulty",
            "senior",
        ),
        (
            [("tags", "asyncio")],
            [
                {"text": "Q1", "topic": "python", "difficulty": "middle", "tags": "python,asyncio"},
                {"text": "Q2", "topic": "python", "difficulty": "middle", "tags": "python,oop"},
            ],
            1,
            "text",
            "Q1",
        ),
        (
            [("topic", "python"), ("difficulty", "middle"), ("tags", "asyncio")],
            [
                {"text": "Q1", "topic": "python", "difficulty": "middle", "tags": "python,asyncio"},
                {"text": "Q2", "topic": "python", "difficulty": "senior", "tags": "python,asyncio"},
            ],
            1,
            "text",
            "Q1",
        ),
    ],
)
async def test_get_questions_filters(client, params, items, expected_len, field, expected_value):
    await _seed_questions(items)

    response = await client.get("/questions", params=params)

    assert response.status_code == 200
    payload = response.json()
    assert len(payload) == expected_len
    assert payload[0][field] == expected_value


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
    await _seed_questions(
        [{"text": "Q1", "topic": "python", "difficulty": "middle", "tags": "python,asyncio"}]
    )

    response = await client.get("/questions", params={"topic": "go"})

    assert response.status_code == 200
    assert response.json() == []
