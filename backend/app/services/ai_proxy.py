import httpx

from app.core.config import get_settings


async def chat_completion(messages: list[dict], model: str = "openclaw/devius") -> dict:
    settings = get_settings()
    headers = {}
    if settings.OPENCLAW_API_TOKEN:
        headers["Authorization"] = f"Bearer {settings.OPENCLAW_API_TOKEN}"

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            f"{settings.OPENCLAW_API_BASE}/chat/completions",
            json={"model": model, "messages": messages},
            headers=headers,
        )
        resp.raise_for_status()
        return resp.json()
