from __future__ import annotations

from collections.abc import Sequence

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncConnection

STARTUP_MIGRATIONS: tuple[str, ...] = (
    "ALTER TABLE interview_sessions ADD COLUMN IF NOT EXISTS question_id INTEGER",
    "ALTER TABLE interview_sessions ADD COLUMN IF NOT EXISTS total_questions INTEGER DEFAULT 1",
    "ALTER TABLE interview_sessions ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ",
    "ALTER TABLE interview_answers ADD COLUMN IF NOT EXISTS question_id INTEGER",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_token VARCHAR(255)",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_expires_at TIMESTAMPTZ",
    (
        "ALTER TABLE users "
        "ALTER COLUMN email_verification_expires_at TYPE TIMESTAMPTZ "
        "USING email_verification_expires_at AT TIME ZONE 'UTC'"
    ),
    (
        "ALTER TABLE users "
        "ALTER COLUMN created_at TYPE TIMESTAMPTZ "
        "USING created_at AT TIME ZONE 'UTC'"
    ),
    "ALTER TABLE plans ADD COLUMN IF NOT EXISTS resume_text TEXT DEFAULT ''",
    "ALTER TABLE plans ADD COLUMN IF NOT EXISTS vacancy_text TEXT DEFAULT ''",
    "ALTER TABLE plans ADD COLUMN IF NOT EXISTS brief_json TEXT DEFAULT '{}'",
    "ALTER TABLE plans ADD COLUMN IF NOT EXISTS plan_json TEXT DEFAULT '{}'",
    "ALTER TABLE progress ADD COLUMN IF NOT EXISTS topic_key VARCHAR(120)",
    (
        "UPDATE progress "
        "SET topic_key = LOWER(REGEXP_REPLACE(BTRIM(topic), '\\s+', ' ', 'g')) "
        "WHERE topic_key IS NULL OR topic_key = ''"
    ),
    "ALTER TABLE progress ALTER COLUMN topic_key SET NOT NULL",
    (
        "CREATE INDEX IF NOT EXISTS idx_progress_user_topic_key_updated_at "
        "ON progress (user_id, topic_key, updated_at DESC, id DESC)"
    ),
    (
        "ALTER TABLE progress "
        "ALTER COLUMN updated_at TYPE TIMESTAMPTZ "
        "USING updated_at AT TIME ZONE 'UTC'"
    ),
    (
        "ALTER TABLE plans "
        "ALTER COLUMN created_at TYPE TIMESTAMPTZ "
        "USING created_at AT TIME ZONE 'UTC'"
    ),
    "ALTER TABLE questions ADD COLUMN IF NOT EXISTS tags VARCHAR(512) DEFAULT ''",
    "ALTER TABLE questions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()",
    (
        "ALTER TABLE questions "
        "ALTER COLUMN created_at TYPE TIMESTAMPTZ "
        "USING created_at AT TIME ZONE 'UTC'"
    ),
    (
        "ALTER TABLE resumes "
        "ALTER COLUMN created_at TYPE TIMESTAMPTZ "
        "USING created_at AT TIME ZONE 'UTC'"
    ),
    (
        "ALTER TABLE interview_sessions "
        "ALTER COLUMN started_at TYPE TIMESTAMPTZ "
        "USING started_at AT TIME ZONE 'UTC'"
    ),
    (
        "ALTER TABLE interview_sessions "
        "ALTER COLUMN completed_at TYPE TIMESTAMPTZ "
        "USING completed_at AT TIME ZONE 'UTC'"
    ),
)


async def apply_startup_migrations(
    conn: AsyncConnection,
    *,
    statements: Sequence[str] = STARTUP_MIGRATIONS,
) -> None:
    for statement in statements:
        try:
            await conn.execute(text(statement))
        except SQLAlchemyError:
            # Миграции best-effort для существующих БД: на старых/SQLite часть ALTER недоступна.
            continue
