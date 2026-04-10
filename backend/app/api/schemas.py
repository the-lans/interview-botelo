from pydantic import BaseModel, EmailStr


class SignupIn(BaseModel):
    email: EmailStr
    password: str


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class ResendVerificationIn(BaseModel):
    email: EmailStr


class MessageOut(BaseModel):
    detail: str


class PlanIn(BaseModel):
    job_text: str


class InterviewStartOut(BaseModel):
    session_id: int
    question_id: int
    question: str


class InterviewAnswerIn(BaseModel):
    session_id: int
    question_id: int
    answer: str


class InterviewAnswerOut(BaseModel):
    feedback: str
    next_question_id: int | None = None
    next_question: str | None = None
