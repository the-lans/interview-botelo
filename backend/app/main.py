from fastapi import FastAPI
from sqlalchemy import select, text
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware

from app.api.routes import router
from app.core.config import get_settings
from app.db.session import Base, SessionLocal, engine
from app.db.startup import apply_startup_migrations
from app.models import Question
from app.services.csrf import CSRFMiddleware

app = FastAPI(title="Interview Coach")
app.add_middleware(ProxyHeadersMiddleware, trusted_hosts=["127.0.0.1", "::1"])
app.add_middleware(CSRFMiddleware)
app.include_router(router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


async def _seed_questions() -> None:
    seed_data = [
        {
            "text": "Расскажите про GIL в Python и его влияние на многопоточность.",
            "topic": "python",
            "difficulty": "middle",
            "tags": "python,concurrency",
        },
        {
            "text": "Что такое индекс в SQL и какие у него компромиссы?",
            "topic": "sql",
            "difficulty": "junior",
            "tags": "sql,database,indexes",
        },
        {
            "text": "Как работает event loop в asyncio и где частые ошибки?",
            "topic": "python",
            "difficulty": "senior",
            "tags": "python,asyncio,architecture",
        },
    ]

    async with SessionLocal() as session:
        existing = await session.execute(select(Question.id).limit(1))
        if existing.first() is not None:
            return

        questions = [Question(**item) for item in seed_data]
        session.add_all(questions)
        await session.commit()


@app.on_event("startup")
async def on_startup() -> None:
    settings = get_settings()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.execute(text("SELECT 1"))
        await apply_startup_migrations(conn)

    if settings.APP_ENV != "test":
        await _seed_questions()
