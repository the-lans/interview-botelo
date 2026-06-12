from __future__ import annotations

import zlib
from dataclasses import dataclass
from datetime import datetime
from typing import Literal

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Plan, Progress


@dataclass(frozen=True)
class ProgressMutationResult:
    detail: Literal["created", "updated", "unchanged"]
    topic: Progress


async def acquire_progress_topic_lock(
    db: AsyncSession,
    *,
    user_id: int,
    topic_key: str,
) -> None:
    bind = db.get_bind()
    if bind is None or bind.dialect.name != "postgresql":
        return

    # Блокируем обновление темы в рамках транзакции, чтобы не создавать дубли.
    await db.execute(
        text("SELECT pg_advisory_xact_lock(:user_id, :topic_hash)"),
        {
            "user_id": user_id,
            "topic_hash": int(zlib.crc32(topic_key.encode("utf-8"))),
        },
    )


async def get_latest_progress_entry(
    db: AsyncSession,
    *,
    user_id: int,
    topic_key: str,
) -> Progress | None:
    result = await db.execute(
        select(Progress)
        .where(
            Progress.user_id == user_id,
            Progress.topic_key == topic_key,
        )
        .order_by(Progress.updated_at.desc(), Progress.id.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def upsert_progress_entry(
    db: AsyncSession,
    *,
    user_id: int,
    topic: str,
    topic_key: str,
    status: Literal["todo", "in_progress", "done"],
    updated_at: datetime,
) -> ProgressMutationResult:
    await acquire_progress_topic_lock(
        db,
        user_id=user_id,
        topic_key=topic_key,
    )
    latest_entry = await get_latest_progress_entry(
        db,
        user_id=user_id,
        topic_key=topic_key,
    )

    if latest_entry and latest_entry.status == status:
        return ProgressMutationResult(detail="unchanged", topic=latest_entry)

    progress_entry = Progress(
        user_id=user_id,
        topic=topic,
        topic_key=topic_key,
        status=status,
        updated_at=updated_at,
    )
    db.add(progress_entry)
    await db.flush()

    return ProgressMutationResult(
        detail="updated" if latest_entry else "created",
        topic=progress_entry,
    )


async def list_latest_progress_entries(
    db: AsyncSession,
    *,
    user_id: int,
) -> list[Progress]:
    latest_ranked_progress = (
        select(
            Progress.id.label("id"),
            func.row_number()
            .over(
                partition_by=Progress.topic_key,
                order_by=(Progress.updated_at.desc(), Progress.id.desc()),
            )
            .label("row_number"),
        )
        .where(Progress.user_id == user_id)
        .subquery()
    )
    result = await db.execute(
        select(Progress)
        .join(latest_ranked_progress, Progress.id == latest_ranked_progress.c.id)
        .where(latest_ranked_progress.c.row_number == 1)
        .order_by(Progress.updated_at.desc(), Progress.id.desc())
    )
    return list(result.scalars().all())


async def list_progress_history(
    db: AsyncSession,
    *,
    user_id: int,
    limit: int,
) -> list[Progress]:
    result = await db.execute(
        select(Progress)
        .where(Progress.user_id == user_id)
        .order_by(Progress.updated_at.desc(), Progress.id.desc())
        .limit(limit)
    )
    return list(result.scalars().all())


async def get_latest_plan(
    db: AsyncSession,
    *,
    user_id: int,
) -> Plan | None:
    result = await db.execute(
        select(Plan).where(Plan.user_id == user_id).order_by(Plan.created_at.desc()).limit(1)
    )
    return result.scalar_one_or_none()
