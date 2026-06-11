from __future__ import annotations

import json
import os
from pathlib import Path

os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///./openapi.db")
os.environ.setdefault("JWT_SECRET", "openapi-jwt-secret")
os.environ.setdefault("SESSION_SECRET", "openapi-session-secret")

from app.main import app

PROJECT_ROOT = Path(__file__).resolve().parents[2]
OPENAPI_PATH = PROJECT_ROOT / "docs" / "openapi.json"


def main() -> None:
    OPENAPI_PATH.parent.mkdir(parents=True, exist_ok=True)
    OPENAPI_PATH.write_text(
        json.dumps(
            app.openapi(),
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
