import os
import sys
from pathlib import Path

import pytest
import httpx


@pytest.fixture(scope="session")
def anyio_backend():
    return "asyncio"


@pytest.fixture(scope="session", autouse=True)
def _set_env():
    sys.path.append(str(Path(__file__).resolve().parents[1]))
    os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///./test.db"
    os.environ["JWT_SECRET"] = "test_jwt_secret"
    os.environ["SESSION_SECRET"] = "test_session_secret"


@pytest.fixture
async def client():
    from app.main import app
    from app.db.session import Base, engine

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
