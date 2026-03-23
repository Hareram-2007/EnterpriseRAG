"""
Pagani Zonda R – Security Middleware
Security headers and request size limiting for FastAPI.
"""

import logging
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response, JSONResponse
from fastapi import status

logger = logging.getLogger("pagani.security")

# ── Maximum request body size (1MB) ──
MAX_REQUEST_SIZE = 1 * 1024 * 1024


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add security headers to every response."""

    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)

        # Prevent MIME sniffing
        response.headers["X-Content-Type-Options"] = "nosniff"
        # Prevent clickjacking
        response.headers["X-Frame-Options"] = "DENY"
        # XSS protection (legacy browsers)
        response.headers["X-XSS-Protection"] = "1; mode=block"
        # Referrer policy
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        # Permissions policy
        response.headers["Permissions-Policy"] = (
            "camera=(), microphone=(), geolocation=(), payment=()"
        )
        # Content Security Policy (basic)
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; script-src 'self' 'unsafe-inline'; "
            "style-src 'self' 'unsafe-inline'; img-src 'self' data:; "
            "font-src 'self'; connect-src 'self'"
        )

        return response


class RequestSizeLimitMiddleware(BaseHTTPMiddleware):
    """Reject requests with bodies exceeding the size limit."""

    async def dispatch(self, request: Request, call_next):
        content_length = request.headers.get("content-length")

        if content_length and int(content_length) > MAX_REQUEST_SIZE:
            logger.warning(
                f"Request rejected: body size {content_length} exceeds "
                f"limit of {MAX_REQUEST_SIZE} bytes | "
                f"path={request.url.path}"
            )
            return JSONResponse(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                content={
                    "detail": "Request body too large.",
                    "error_code": "REQUEST_TOO_LARGE",
                },
            )

        return await call_next(request)


class RequestTracingMiddleware(BaseHTTPMiddleware):
    """Generate and propagate X-Request-Id for request tracing."""

    async def dispatch(self, request: Request, call_next):
        from error_handlers import trace_id_ctx, generate_trace_id

        # Use incoming trace ID or generate a new one
        trace_id = request.headers.get("X-Request-Id") or generate_trace_id()
        token = trace_id_ctx.set(trace_id)

        try:
            response: Response = await call_next(request)
            response.headers["X-Request-Id"] = trace_id
            return response
        finally:
            trace_id_ctx.reset(token)
