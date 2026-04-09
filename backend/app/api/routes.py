from __future__ import annotations

from datetime import datetime, timedelta
from io import BytesIO
from tempfile import NamedTemporaryFile
import secrets
import subprocess

from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile
from fastapi.responses import RedirectResponse
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from striprtf.striprtf import rtf_to_text
from docx import Document

from app.api.schemas import (
    InterviewAnswerIn,
    InterviewAnswerOut,
    InterviewStartOut,
    LoginIn,
    MessageOut,
    PlanIn,
    SignupIn,
)
from app.core.config import get_settings
from app.db.session import get_db
from app.models import InterviewAnswer, InterviewSession, Plan, Progress, Question, Resume, User
from app.services.ai_proxy import chat_completion
from app.services.auth import get_current_user
from app.services.rate_limit import check_rate_limit
from app.services.emailer import send_email
from app.services.security import create_access_token, hash_password, verify_password

router = APIRouter()


@router.post("/auth/signup", response_model=MessageOut)
async def signup(data: SignupIn, db: AsyncSession = Depends(get_db)):
    settings = get_settings()
    res = await db.execute(select(User).where(User.email == data.email))
    if res.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")

    token = secrets.token_urlsafe(32)
    expires_at = datetime.utcnow() + timedelta(hours=settings.EMAIL_VERIFY_TOKEN_TTL_HOURS)

    user = User(
        email=data.email,
        password_hash=hash_password(data.password),
        email_verified=False,
        email_verification_token=token,
        email_verification_expires_at=expires_at,
    )
    db.add(user)
    await db.commit()

    verify_link = f"{settings.FRONTEND_BASE_URL}/auth/verify?token={token}"
    body = (
        "Подтверждение регистрации.\n\n"
        f"Перейдите по ссылке для подтверждения email:\n{verify_link}\n\n"
        "Если вы не регистрировались, просто игнорируйте это письмо."
    )
    send_email(data.email, "Подтверждение регистрации", body)

    return {"detail": "verification_sent"}


@router.post("/auth/login", response_model=MessageOut)
async def login(request: Request, response: Response, data: LoginIn, db: AsyncSession = Depends(get_db)):
    ip = request.client.host if request.client else "unknown"
    if not check_rate_limit(ip):
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
    res = await db.execute(select(User).where(User.email_verification_token == token))
    user = res.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=400, detail="Invalid token")
    if user.email_verification_expires_at and user.email_verification_expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Token expired")

    user.email_verified = True
    user.email_verification_token = None
    user.email_verification_expires_at = None
    await db.commit()

    return RedirectResponse(url=f"{settings.FRONTEND_BASE_URL}/login?verified=1")


@router.post("/upload/resume", response_model=MessageOut)
async def upload_resume(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    content = ""
    filename = (file.filename or "").lower()
    data = await file.read()

    if filename.endswith(".md") or filename.endswith(".txt"):
        content = data.decode("utf-8", errors="replace")
    elif filename.endswith(".rtf"):
        content = rtf_to_text(data.decode("utf-8", errors="replace"))
    elif filename.endswith(".docx"):
        doc = Document(BytesIO(data))
        content = "\n".join(p.text for p in doc.paragraphs)
    elif filename.endswith(".doc"):
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
        except Exception:
            raise HTTPException(status_code=415, detail="Failed to parse .doc file")
    else:
        raise HTTPException(status_code=415, detail="Unsupported file type")

    if not content.strip():
        raise HTTPException(status_code=400, detail="Empty resume")

    resume = Resume(user_id=user.id, content=content)
    db.add(resume)
    await db.commit()
    return {"detail": "ok"}


@router.post("/plan/generate", response_model=MessageOut)
async def generate_plan(
    data: PlanIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(
        select(Resume).where(Resume.user_id == user.id).order_by(Resume.created_at.desc())
    )
    resume = res.scalars().first()
    if not resume:
        raise HTTPException(status_code=400, detail="Resume not uploaded")

    prompt = (
        "Generate a 2-6 week interview prep plan for a Python developer. "
        "Topics: Python core, algorithms, system design, DB, async, devops, tests."
    )
    messages = [
        {"role": "system", "content": "You are an interview coach."},
        {"role": "user", "content": f"Resume:\n{resume.content}\n\nJob:\n{data.job_text}"},
        {"role": "user", "content": prompt},
    ]
    try:
        ai_resp = await chat_completion(messages)
        content = ai_resp["choices"][0]["message"]["content"]
    except Exception:
        raise HTTPException(status_code=502, detail="Plan generation failed")

    plan = Plan(user_id=user.id, content=content)
    db.add(plan)
    await db.commit()
    return {"detail": "ok"}


@router.get("/questions")
async def get_questions(topic: str | None = None, db: AsyncSession = Depends(get_db)):
    stmt = select(Question)
    if topic:
        stmt = stmt.where(Question.topic == topic)
    res = await db.execute(stmt)
    return [
        {
            "id": q.id,
            "topic": q.topic,
            "difficulty": q.difficulty,
            "text": q.text,
            "sample_answer": q.sample_answer,
        }
        for q in res.scalars().all()
    ]


@router.post("/interview/start", response_model=InterviewStartOut)
async def interview_start(
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    res = await db.execute(select(Question).order_by(func.random()).limit(1))
    question = res.scalar_one_or_none()
    if not question:
        raise HTTPException(status_code=400, detail="No questions in database")

    session = InterviewSession(user_id=user.id, question_id=question.id, started_at=datetime.utcnow())
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
    res = await db.execute(
        select(InterviewSession).where(
            InterviewSession.id == data.session_id,
            InterviewSession.user_id == user.id,
        )
    )
    session = res.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

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
    except Exception:
        raise HTTPException(status_code=502, detail="Feedback unavailable")

    answer = InterviewAnswer(
        session_id=session.id,
        question=question.text,
        answer=data.answer,
        feedback=feedback,
        score=None,
    )
    db.add(answer)

    next_q_res = await db.execute(
        select(Question).where(Question.id != question.id).order_by(func.random()).limit(1)
    )
    next_q = next_q_res.scalar_one_or_none()
    session.question_id = next_q.id if next_q else None
    await db.commit()

    return {
        "feedback": feedback,
        "next_question_id": next_q.id if next_q else None,
        "next_question": next_q.text if next_q else None,
    }


@router.get("/progress")
async def get_progress(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(Progress).where(Progress.user_id == user.id))
    return [
        {
            "topic": p.topic,
            "status": p.status,
            "updated_at": p.updated_at,
        }
        for p in res.scalars().all()
    ]
