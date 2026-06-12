import pytest
from fastapi import HTTPException

from app.services import vacancy_ingest as svc


@pytest.mark.parametrize(
    ("text", "expected_status"),
    [
        ("   \n  ", 400),
        ("x" * (svc.MAX_VACANCY_TEXT_LENGTH + 1), 413),
    ],
)
def test_normalize_text_invalid(text, expected_status):
    with pytest.raises(HTTPException) as err:
        svc.normalize_text(text)
    assert err.value.status_code == expected_status


def test_extract_text_from_html_without_trafilatura(monkeypatch):
    monkeypatch.setattr(svc, "trafilatura", None)
    html = (
        "<html><head><style>.a{}</style></head><body>"
        "<nav>x</nav><h1>Title</h1><p>Hello</p></body></html>"
    )
    out = svc._extract_text_from_html(html)
    assert "Title" in out
    assert "Hello" in out
    assert "x" not in out


@pytest.mark.parametrize(
    "url",
    [
        "ftp://example.com",
        "https://localhost/path",
    ],
)
def test_validate_url_scheme_and_host_errors(url):
    with pytest.raises(HTTPException) as err:
        svc._validate_url_is_safe(url)
    assert err.value.status_code == 422


def test_validate_url_resolve_error(monkeypatch):
    monkeypatch.setattr(
        svc.socket,
        "getaddrinfo",
        lambda *args, **kwargs: (_ for _ in ()).throw(OSError("dns fail")),
    )
    with pytest.raises(HTTPException) as dns:
        svc._validate_url_is_safe("https://example.com")
    assert dns.value.status_code == 422


def test_validate_url_rejects_forbidden_resolved_ip(monkeypatch):
    monkeypatch.setattr(
        svc.socket, "getaddrinfo", lambda *a, **k: [(None, None, None, None, ("127.0.0.1", 0))]
    )
    with pytest.raises(HTTPException) as blocked:
        svc._validate_url_is_safe("https://example.com")
    assert blocked.value.status_code == 422


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("response", "expected_status"),
    [
        (
            type(
                "ResponseError",
                (),
                {
                    "status_code": 500,
                    "headers": {"content-type": "text/html"},
                    "text": "<html>err</html>",
                    "is_redirect": False,
                },
            )(),
            502,
        ),
        (
            type(
                "ResponseJson",
                (),
                {
                    "status_code": 200,
                    "headers": {"content-type": "application/json"},
                    "text": "{}",
                    "is_redirect": False,
                },
            )(),
            415,
        ),
    ],
)
async def test_ingest_vacancy_response_validation(monkeypatch, response, expected_status):
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
    monkeypatch.setattr(svc.httpx, "AsyncClient", lambda **kwargs: Client(response))

    with pytest.raises(HTTPException) as err:
        await svc.ingest_vacancy("https://example.com", None)
    assert err.value.status_code == expected_status


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


@pytest.mark.asyncio
async def test_ingest_vacancy_revalidates_redirect_target(monkeypatch):
    redirect_response = type(
        "RedirectResponse",
        (),
        {
            "status_code": 302,
            "headers": {"location": "http://169.254.169.254/latest", "content-type": "text/html"},
            "text": "",
            "is_redirect": True,
        },
    )()

    class Client:
        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return None

        async def get(self, url):
            return redirect_response

    monkeypatch.setattr(svc.httpx, "AsyncClient", lambda **kwargs: Client())

    validated_urls: list[str] = []

    def fake_validate(url: str) -> None:
        validated_urls.append(url)
        if "169.254.169.254" in url:
            raise HTTPException(status_code=422, detail="Vacancy URL host is not allowed")

    monkeypatch.setattr(svc, "_validate_url_is_safe", fake_validate)

    with pytest.raises(HTTPException) as err:
        await svc.ingest_vacancy("https://example.com", None)

    assert err.value.status_code == 422
    assert validated_urls == [
        "https://example.com",
        "http://169.254.169.254/latest",
    ]
