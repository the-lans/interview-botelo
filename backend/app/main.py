from fastapi import FastAPI
from sqlalchemy import text
from starlette.middleware.proxy_headers import ProxyHeadersMiddleware

from app.api.routes import router
from app.db.session import Base, engine
from app.services.csrf import CSRFMiddleware

app = FastAPI(title="Interview Coach")
app.add_middleware(ProxyHeadersMiddleware, trusted_hosts=["127.0.0.1", "::1"])
app.add_middleware(CSRFMiddleware)
app.include_router(router)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.on_event("startup")
async def on_startup():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.execute(text("SELECT 1"))
