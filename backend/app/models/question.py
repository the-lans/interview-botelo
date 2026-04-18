from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class Question(Base):
    __tablename__ = "questions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    topic: Mapped[str] = mapped_column(String(120), index=True, nullable=False)
    difficulty: Mapped[str] = mapped_column(String(32), index=True, nullable=False)
    tags: Mapped[str] = mapped_column(String(512), index=True, nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    sample_answer: Mapped[str | None] = mapped_column(Text)
