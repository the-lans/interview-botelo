from __future__ import annotations

import re

import httpx
from fastapi import HTTPException

try:
    import trafilatura
except Exception:  # pragma: no cover
    trafilatura = None

MAX_VACANCY_TEXT_LENGTH = 20_000
HTTP_TIMEOUT_SECONDS = 10.0
REQUEST_USER_AGENT = "InterviewBotelo/1.0 (+https://interview.botelo.ru)"


def normalize_text(text: str) -> str:
    normalized = re.sub(r"\s+", " ", text).strip()
    if not normalized:
        raise HTTPException(status_code=400, detail="Vacancy text is empty")
    if len(normalized) > MAX_VACANCY_TEXT_LENGTH:
        raise HTTPException(status_code=413, detail="Vacancy text is too long")
    return normalized


def _extract_text_from_html(html: str) -> str:
    if trafilatura is not None:
        extracted = trafilatura.extract(html, include_comments=False, include_tables=True)
        if extracted and extracted.strip():
            return extracted

    without_scripts = re.sub(
        r"<(script|style|noscript|header|footer|nav)[^>]*>.*?</\1>",
        " ",
        html,
        flags=re.IGNORECASE | re.DOTALL,
    )
    text_only = re.sub(r"<[^>]+>", " ", without_scripts)
    return text_only


async def ingest_vacancy(url: str | None, raw_text: str | None) -> str:
    if bool(url) == bool(raw_text):
        raise HTTPException(status_code=422, detail="Provide exactly one of url or raw_text")

    if raw_text:
        return normalize_text(raw_text)

    assert url is not None

    try:
        async with httpx.AsyncClient(
            timeout=HTTP_TIMEOUT_SECONDS,
            headers={"User-Agent": REQUEST_USER_AGENT},
            follow_redirects=True,
        ) as client:
            response = await client.get(url)
    except httpx.TimeoutException as error:
        raise HTTPException(status_code=504, detail="Vacancy URL request timeout") from error
    except httpx.HTTPError as error:
        raise HTTPException(status_code=502, detail="Vacancy URL is not reachable") from error

    content_type = (response.headers.get("content-type") or "").lower()
    if response.status_code >= 400:
        raise HTTPException(status_code=502, detail="Vacancy URL returned error status")
    if "text/html" not in content_type and "application/xhtml+xml" not in content_type:
        raise HTTPException(status_code=415, detail="Vacancy URL is not an HTML page")

    extracted_text = _extract_text_from_html(response.text)
    return normalize_text(extracted_text)
