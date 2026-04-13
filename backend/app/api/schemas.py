from typing import Literal

from pydantic import BaseModel, EmailStr, Field, model_validator


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
    resume_text: str | None = None
    vacancy_text: str
    brief: "PlanBriefIn"


class VacancyIngestIn(BaseModel):
    url: str | None = None
    raw_text: str | None = None

    @model_validator(mode="after")
    def validate_source(self):
        if bool(self.url) == bool(self.raw_text):
            raise ValueError("Provide exactly one of url or raw_text")
        return self


class VacancyIngestOut(BaseModel):
    vacancy_text: str


class TimeAvailabilityIn(BaseModel):
    weekday_hours: int = Field(ge=0, le=24)
    weekend_hours: int = Field(ge=0, le=24)


class PlanBriefIn(BaseModel):
    target_role: str = Field(min_length=2, max_length=255)
    level: Literal["Junior", "Junior+", "Middle", "Middle+", "Senior"]
    horizon_weeks: Literal[2, 4, 6]
    time_availability: TimeAvailabilityIn
    plan_format: Literal["themes", "themes+practice", "themes+practice+mock_interview"]
    priorities: list[str] = Field(min_length=1)
    other_priority: str | None = None
    constraints: str | None = None
    language: Literal["RU", "EN"]


class PlanGenerateOut(BaseModel):
    detail: str
    plan_id: int
    plan: dict


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
