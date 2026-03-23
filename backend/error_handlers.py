"""
Pagani Zonda R – Centralized Error Handling
Custom exceptions, standardized error responses, and error handler registry.
"""

import uuid
import logging
from datetime import datetime, timezone
from contextvars import ContextVar

from fastapi import Request, status
from fastapi.responses import JSONResponse

logger = logging.getLogger("pagani.errors")

# ── Trace ID Context ──
trace_id_ctx: ContextVar[str] = ContextVar("trace_id", default="")


def get_trace_id() -> str:
    """Get the current request's trace ID."""
    return trace_id_ctx.get("")


def generate_trace_id() -> str:
    """Generate a new trace ID."""
    return uuid.uuid4().hex[:16]


# ═══════════════════════════════════════════
# Custom Exception Classes
# ═══════════════════════════════════════════

class AppError(Exception):
    """Base application error with error code and status code."""
    def __init__(
        self,
        message: str = "An unexpected error occurred.",
        error_code: str = "INTERNAL_ERROR",
        status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR,
        details: dict | None = None,
    ):
        self.message = message
        self.error_code = error_code
        self.status_code = status_code
        self.details = details or {}
        super().__init__(self.message)


class RAGPipelineError(AppError):
    """Error in the RAG pipeline (embedding, search, generation)."""
    def __init__(self, message: str = "RAG pipeline error.", details: dict | None = None):
        super().__init__(
            message=message,
            error_code="RAG_PIPELINE_ERROR",
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            details=details,
        )


class AuthorizationError(AppError):
    """User lacks required permissions."""
    def __init__(self, message: str = "Insufficient permissions.", details: dict | None = None):
        super().__init__(
            message=message,
            error_code="AUTHORIZATION_ERROR",
            status_code=status.HTTP_403_FORBIDDEN,
            details=details,
        )


class DocumentProcessingError(AppError):
    """Error during document upload/processing."""
    def __init__(self, message: str = "Document processing failed.", details: dict | None = None):
        super().__init__(
            message=message,
            error_code="DOCUMENT_PROCESSING_ERROR",
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            details=details,
        )


class ValidationError(AppError):
    """Input validation error."""
    def __init__(self, message: str = "Validation failed.", details: dict | None = None):
        super().__init__(
            message=message,
            error_code="VALIDATION_ERROR",
            status_code=status.HTTP_400_BAD_REQUEST,
            details=details,
        )


class ResourceNotFoundError(AppError):
    """Requested resource not found."""
    def __init__(self, message: str = "Resource not found.", details: dict | None = None):
        super().__init__(
            message=message,
            error_code="NOT_FOUND",
            status_code=status.HTTP_404_NOT_FOUND,
            details=details,
        )


# ═══════════════════════════════════════════
# Standardized Error Response Builder
# ═══════════════════════════════════════════

def build_error_response(
    error_code: str,
    message: str,
    status_code: int,
    details: dict | None = None,
) -> JSONResponse:
    """Build a standardized JSON error response."""
    body = {
        "error_code": error_code,
        "message": message,
        "trace_id": get_trace_id(),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    if details:
        body["details"] = details
    return JSONResponse(status_code=status_code, content=body)


# ═══════════════════════════════════════════
# Exception Handlers (to register on the app)
# ═══════════════════════════════════════════

async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    """Handle all AppError subclasses."""
    logger.warning(
        f"AppError | code={exc.error_code} | msg={exc.message} | "
        f"path={request.url.path} | trace={get_trace_id()}"
    )
    return build_error_response(
        error_code=exc.error_code,
        message=exc.message,
        status_code=exc.status_code,
        details=exc.details,
    )


async def generic_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Catch-all for unhandled exceptions."""
    logger.error(
        f"Unhandled exception | path={request.url.path} | trace={get_trace_id()} | error={exc}",
        exc_info=True,
    )
    return build_error_response(
        error_code="INTERNAL_ERROR",
        message="An internal server error occurred.",
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
    )


def register_error_handlers(app):
    """Register all custom error handlers on the FastAPI app."""
    app.add_exception_handler(AppError, app_error_handler)
    # Note: We don't override the existing global exception handler in main.py
    # This allows the existing handler to continue working while AppError
    # subclasses get the new standardized format.
