from fastapi import FastAPI
from sqlalchemy import select, text
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware

from app.api.routes import router
from app.core.config import get_settings
from app.db.session import Base, SessionLocal, engine
from app.models import Question
from app.services.csrf import CSRFMiddleware

app = FastAPI(title="Interview Coach")
app.add_middleware(ProxyHeadersMiddleware, trusted_hosts=["127.0.0.1", "::1"])
app.add_middleware(CSRFMiddleware)
app.include_router(router)


@app.get("/health")
async def health():
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
async def on_startup():
    settings = get_settings()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.execute(text("SELECT 1"))

        # Ensure columns exist for existing DBs (PostgreSQL)
        try:
            await conn.execute(
                text("ALTER TABLE interview_sessions ADD COLUMN IF NOT EXISTS question_id INTEGER")
            )
        except Exception:
            pass
        try:
            await conn.execute(
                text(
                    "ALTER TABLE users "
                    "ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE"
                )
            )
        except Exception:
            pass
        try:
            await conn.execute(
                text(
                    "ALTER TABLE users "
                    "ADD COLUMN IF NOT EXISTS email_verification_token VARCHAR(255)"
                )
            )
        except Exception:
            pass
        try:
            await conn.execute(
                text(
                    "ALTER TABLE users "
                    "ADD COLUMN IF NOT EXISTS email_verification_expires_at TIMESTAMP"
                )
            )
        except Exception:
            pass
        try:
            await conn.execute(
                text("ALTER TABLE plans ADD COLUMN IF NOT EXISTS resume_text TEXT DEFAULT ''")
            )
        except Exception:
            pass
        try:
            await conn.execute(
                text("ALTER TABLE plans ADD COLUMN IF NOT EXISTS vacancy_text TEXT DEFAULT ''")
            )
        except Exception:
            pass
        try:
            await conn.execute(
                text("ALTER TABLE plans ADD COLUMN IF NOT EXISTS brief_json TEXT DEFAULT '{}' ")
            )
        except Exception:
            pass
        try:
            await conn.execute(
                text("ALTER TABLE plans ADD COLUMN IF NOT EXISTS plan_json TEXT DEFAULT '{}' ")
            )
        except Exception:
            pass
        try:
            await conn.execute(
                text("ALTER TABLE questions ADD COLUMN IF NOT EXISTS tags VARCHAR(512) DEFAULT ''")
            )
        except Exception:
            pass
        try:
            await conn.execute(
                text(
                    "ALTER TABLE questions "
                    "ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()"
                )
            )
        except Exception:
            pass

    if settings.APP_ENV != "test":
        await _seed_questions()
