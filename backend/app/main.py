from fastapi import FastAPI
from sqlalchemy import text
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware

from app.api.routes import router
from app.db.session import Base, engine
from app.services.csrf import CSRFMiddleware

app = FastAPI(title="Interview Coach")
app.add_middleware(ProxyHeadersMiddleware, trusted_hosts=["127.0.0.1", "::1"])
app.add_middleware(CSRFMiddleware)
app.include_router(router)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.on_event("startup")
async def on_startup():
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
