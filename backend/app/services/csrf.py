from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from app.services.security import verify_csrf_token

SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}
EXEMPT_PATHS = {
    "/auth/login",
    "/auth/signup",
    "/auth/resend-verification",
    "/auth/verify",
}


class CSRFMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.method in SAFE_METHODS or request.url.path in EXEMPT_PATHS:
            return await call_next(request)

        session_cookie = request.cookies.get("session")
        csrf_cookie = request.cookies.get("csrf_token")
        csrf_header = request.headers.get("x-csrf-token")

        if (
            not session_cookie
            or not csrf_cookie
            or not csrf_header
            or csrf_cookie != csrf_header
            or not verify_csrf_token(session_cookie, csrf_cookie)
        ):
            return JSONResponse({"detail": "CSRF token missing/invalid"}, status_code=403)

        return await call_next(request)
