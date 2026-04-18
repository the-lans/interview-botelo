from datetime import datetime

from sqlalchemy import select

from app.db.session import AsyncSessionLocal
from app.models.question import Question

SEED_QUESTIONS = [
    {
        "text": "Что такое GIL в Python и как он влияет на многопоточность?",
        "topic": "python",
        "difficulty": "middle",
        "tags": "python,concurrency,threads",
        "sample_answer": "GIL ограничивает одновременное выполнение Python-байткода в одном процессе.",
    },
    {
        "text": "Объясните разницу между LEFT JOIN и INNER JOIN.",
        "topic": "database",
        "difficulty": "junior",
        "tags": "sql,joins,postgres",
        "sample_answer": "INNER JOIN оставляет только пересечение, LEFT JOIN сохраняет все строки из левой таблицы.",
    },
    {
        "text": "Как спроектировать rate limiter для API?",
        "topic": "system-design",
        "difficulty": "senior",
        "tags": "architecture,api,scaling",
        "sample_answer": "Через токен-бакет/слидинг-виндоу с Redis и атомарными операциями.",
    },
]


async def seed_questions() -> int:
    inserted = 0
    async with AsyncSessionLocal() as db:
        for item in SEED_QUESTIONS:
            exists = await db.execute(select(Question).where(Question.text == item["text"]))
            if exists.scalar_one_or_none() is not None:
                continue

            db.add(
                Question(
                    text=item["text"],
                    topic=item["topic"],
                    difficulty=item["difficulty"],
                    tags=item["tags"],
                    created_at=datetime.utcnow(),
                    sample_answer=item["sample_answer"],
                )
            )
            inserted += 1

        await db.commit()
    return inserted


if __name__ == "__main__":
    import asyncio

    count = asyncio.run(seed_questions())
    print(f"Inserted {count} questions")
