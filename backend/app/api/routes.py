from __future__ import annotations

from datetime import datetime
from io import BytesIO
from tempfile import NamedTemporaryFile
import subprocess

from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from striprtf.striprtf import rtf_to_text
from docx import Document

from app.api.schemas import (
    InterviewAnswerIn,
    InterviewStartOut,
    LoginIn,
    MessageOut,
    PlanIn,
    SignupIn,
)
from app.db.session import get_db
from app.models import InterviewAnswer, InterviewSession, Plan, Progress, Question, Resume, User
from app.services.ai_proxy import chat_completion
from app.services.auth import get_current_user
from app.services.rate_limit import check_rate_limit
from app.services.security import create_access_token, hash_password, verify_password

router = APIRouter()


def _get_client_ip(request: Request) -> str:
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


@router.post("/auth/signup", response_model=MessageOut)
async def signup(data: SignupIn, db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(User).where(User.email == data.email))
    if res.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")
    user = User(email=data.email, password_hash=hash_password(data.password))
    db.add(user)
    await db.commit()
    return {"detail": "ok"}


@router.post("/auth/login", response_model=MessageOut)
async def login(request: Request, response: Response, data: LoginIn, db: AsyncSession = Depends(get_db)):
    ip = _get_client_ip(request)
    if not check_rate_limit(ip):
        raise HTTPException(status_code=429, detail="Too many attempts")

    res = await db.execute(select(User).where(User.email == data.email))
    user = res.scalar_one_or_none()
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_access_token(str(user.id))
    response.set_cookie("session", token, httponly=True, samesite="lax")
    response.set_cookie("csrf_token", token[-24:], httponly=False, samesite="lax")
    return {"detail": "ok"}


@router.post("/auth/logout", response_model=MessageOut)
async def logout(response: Response):
    response.delete_cookie("session")
    response.delete_cookie("csrf_token")
    return {"detail": "ok"}


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
    res = await db.execute(select(Question).limit(1))
    question = res.scalar_one_or_none()
    if not question:
        raise HTTPException(status_code=400, detail="No questions in database")

    session = InterviewSession(user_id=user.id, started_at=datetime.utcnow())
    db.add(session)
    await db.commit()
    await db.refresh(session)

    return {"session_id": session.id, "question": question.text}


@router.post("/interview/answer", response_model=MessageOut)
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

    messages = [
        {"role": "system", "content": "You are an interviewer. Provide brief feedback."},
        {"role": "user", "content": f"Q: {data.question}\nA: {data.answer}"},
    ]
    try:
        ai_resp = await chat_completion(messages)
        feedback = ai_resp["choices"][0]["message"]["content"]
    except Exception:
        raise HTTPException(status_code=502, detail="Feedback unavailable")

    answer = InterviewAnswer(
        session_id=session.id,
        question=data.question,
        answer=data.answer,
        feedback=feedback,
        score=None,
    )
    db.add(answer)
    await db.commit()
    return {"detail": "ok"}


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
