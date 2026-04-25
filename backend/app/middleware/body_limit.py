"""Request body size limit middleware."""

from __future__ import annotations

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

_MAX_BODY_SIZE = 10 * 1024 * 1024  # 10 MB


class BodySizeLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        content_length = request.headers.get("content-length")
        if content_length and int(content_length) > _MAX_BODY_SIZE:
            return JSONResponse(
                status_code=413,
                content={"detail": "Payload too large"},
            )
        return await call_next(request)
