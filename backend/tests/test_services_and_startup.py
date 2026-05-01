from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from jose import JWTError


@pytest.mark.asyncio
async def test_chat_completion_sends_auth_header(monkeypatch):
    from app.services import ai_proxy

    captured = {}

    class Resp:
        def raise_for_status(self):
            return None

        def json(self):
            return {"ok": True}

    class Client:
        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return None

        async def post(self, url, json, headers):
            captured["url"] = url
            captured["json"] = json
            captured["headers"] = headers
            return Resp()

    monkeypatch.setattr(ai_proxy, "get_settings", lambda: SimpleNamespace(OPENCLAW_API_BASE="http://api", OPENCLAW_API_TOKEN="tkn"))
    monkeypatch.setattr(ai_proxy.httpx, "AsyncClient", lambda timeout: Client())

    result = await ai_proxy.chat_completion([{"role": "user", "content": "hi"}])
    assert result == {"ok": True}
    assert captured["url"] == "http://api/chat/completions"
    assert captured["headers"]["Authorization"] == "Bearer tkn"


@pytest.mark.asyncio
async def test_get_current_user_invalid_token(monkeypatch):
    from app.services import auth

    class FakeRequest:
        cookies = {"session": "bad"}

    monkeypatch.setattr(auth, "decode_access_token", lambda token: (_ for _ in ()).throw(JWTError("bad")))

    with pytest.raises(HTTPException) as error:
        await auth.get_current_user(FakeRequest(), db=SimpleNamespace())

    assert error.value.status_code == 401


def test_send_email_skips_in_test_env(monkeypatch):
    from app.services import emailer

    monkeypatch.setattr(emailer, "get_settings", lambda: SimpleNamespace(APP_ENV="test", SMTP_HOST="", SMTP_USER="", SMTP_PASSWORD="", SMTP_FROM="", SMTP_PORT=465))
    emailer.send_email("a@b.com", "Subj", "Body")


def test_send_email_raises_in_prod_without_smtp(monkeypatch):
    from app.services import emailer

    monkeypatch.setattr(emailer, "get_settings", lambda: SimpleNamespace(APP_ENV="prod", SMTP_HOST="", SMTP_USER="", SMTP_PASSWORD="", SMTP_FROM="", SMTP_PORT=465))
    with pytest.raises(emailer.EmailDeliveryError):
        emailer.send_email("a@b.com", "Subj", "Body")


def test_send_email_success(monkeypatch):
    from app.services import emailer

    class SMTP:
        def __init__(self, host, port):
            self.host = host
            self.port = port
            self.logged = False
            self.sent = False
            self.closed = False

        def login(self, user, password):
            self.logged = True

        def sendmail(self, from_email, to_emails, body):
            self.sent = True

        def quit(self):
            self.closed = True

    smtp = SMTP("h", 1)
    monkeypatch.setattr(emailer, "get_settings", lambda: SimpleNamespace(APP_ENV="prod", SMTP_HOST="host", SMTP_USER="user", SMTP_PASSWORD="pass", SMTP_FROM="from@test.com", SMTP_PORT=465))
    monkeypatch.setattr(emailer.smtplib, "SMTP_SSL", lambda host, port: smtp)

    emailer.send_email("to@test.com", "Subj", "Body")
    assert smtp.logged is True
    assert smtp.sent is True
    assert smtp.closed is True


@pytest.mark.asyncio
async def test_seed_questions_inserts_only_once():
    from app.db.session import SessionLocal
    from app.main import _seed_questions
    from app.models import Question

    async with SessionLocal() as session:
        await session.execute(Question.__table__.delete())
        await session.commit()

    await _seed_questions()
    await _seed_questions()

    async with SessionLocal() as session:
        rows = (await session.execute(Question.__table__.select())).all()
        assert len(rows) == 3


@pytest.mark.asyncio
async def test_on_startup_runs_migrations_and_seed(monkeypatch):
    from app import main as main_module

    executed = []
    seeded = {"called": False}

    class FakeConn:
        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return None

        async def run_sync(self, fn):
            return None

        async def execute(self, query):
            executed.append(str(query))
            return None

    class FakeEngine:
        def begin(self):
            return FakeConn()

    async def fake_seed():
        seeded["called"] = True

    monkeypatch.setattr(main_module, "engine", FakeEngine())
    monkeypatch.setattr(main_module, "get_settings", lambda: SimpleNamespace(APP_ENV="dev"))
    monkeypatch.setattr(main_module, "_seed_questions", fake_seed)

    await main_module.on_startup()

    assert seeded["called"] is True
    assert len(executed) >= 10
