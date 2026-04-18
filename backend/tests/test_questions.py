import pytest
from sqlalchemy import select

from app.db.session import SessionLocal
from app.models.question import Question


async def _insert_questions() -> None:
    questions = [
        Question(
            text="Explain Python GIL",
            topic="python",
            difficulty="middle",
            tags="python,concurrency",
        ),
        Question(
            text="What is SQL index",
            topic="sql",
            difficulty="junior",
            tags="sql,database",
        ),
        Question(
            text="AsyncIO event loop",
            topic="python",
            difficulty="senior",
            tags="python,async",
        ),
    ]
    async with SessionLocal() as session:
        session.add_all(questions)
        await session.commit()


@pytest.mark.asyncio
async def test_get_questions_without_filters(client):
    await _insert_questions()

    response = await client.get("/questions")

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 3


@pytest.mark.asyncio
async def test_get_questions_by_topic(client):
    await _insert_questions()

    response = await client.get("/questions", params={"topic": "python"})

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2
    assert all(item["topic"] == "python" for item in data)


@pytest.mark.asyncio
async def test_get_questions_by_difficulty(client):
    await _insert_questions()

    response = await client.get("/questions", params={"difficulty": "junior"})

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["difficulty"] == "junior"


@pytest.mark.asyncio
async def test_get_questions_by_tags_any_match(client):
    await _insert_questions()

    response = await client.get("/questions", params=[("tags", "database"), ("tags", "async")])

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2
    ids = {item["text"] for item in data}
    assert "What is SQL index" in ids
    assert "AsyncIO event loop" in ids


@pytest.mark.asyncio
async def test_get_questions_combined_filters(client):
    await _insert_questions()

    response = await client.get(
        "/questions",
        params=[("topic", "python"), ("difficulty", "senior"), ("tags", "async")],
    )

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["text"] == "AsyncIO event loop"


@pytest.mark.asyncio
async def test_get_questions_empty_db(client):
    response = await client.get("/questions")

    assert response.status_code == 200
    assert response.json() == []


@pytest.mark.asyncio
async def test_get_questions_filters_without_matches(client):
    await _insert_questions()

    response = await client.get("/questions", params={"topic": "go"})

    assert response.status_code == 200
    assert response.json() == []


@pytest.mark.asyncio
async def test_get_questions_invalid_topic(client):
    response = await client.get("/questions", params={"topic": "x" * 121})

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_get_questions_invalid_difficulty(client):
    response = await client.get("/questions", params={"difficulty": "lead"})

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_get_questions_invalid_tags_length(client):
    response = await client.get("/questions", params={"tags": "x" * 51})

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_seed_questions_not_created_in_test_env(client):
    async with SessionLocal() as session:
        result = await session.execute(select(Question))
        questions = result.scalars().all()

    assert len(questions) == 0
