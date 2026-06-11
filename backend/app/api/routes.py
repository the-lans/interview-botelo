from __future__ import annotations

import json
import secrets
import subprocess
from datetime import datetime, timedelta
from datetime import timezone as dt_timezone
from io import BytesIO
from tempfile import NamedTemporaryFile

from docx import Document
from docx.opc.exceptions import PackageNotFoundError
from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, Response, UploadFile
from fastapi.responses import RedirectResponse
from sqlalchemy import String, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from striprtf.striprtf import rtf_to_text

from app.api.schemas import (
    GeneratedPlanOut,
    InterviewAnswerIn,
    InterviewAnswerOut,
    InterviewStartOut,
    LoginIn,
    MessageOut,
    PlanGenerateOut,
    PlanIn,
    ProgressOut,
    ProgressUpsertIn,
    ProgressUpsertOut,
    ResendVerificationIn,
    SignupIn,
    VacancyIngestIn,
    VacancyIngestOut,
)
from app.core.config import get_settings
from app.core.time import utc_now
from app.db.progress import (
    get_latest_plan,
    list_latest_progress_entries,
    list_progress_history,
    upsert_progress_entry,
)
from app.db.session import get_db
from app.models import InterviewAnswer, InterviewSession, Plan, Progress, Question, Resume, User
from app.services.ai_proxy import chat_completion
from app.services.auth import get_current_user
from app.services.emailer import EmailDeliveryError, send_email
from app.services.rate_limit import check_rate_limit
from app.services.security import (
    create_access_token,
    hash_email_token,
    hash_password,
    verify_password,
)
from app.services.vacancy_ingest import (
    MAX_VACANCY_TEXT_LENGTH,
    ingest_vacancy,
    normalize_text,
)

router = APIRouter()

MAX_RESUME_FILE_SIZE_BYTES = 5 * 1024 * 1024
MAX_INTERVIEW_QUESTIONS = 3
PROGRESS_STATUSES = ("todo", "in_progress", "done")
PROGRESS_HISTORY_LIMIT = 50
RESUME_ALLOWED_TYPES = {
    ".md": {"text/markdown", "text/plain"},
    ".txt": {"text/plain"},
    ".rtf": {"application/rtf", "text/rtf"},
    ".doc": {"application/msword"},
    ".docx": {
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    },
}


def _tokenize_text(value: str) -> set[str]:
    cleaned = "".join(char.lower() if char.isalnum() else " " for char in value)
    return {token for token in cleaned.split() if len(token) >= 3}


def _score_interview_answer(question: Question, answer: str) -> float:
    answer_tokens = _tokenize_text(answer)
    answer_word_count = len(answer.split())
    if answer_word_count == 0:
        return 0.0

    reference_tokens = _tokenize_text(question.text)
    reference_tokens.update(_tokenize_text(question.tags))
    if question.sample_answer:
        reference_tokens.update(_tokenize_text(question.sample_answer))

    overlap = len(answer_tokens & reference_tokens)
    overlap_score = min(35.0, overlap * 8.0)

    depth_score = min(45.0, answer_word_count * 2.5)
    structure_score = 20.0 if any(mark in answer for mark in (".", ",", ";", ":")) else 10.0

    raw_score = overlap_score + depth_score + structure_score
    return round(min(100.0, raw_score), 2)


def _build_interview_summary(scores: list[float]) -> str:
    average_score = sum(scores) / len(scores)
    rounded_score = round(average_score, 2)

    if rounded_score >= 80:
        verdict = "Сильный результат: ответы в целом полные и по делу."
    elif rounded_score >= 60:
        verdict = "Нормальный результат: база есть, но глубину стоит усилить."
    else:
        verdict = "Есть заметные пробелы: ответы пока слишком короткие или поверхностные."

    if rounded_score >= 75:
        next_step = (
            "Следующий шаг: потренировать более чёткую структуру ответа под реальные интервью."
        )
    elif rounded_score >= 50:
        next_step = (
            "Следующий шаг: добавить больше конкретики, терминов и причинно-следственных связей."
        )
    else:
        next_step = (
            "Следующий шаг: повторить теорию по темам интервью "
            "и отработать развёрнутые ответы вслух."
        )

    return f"{verdict} Итоговый балл: {rounded_score}/100. {next_step}"


def _normalize_progress_topic(value: str) -> str:
    return " ".join(value.split()).casefold()


def _ensure_utc_datetime(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=dt_timezone.utc)
    return value.astimezone(dt_timezone.utc)


def _extract_topics_from_plan(plan: Plan | None) -> list[str]:
    if plan is None or not plan.plan_json:
        return []

    try:
        payload = json.loads(plan.plan_json)
    except json.JSONDecodeError:
        return []

    topics: list[str] = []
    seen_keys: set[str] = set()
    for week in payload.get("weeks", []):
        week_themes = week.get("themes", [])
        if not isinstance(week_themes, list):
            continue

        for theme in week_themes:
            if not isinstance(theme, str):
                continue
            normalized = " ".join(theme.split())
            if not normalized:
                continue
            normalized_key = _normalize_progress_topic(normalized)
            if normalized_key in seen_keys:
                continue
            seen_keys.add(normalized_key)
            topics.append(normalized)

    return topics


def _serialize_progress(
    latest_entries: list[Progress],
    plan_topics: list[str],
    history_entries: list[Progress],
) -> dict[str, object]:
    latest_by_topic: dict[str, Progress] = {}
    ordered_topics: list[str] = []
    seen_topics: set[str] = set()

    for topic in plan_topics:
        topic_key = _normalize_progress_topic(topic)
        if topic_key in seen_topics:
            continue
        seen_topics.add(topic_key)
        ordered_topics.append(topic)

    for entry in latest_entries:
        topic_key = entry.topic_key
        if topic_key not in latest_by_topic:
            latest_by_topic[topic_key] = entry
        if topic_key not in seen_topics:
            seen_topics.add(topic_key)
            ordered_topics.append(" ".join(entry.topic.split()))

    topics: list[dict[str, object]] = []
    status_counts = {status: 0 for status in PROGRESS_STATUSES}
    completed_topics = 0

    for topic in ordered_topics:
        topic_key = _normalize_progress_topic(topic)
        latest_entry = latest_by_topic.get(topic_key)
        current_status = latest_entry.status if latest_entry else "todo"
        if current_status in status_counts:
            status_counts[current_status] += 1
        if current_status == "done":
            completed_topics += 1
        topics.append(
            {
                "topic": latest_entry.topic if latest_entry else topic,
                "status": current_status,
                "updated_at": (
                    _ensure_utc_datetime(latest_entry.updated_at) if latest_entry else None
                ),
            }
        )

    total_topics = len(topics)
    completion_percent = round((completed_topics / total_topics) * 100, 2) if total_topics else 0.0

    history = [
        {
            "topic": " ".join(entry.topic.split()),
            "status": entry.status,
            "updated_at": _ensure_utc_datetime(entry.updated_at),
        }
        for entry in history_entries
    ]

    return {
        "summary": {
            "total_topics": total_topics,
            "completed_topics": completed_topics,
            "completion_percent": completion_percent,
            "status_counts": status_counts,
        },
        "topics": topics,
        "history": history,
    }


@router.post("/auth/signup", response_model=MessageOut)
async def signup(data: SignupIn, db: AsyncSession = Depends(get_db)):
    settings = get_settings()
    res = await db.execute(select(User).where(User.email == data.email))
    if res.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")

    token = secrets.token_urlsafe(32)
    expires_at = utc_now() + timedelta(hours=settings.EMAIL_VERIFY_TOKEN_TTL_HOURS)

    user = User(
        email=data.email,
        password_hash=hash_password(data.password),
        email_verified=False,
        email_verification_token=hash_email_token(token),
        email_verification_expires_at=expires_at,
    )
    verify_link = f"{settings.FRONTEND_BASE_URL}/auth/verify?token={token}"
    body = (
        "Подтверждение регистрации.\n\n"
        f"Перейдите по ссылке для подтверждения email:\n{verify_link}\n\n"
        "Если вы не регистрировались, просто игнорируйте это письмо."
    )
    try:
        send_email(data.email, "Подтверждение регистрации", body)
    except EmailDeliveryError as error:
        raise HTTPException(status_code=503, detail="Verification email is unavailable") from error

    db.add(user)
    await db.commit()

    return {"detail": "verification_sent"}


@router.post("/auth/login", response_model=MessageOut)
async def login(
    request: Request, response: Response, data: LoginIn, db: AsyncSession = Depends(get_db)
):
    ip = request.client.host if request.client else "unknown"
    rate_limit_key = f"login:{ip}:{data.email.lower()}"
    if not check_rate_limit(rate_limit_key):
        raise HTTPException(status_code=429, detail="Too many attempts")

    res = await db.execute(select(User).where(User.email == data.email))
    user = res.scalar_one_or_none()
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not user.email_verified:
        raise HTTPException(status_code=403, detail="Email not verified")

    token = create_access_token(str(user.id))
    response.set_cookie("session", token, httponly=True, samesite="lax")
    response.set_cookie("csrf_token", token[-24:], httponly=False, samesite="lax")
    return {"detail": "ok"}


@router.post("/auth/logout", response_model=MessageOut)
async def logout(response: Response):
    response.delete_cookie("session")
    response.delete_cookie("csrf_token")
    return {"detail": "ok"}


@router.get("/auth/verify")
async def verify_email(token: str, db: AsyncSession = Depends(get_db)):
    settings = get_settings()
    token_hash = hash_email_token(token)
    res = await db.execute(select(User).where(User.email_verification_token == token_hash))
    user = res.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=400, detail="Invalid token")
    if (
        user.email_verification_expires_at
        and _ensure_utc_datetime(user.email_verification_expires_at) < utc_now()
    ):
        raise HTTPException(status_code=400, detail="Token expired")

    user.email_verified = True
    user.email_verification_token = None
    user.email_verification_expires_at = None
    await db.commit()

    return RedirectResponse(url=f"{settings.FRONTEND_BASE_URL}/login?verified=1")


@router.post("/auth/resend-verification", response_model=MessageOut)
async def resend_verification(
    request: Request,
    data: ResendVerificationIn,
    db: AsyncSession = Depends(get_db),
):
    ip = request.client.host if request.client else "unknown"
    if not check_rate_limit(f"resend:{ip}:{data.email.lower()}"):
        raise HTTPException(status_code=429, detail="Too many attempts")

    res = await db.execute(select(User).where(User.email == data.email))
    user = res.scalar_one_or_none()
    if not user or user.email_verified:
        return {"detail": "verification_sent"}

    settings = get_settings()
    token = secrets.token_urlsafe(32)
    token_hash = hash_email_token(token)
    expires_at = utc_now() + timedelta(hours=settings.EMAIL_VERIFY_TOKEN_TTL_HOURS)

    verify_link = f"{settings.FRONTEND_BASE_URL}/auth/verify?token={token}"
    body = (
        "Повторная отправка подтверждения регистрации.\n\n"
        f"Перейдите по ссылке для подтверждения email:\n{verify_link}\n\n"
        "Если вы не регистрировались, просто игнорируйте это письмо."
    )
    try:
        send_email(data.email, "Подтверждение регистрации", body)
    except EmailDeliveryError as error:
        raise HTTPException(status_code=503, detail="Verification email is unavailable") from error

    user.email_verification_token = token_hash
    user.email_verification_expires_at = expires_at
    await db.commit()
    return {"detail": "verification_sent"}


@router.post("/upload/resume", response_model=MessageOut)
async def upload_resume(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    content = ""
    original_filename = file.filename or ""
    filename = original_filename.lower()
    content_type = (file.content_type or "").lower()
    data = await file.read()
    file_size_bytes = len(data)

    extension = ""
    if "." in filename:
        extension = f".{filename.rsplit('.', 1)[-1]}"

    if not extension or extension not in RESUME_ALLOWED_TYPES:
        raise HTTPException(status_code=415, detail="Unsupported file extension")

    allowed_mime_types = RESUME_ALLOWED_TYPES[extension]
    if content_type not in allowed_mime_types:
        raise HTTPException(status_code=415, detail="Unsupported MIME type")

    if file_size_bytes == 0:
        raise HTTPException(status_code=400, detail="Empty file")

    if file_size_bytes > MAX_RESUME_FILE_SIZE_BYTES:
        raise HTTPException(status_code=413, detail="File too large")

    if extension in {".md", ".txt"}:
        content = data.decode("utf-8", errors="replace")
    elif extension == ".rtf":
        content = rtf_to_text(data.decode("utf-8", errors="replace"))
    elif extension == ".docx":
        try:
            doc = Document(BytesIO(data))
            content = "\n".join(p.text for p in doc.paragraphs)
        except PackageNotFoundError as exc:
            raise HTTPException(status_code=415, detail="Failed to parse .docx file") from exc
        except Exception as exc:
            raise HTTPException(status_code=415, detail="Failed to parse .docx file") from exc
    elif extension == ".doc":
        # Requires system package: antiword
        try:
            with NamedTemporaryFile(suffix=".doc", delete=True) as tmp:
                tmp.write(data)
                tmp.flush()
                res = subprocess.run(
                    ["antiword", tmp.name], capture_output=True, text=True, check=False
                )
            if res.returncode != 0:
                raise HTTPException(status_code=415, detail="Failed to parse .doc file")
            content = res.stdout
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=415, detail="Failed to parse .doc file") from exc

    if not content.strip():
        raise HTTPException(status_code=400, detail="Empty resume")

    resume = Resume(
        user_id=user.id,
        filename=original_filename,
        mime_type=content_type,
        file_size_bytes=file_size_bytes,
        content=content,
    )
    db.add(resume)
    await db.commit()
    return {"detail": "ok"}


@router.post("/vacancy/ingest", response_model=VacancyIngestOut)
async def vacancy_ingest(
    data: VacancyIngestIn,
    _user: User = Depends(get_current_user),
):
    vacancy_text = await ingest_vacancy(data.url, data.raw_text)
    return {"vacancy_text": vacancy_text}


@router.post("/plan/generate", response_model=PlanGenerateOut)
async def generate_plan(
    data: PlanIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if data.resume_text and data.resume_text.strip():
        resume_text = data.resume_text.strip()
    else:
        res = await db.execute(
            select(Resume).where(Resume.user_id == user.id).order_by(Resume.created_at.desc())
        )
        resume = res.scalars().first()
        if not resume:
            raise HTTPException(status_code=400, detail="Resume not uploaded")
        resume_text = resume.content

    vacancy_text = normalize_text(data.vacancy_text)
    if len(vacancy_text) > MAX_VACANCY_TEXT_LENGTH:
        raise HTTPException(status_code=413, detail="Vacancy text is too long")

    prompt = (
        "Generate strict JSON only with keys: summary, gap_analysis, weeks, final_readiness_check. "
        "weeks is an array where each item has week, themes, practice, "
        "mock_interview, expected_outcome, time_budget_hours."
    )
    messages = [
        {"role": "system", "content": "You are an interview coach."},
        {
            "role": "user",
            "content": (
                f"Resume:\n{resume_text}\n\n"
                f"Vacancy:\n{vacancy_text}\n\n"
                f"Brief:\n{data.brief.model_dump_json(indent=2)}"
            ),
        },
        {"role": "user", "content": prompt},
    ]
    try:
        ai_resp = await chat_completion(messages)
        content = ai_resp["choices"][0]["message"]["content"]
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Plan generation failed") from exc

    try:
        plan_json = json.loads(content)
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Plan generation failed") from exc

    try:
        validated_plan = GeneratedPlanOut.model_validate(plan_json)
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Plan generation failed") from exc

    plan = Plan(
        user_id=user.id,
        resume_text=resume_text,
        vacancy_text=vacancy_text,
        brief_json=data.brief.model_dump_json(),
        plan_json=json.dumps(validated_plan.model_dump(), ensure_ascii=False),
        content=content,
    )
    db.add(plan)
    await db.commit()
    await db.refresh(plan)
    return {"detail": "ok", "plan_id": plan.id, "plan": validated_plan.model_dump()}


@router.get("/questions")
async def get_questions(
    topic: str | None = Query(default=None, min_length=1, max_length=120),
    difficulty: str | None = Query(default=None, pattern="^(junior|middle|senior)$"),
    tags: list[str] | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Question)

    if topic is not None:
        stmt = stmt.where(Question.topic == topic)

    if difficulty is not None:
        stmt = stmt.where(Question.difficulty == difficulty)

    if tags:
        normalized_tags = [tag.strip() for tag in tags if tag.strip()]
        if len(normalized_tags) != len(tags):
            raise HTTPException(status_code=422, detail="Tags must be non-empty strings")
        tags_with_commas = func.concat(",", func.replace(Question.tags, " ", ""), ",").cast(String)
        for tag in normalized_tags:
            normalized_tag = tag.replace(" ", "")
            stmt = stmt.where(tags_with_commas.like(f"%,{normalized_tag},%"))

    res = await db.execute(stmt)
    return [
        {
            "id": q.id,
            "text": q.text,
            "topic": q.topic,
            "difficulty": q.difficulty,
            "tags": [tag.strip() for tag in q.tags.split(",") if tag.strip()],
            "created_at": q.created_at,
            "sample_answer": q.sample_answer,
        }
        for q in res.scalars().all()
    ]


@router.post("/interview/start", response_model=InterviewStartOut)
async def interview_start(
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    total_questions_res = await db.execute(select(func.count(Question.id)))
    total_questions_in_db = total_questions_res.scalar_one()
    if total_questions_in_db == 0:
        raise HTTPException(status_code=400, detail="No questions in database")

    res = await db.execute(select(Question).order_by(func.random()).limit(1))
    question = res.scalar_one_or_none()
    if not question:
        raise HTTPException(status_code=400, detail="No questions in database")

    session = InterviewSession(
        user_id=user.id,
        question_id=question.id,
        total_questions=min(MAX_INTERVIEW_QUESTIONS, total_questions_in_db),
        started_at=utc_now(),
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)

    return {"session_id": session.id, "question_id": question.id, "question": question.text}


@router.post("/interview/answer", response_model=InterviewAnswerOut)
async def interview_answer(
    data: InterviewAnswerIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    normalized_answer = data.answer.strip()
    if not normalized_answer:
        raise HTTPException(status_code=422, detail="Answer must not be empty")

    res = await db.execute(
        select(InterviewSession).where(
            InterviewSession.id == data.session_id,
            InterviewSession.user_id == user.id,
        )
    )
    session = res.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if session.completed_at is not None:
        raise HTTPException(status_code=400, detail="Session already completed")

    if not session.question_id or session.question_id != data.question_id:
        raise HTTPException(status_code=400, detail="Question mismatch")

    q = await db.execute(select(Question).where(Question.id == data.question_id))
    question = q.scalar_one_or_none()
    if not question:
        raise HTTPException(status_code=400, detail="Question not found")

    messages = [
        {"role": "system", "content": "You are an interviewer. Provide brief feedback."},
        {"role": "user", "content": f"Q: {question.text}\nA: {data.answer}"},
    ]
    try:
        ai_resp = await chat_completion(messages)
        feedback = ai_resp["choices"][0]["message"]["content"]
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Feedback unavailable") from exc

    answer_score = _score_interview_answer(question, normalized_answer)
    answer = InterviewAnswer(
        session_id=session.id,
        question_id=question.id,
        question=question.text,
        answer=normalized_answer,
        feedback=feedback,
        score=answer_score,
    )
    db.add(answer)
    await db.flush()

    answered_question_ids_res = await db.execute(
        select(InterviewAnswer.question_id).where(InterviewAnswer.session_id == session.id)
    )
    answered_question_ids = [
        question_id for question_id in answered_question_ids_res.scalars().all()
    ]
    answered_count = len(answered_question_ids)

    if answered_count >= session.total_questions:
        all_scores_res = await db.execute(
            select(InterviewAnswer.score).where(InterviewAnswer.session_id == session.id)
        )
        scores = [float(score) for score in all_scores_res.scalars().all() if score is not None]
        session_score = round(sum(scores) / len(scores), 2) if scores else round(answer_score, 2)
        session.question_id = None
        session.completed_at = utc_now()
        session.score = session_score
        await db.commit()
        return {
            "feedback": feedback,
            "score": answer_score,
            "completed": True,
            "session_score": session_score,
            "summary": _build_interview_summary(scores or [answer_score]),
            "next_question_id": None,
            "next_question": None,
        }

    next_q_res = await db.execute(
        select(Question)
        .where(Question.id.not_in(answered_question_ids))
        .order_by(func.random())
        .limit(1)
    )
    next_q = next_q_res.scalar_one_or_none()
    if not next_q:
        all_scores_res = await db.execute(
            select(InterviewAnswer.score).where(InterviewAnswer.session_id == session.id)
        )
        scores = [float(score) for score in all_scores_res.scalars().all() if score is not None]
        session_score = round(sum(scores) / len(scores), 2) if scores else round(answer_score, 2)
        session.question_id = None
        session.completed_at = utc_now()
        session.score = session_score
        await db.commit()
        return {
            "feedback": feedback,
            "score": answer_score,
            "completed": True,
            "session_score": session_score,
            "summary": _build_interview_summary(scores or [answer_score]),
            "next_question_id": None,
            "next_question": None,
        }

    session.question_id = next_q.id
    await db.commit()

    return {
        "feedback": feedback,
        "score": answer_score,
        "completed": False,
        "session_score": None,
        "summary": None,
        "next_question_id": next_q.id if next_q else None,
        "next_question": next_q.text if next_q else None,
    }


@router.post("/progress", response_model=ProgressUpsertOut)
async def upsert_progress(
    data: ProgressUpsertIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    normalized_topic = " ".join(data.topic.split())
    topic_key = _normalize_progress_topic(normalized_topic)
    mutation_result = await upsert_progress_entry(
        db,
        user_id=user.id,
        topic=normalized_topic,
        topic_key=topic_key,
        status=data.status,
        updated_at=utc_now(),
    )
    await db.commit()

    return {
        "detail": mutation_result.detail,
        "topic": {
            "topic": mutation_result.topic.topic,
            "status": mutation_result.topic.status,
            "updated_at": _ensure_utc_datetime(mutation_result.topic.updated_at),
        },
    }


@router.get("/progress", response_model=ProgressOut)
async def get_progress(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    latest_progress_entries = await list_latest_progress_entries(db, user_id=user.id)
    history_entries = await list_progress_history(
        db,
        user_id=user.id,
        limit=PROGRESS_HISTORY_LIMIT,
    )
    latest_plan = await get_latest_plan(db, user_id=user.id)
    plan_topics = _extract_topics_from_plan(latest_plan)
    return _serialize_progress(latest_progress_entries, plan_topics, history_entries)
