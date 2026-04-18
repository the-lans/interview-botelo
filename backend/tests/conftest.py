import os
import sys
from pathlib import Path

import httpx
import pytest


def pytest_configure(config):
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///./test.db")
    os.environ.setdefault("JWT_SECRET", "test_jwt_secret")
    os.environ.setdefault("SESSION_SECRET", "test_session_secret")
    os.environ.setdefault("APP_ENV", "test")
    os.environ.setdefault("FRONTEND_BASE_URL", "http://test")


@pytest.fixture
async def client():
    from app.db.session import Base, engine
    from app.main import app

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
