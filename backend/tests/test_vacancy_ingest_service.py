import pytest
from fastapi import HTTPException

from app.services import vacancy_ingest as svc


def test_normalize_text_empty_and_too_long():
    with pytest.raises(HTTPException) as empty:
        svc.normalize_text("   \n  ")
    assert empty.value.status_code == 400

    with pytest.raises(HTTPException) as long_text:
        svc.normalize_text("x" * (svc.MAX_VACANCY_TEXT_LENGTH + 1))
    assert long_text.value.status_code == 413


def test_extract_text_from_html_without_trafilatura(monkeypatch):
    monkeypatch.setattr(svc, "trafilatura", None)
    html = "<html><head><style>.a{}</style></head><body><nav>x</nav><h1>Title</h1><p>Hello</p></body></html>"
    out = svc._extract_text_from_html(html)
    assert "Title" in out
    assert "Hello" in out
    assert "x" not in out


def test_validate_url_scheme_host_and_resolve_errors(monkeypatch):
    with pytest.raises(HTTPException) as scheme:
        svc._validate_url_is_safe("ftp://example.com")
    assert scheme.value.status_code == 422

    with pytest.raises(HTTPException) as host:
        svc._validate_url_is_safe("https://localhost/path")
    assert host.value.status_code == 422

    def raise_os(*args, **kwargs):
        raise OSError("dns fail")

    monkeypatch.setattr(svc.socket, "getaddrinfo", raise_os)
    with pytest.raises(HTTPException) as dns:
        svc._validate_url_is_safe("https://example.com")
    assert dns.value.status_code == 422


def test_validate_url_rejects_forbidden_resolved_ip(monkeypatch):
    monkeypatch.setattr(svc.socket, "getaddrinfo", lambda *a, **k: [(None, None, None, None, ("127.0.0.1", 0))])
    with pytest.raises(HTTPException) as blocked:
        svc._validate_url_is_safe("https://example.com")
    assert blocked.value.status_code == 422


@pytest.mark.asyncio
async def test_ingest_vacancy_http_error_status_and_non_html(monkeypatch):
    class ResponseError:
        status_code = 500
        headers = {"content-type": "text/html"}
        text = "<html>err</html>"

    class ResponseJson:
        status_code = 200
        headers = {"content-type": "application/json"}
        text = "{}"

    class Client:
        def __init__(self, response):
            self.response = response

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return None

        async def get(self, url):
            return self.response

    monkeypatch.setattr(svc, "_validate_url_is_safe", lambda url: None)

    monkeypatch.setattr(svc.httpx, "AsyncClient", lambda **kwargs: Client(ResponseError()))
    with pytest.raises(HTTPException) as bad_status:
        await svc.ingest_vacancy("https://example.com", None)
    assert bad_status.value.status_code == 502

    monkeypatch.setattr(svc.httpx, "AsyncClient", lambda **kwargs: Client(ResponseJson()))
    with pytest.raises(HTTPException) as non_html:
        await svc.ingest_vacancy("https://example.com", None)
    assert non_html.value.status_code == 415


@pytest.mark.asyncio
async def test_ingest_vacancy_reachable_http_error(monkeypatch):
    class Client:
        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return None

        async def get(self, url):
            raise svc.httpx.HTTPError("boom")

    monkeypatch.setattr(svc, "_validate_url_is_safe", lambda url: None)
    monkeypatch.setattr(svc.httpx, "AsyncClient", lambda **kwargs: Client())

    with pytest.raises(HTTPException) as err:
        await svc.ingest_vacancy("https://example.com", None)
    assert err.value.status_code == 502
