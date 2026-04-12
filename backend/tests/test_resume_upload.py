import io

import pytest
from docx import Document
from sqlalchemy import select

from app.models.resume import Resume


async def _signup_verify_login(client, email: str = "resume@test.com", password: str = "pass1234"):
    from app.db.session import SessionLocal
    from app.models.user import User
    from app.services.security import hash_email_token

    await client.post("/auth/signup", json={"email": email, "password": password})

    plain_token = "resume-known-token"
    async with SessionLocal() as session:
        res = await session.execute(select(User).where(User.email == email))
        user = res.scalar_one()
        user.email_verification_token = hash_email_token(plain_token)
        await session.commit()

    await client.get(f"/auth/verify?token={plain_token}")
    resp = await client.post("/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200

    csrf_token = resp.cookies.get("csrf_token")
    assert csrf_token
    client.headers["x-csrf-token"] = csrf_token


@pytest.mark.asyncio
async def test_upload_resume_markdown_happy_path(client):
    from app.db.session import SessionLocal

    await _signup_verify_login(client)

    payload = b"# CV\nPython developer\n"
    resp = await client.post(
        "/upload/resume",
        files={"file": ("resume.md", payload, "text/markdown")},
    )
    assert resp.status_code == 200
    assert resp.json()["detail"] == "ok"

    async with SessionLocal() as session:
        res = await session.execute(select(Resume))
        saved = res.scalar_one()
        assert saved.filename == "resume.md"
        assert saved.mime_type == "text/markdown"
        assert saved.file_size_bytes == len(payload)
        assert "Python developer" in saved.content


@pytest.mark.asyncio
async def test_upload_resume_docx_happy_path(client):
    await _signup_verify_login(client, email="resume_docx@test.com")

    document = Document()
    document.add_paragraph("Senior Python Engineer")
    buffer = io.BytesIO()
    document.save(buffer)
    docx_data = buffer.getvalue()

    resp = await client.post(
        "/upload/resume",
        files={
            "file": (
                "resume.docx",
                docx_data,
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
    )
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_upload_resume_unsupported_extension(client):
    await _signup_verify_login(client, email="resume_ext@test.com")

    resp = await client.post(
        "/upload/resume",
        files={"file": ("resume.txt", b"hello", "text/plain")},
    )
    assert resp.status_code == 415
    assert resp.json()["detail"] == "Unsupported file extension"


@pytest.mark.asyncio
async def test_upload_resume_unsupported_mime(client):
    await _signup_verify_login(client, email="resume_mime@test.com")

    resp = await client.post(
        "/upload/resume",
        files={"file": ("resume.md", b"hello", "application/json")},
    )
    assert resp.status_code == 415
    assert resp.json()["detail"] == "Unsupported MIME type"


@pytest.mark.asyncio
async def test_upload_resume_empty_file(client):
    await _signup_verify_login(client, email="resume_empty@test.com")

    resp = await client.post(
        "/upload/resume",
        files={"file": ("resume.md", b"", "text/markdown")},
    )
    assert resp.status_code == 400
    assert resp.json()["detail"] == "Empty file"


@pytest.mark.asyncio
async def test_upload_resume_too_large_file(client):
    await _signup_verify_login(client, email="resume_large@test.com")

    large_payload = b"a" * (5 * 1024 * 1024 + 1)
    resp = await client.post(
        "/upload/resume",
        files={"file": ("resume.md", large_payload, "text/markdown")},
    )
    assert resp.status_code == 413
    assert resp.json()["detail"] == "File too large"


@pytest.mark.asyncio
async def test_upload_resume_docx_malformed_content(client):
    await _signup_verify_login(client, email="resume_bad_docx@test.com")

    resp = await client.post(
        "/upload/resume",
        files={
            "file": (
                "resume.docx",
                b"not-a-real-docx",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
    )
    assert resp.status_code == 415
    assert resp.json()["detail"] == "Failed to parse .docx file"
