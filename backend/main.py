"""
Pagani Zonda R – Enterprise Intelligence API
FastAPI backend with RAG, JWT auth, rate limiting, CORS, logging,
database persistence, security middleware, and health monitoring.
"""

import os
import time
import logging
from datetime import datetime, timezone
from contextlib import asynccontextmanager

from fastapi import FastAPI, Depends, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from dotenv import load_dotenv

from auth import (
    UserRegister, UserLogin, TokenResponse, RefreshRequest,
    ChatRequest, ChatResponse, UserInfo, ErrorResponse,
    register_user, authenticate_user, refresh_access_token,
    get_current_user, users_db,
)
from vector_store import vector_store
from rag_pipeline import (
    generate_response, 
    generate_response_stream,
    agentic_router,
    _get_history,
)
from logging_config import setup_logging, log_event
from database import init_db, check_db_connection
from middleware import SecurityHeadersMiddleware, RequestSizeLimitMiddleware

load_dotenv()

# ── Structured Logging (replaces basicConfig) ──
setup_logging(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger("pagani.api")

# ── Rate Limiter ──
limiter = Limiter(key_func=get_remote_address)

# ── Server Start Time (for uptime tracking) ──
SERVER_START_TIME = None


# ── Lifespan ──
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize vector store and database on startup."""
    global SERVER_START_TIME
    SERVER_START_TIME = datetime.now(timezone.utc)

    logger.info("═" * 60)
    logger.info("  PAGANI ZONDA R — Enterprise Intelligence API")
    logger.info("═" * 60)

    # Initialize database
    try:
        init_db()
        logger.info("Database initialized successfully.")
    except Exception as e:
        logger.error(f"Database initialization failed: {e}")
        logger.warning("API will start but persistence features may fail.")

    # Initialize vector store
    try:
        vector_store.initialize()
        logger.info("Vector store initialized successfully.")
    except Exception as e:
        logger.error(f"Vector store initialization failed: {e}")
        logger.warning("API will start but /chat endpoints may fail.")

    log_event("pagani.api", "system_startup", metadata={
        "timestamp": SERVER_START_TIME.isoformat()
    })

    logger.info("API server ready.")
    yield
    logger.info("API server shutting down.")


# ── App ──
app = FastAPI(
    title="Pagani Zonda R – Enterprise Intelligence API",
    description="RAG-powered AI assistant for Pagani Zonda R enterprise data.",
    version="2.0.0",
    lifespan=lifespan,
)

# Rate limiter state
app.state.limiter = limiter


# ── Rate Limit Error Handler ──
@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        content={
            "detail": "Too many requests. Please slow down.",
            "error_code": "RATE_LIMIT_EXCEEDED",
        },
    )


# ── Global Exception Handler ──
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    log_event("pagani.api", "api_error", metadata={
        "error": str(exc),
        "path": str(request.url.path),
    })
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "detail": "An internal server error occurred.",
            "error_code": "INTERNAL_ERROR",
        },
    )


# ── Security Middleware ──
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RequestSizeLimitMiddleware)

# ── CORS ──
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-Id"],
)


# ═══════════════════════════════════════════
# Analytics Helper
# ═══════════════════════════════════════════

def _track_analytics(event_type: str, user_id: str | None = None, metadata: dict | None = None):
    """Track a usage analytics event (fire-and-forget)."""
    try:
        from database import get_db_session
        from models import AnalyticsEvent
        with get_db_session() as db:
            db.add(AnalyticsEvent(
                event_type=event_type,
                user_id=user_id,
                metadata_=metadata,
            ))
    except Exception as e:
        logger.warning(f"Analytics tracking failed (non-fatal): {e}")


# ═══════════════════════════════════════════
# Chat Persistence Helper
# ═══════════════════════════════════════════

def _persist_chat(username: str, question: str, response: str):
    """Persist a chat Q&A pair to the database (fire-and-forget)."""
    try:
        from database import get_db_session
        from models import ChatHistory, User
        with get_db_session() as db:
            user = db.query(User).filter(User.name == username).first()
            if user:
                db.add(ChatHistory(
                    user_id=user.id,
                    question=question,
                    response=response,
                ))
    except Exception as e:
        logger.warning(f"Chat persistence failed (non-fatal): {e}")


# ═══════════════════════════════════════════
# Health Check (Enhanced)
# ═══════════════════════════════════════════

@app.get("/api/health")
async def health_check():
    log_event("pagani.api", "system_health_check")

    # Database status
    db_connected = check_db_connection()

    # AI service status
    ai_available = vector_store._initialized

    # Uptime
    uptime_seconds = 0
    if SERVER_START_TIME:
        uptime_seconds = (datetime.now(timezone.utc) - SERVER_START_TIME).total_seconds()

    overall_status = "healthy" if (db_connected and ai_available) else "degraded"

    return {
        "status": overall_status,
        "database": "connected" if db_connected else "disconnected",
        "ai_service": "available" if ai_available else "unavailable",
        "uptime": f"{uptime_seconds:.0f}s",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "vector_store_initialized": ai_available,
        "registered_users": len(users_db),
    }


# ═══════════════════════════════════════════
# Auth Endpoints
# ═══════════════════════════════════════════

@app.post("/api/register", response_model=dict, status_code=status.HTTP_201_CREATED)
@limiter.limit("10/minute")
async def register(request: Request, user: UserRegister):
    """Register a new user with username, password, and role."""
    logger.info(f"Registration attempt: {user.username} (role: {user.role})")
    result = register_user(user)
    _track_analytics("user_registered", user_id=user.username, metadata={"role": user.role})
    return {"message": "User registered successfully", **result}


@app.post("/api/login", response_model=TokenResponse)
@limiter.limit("5/minute")
async def login(request: Request, user: UserLogin):
    """Authenticate and receive JWT access + refresh tokens."""
    logger.info(f"Login attempt: {user.username}")
    log_event("pagani.api", "user_login", user_id=user.username)
    result = authenticate_user(user)
    _track_analytics("login_success", user_id=user.username)
    return result


@app.post("/api/refresh", response_model=TokenResponse)
@limiter.limit("10/minute")
async def refresh(request: Request, body: RefreshRequest):
    """Exchange a valid refresh token for a new access + refresh token pair."""
    logger.info("Token refresh attempt")
    return refresh_access_token(body.refresh_token)


@app.get("/api/me", response_model=UserInfo)
async def get_me(current_user: dict = Depends(get_current_user)):
    """Get current authenticated user info."""
    db_user = users_db.get(current_user["username"])
    return UserInfo(
        username=current_user["username"],
        role=current_user["role"],
        created_at=db_user.get("created_at", "unknown"),
    )


# ═══════════════════════════════════════════
# RAG Chat Endpoints
# ═══════════════════════════════════════════

@app.post("/api/chat", response_model=ChatResponse)
@limiter.limit("20/minute")
async def chat(
    request: Request,
    body: ChatRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    RAG-powered chat endpoint.
    Embeds question → FAISS search (role-filtered) → Gemini generation.
    """
    start_time = time.time()
    username = current_user["username"]
    user_role = current_user["role"]

    logger.info(f"Chat request | user={username} | role={user_role} | q='{body.question[:80]}'")
    log_event("pagani.api", "chat_request", user_id=username, metadata={"question": body.question[:100]})
    _track_analytics("chat_started", user_id=username)
    _track_analytics("query_submitted", user_id=username, metadata={"question_length": len(body.question)})

    try:
        # Step 1: Agentic Routing (Decide whether to search and reformulate query)
        history = _get_history(username)
        router_decision = agentic_router(body.question, history)
        log_event("pagani.api", "role_routing", user_id=username, metadata=router_decision)
        
        # Step 2: Conditional Semantic Search
        context_docs = []
        if router_decision.get("needs_search", True):
            search_query = router_decision.get("search_query") or body.question
            logger.info(f"Router decided to search with query: '{search_query[:50]}'")
            context_docs = vector_store.search(
                query=search_query,
                top_k=3,
                user_role=user_role,
            )
            logger.info(f"Retrieved {len(context_docs)} documents for user {username}")
        else:
            logger.info(f"Router decided to skip vector search for user {username}")

        # Step 3: Generate response
        result = generate_response(
            question=body.question,
            context_docs=context_docs,
            user_role=user_role,
            username=username,
        )

        latency = time.time() - start_time
        logger.info(
            f"Chat response | user={username} | confidence={result['confidence']} | "
            f"sources={len(result['sources'])} | latency={latency:.2f}s"
        )
        log_event("pagani.api", "chat_response", user_id=username, metadata={
            "confidence": result["confidence"],
            "sources": len(result["sources"]),
            "latency_s": round(latency, 2),
        })
        _track_analytics("response_received", user_id=username, metadata={
            "confidence": result["confidence"],
            "latency_s": round(latency, 2),
        })

        # Persist chat to DB (additive)
        _persist_chat(username, body.question, result["answer"])

        return ChatResponse(
            answer=result["answer"],
            sources=result["sources"],
            confidence=result["confidence"],
            user_role=user_role,
        )

    except RuntimeError as e:
        logger.error(f"RAG pipeline error for user {username}: {e}")
        log_event("pagani.api", "api_error", user_id=username, metadata={"error": str(e)})
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The AI service is temporarily unavailable. Please try again.",
        )
    except Exception as e:
        logger.error(f"Unexpected chat error for user {username}: {e}", exc_info=True)
        log_event("pagani.api", "api_error", user_id=username, metadata={"error": str(e)})
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred processing your request.",
        )


@app.post("/api/chat/stream")
@limiter.limit("20/minute")
async def chat_stream(
    request: Request,
    body: ChatRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    Streaming RAG chat endpoint.
    Returns Server-Sent Events with token-by-token response.
    """
    username = current_user["username"]
    user_role = current_user["role"]

    logger.info(f"Stream chat request | user={username} | role={user_role} | q='{body.question[:80]}'")
    log_event("pagani.api", "chat_request", user_id=username, metadata={
        "question": body.question[:100],
        "streaming": True,
    })
    _track_analytics("chat_started", user_id=username, metadata={"streaming": True})

    try:
        history = _get_history(username)
        router_decision = agentic_router(body.question, history)
        
        context_docs = []
        if router_decision.get("needs_search", True):
            search_query = router_decision.get("search_query") or body.question
            logger.info(f"Router decided to search with query: '{search_query[:50]}'")
            context_docs = vector_store.search(
                query=search_query,
                top_k=3,
                user_role=user_role,
            )
        else:
            logger.info(f"Router decided to skip vector search for user {username}")

        collected_chunks: list[str] = []

        async def event_generator():
            async for chunk in generate_response_stream(
                question=body.question,
                context_docs=context_docs,
                user_role=user_role,
                username=username,
            ):
                collected_chunks.append(chunk)
                yield f"data: {chunk}\n\n"
            yield "data: [DONE]\n\n"

            # Persist after streaming completes
            full_response = "".join(collected_chunks)
            _persist_chat(username, body.question, full_response)
            _track_analytics("response_received", user_id=username, metadata={"streaming": True})
            log_event("pagani.api", "chat_response", user_id=username, metadata={"streaming": True})

        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    except RuntimeError as e:
        logger.error(f"Streaming RAG error for user {username}: {e}")
        log_event("pagani.api", "api_error", user_id=username, metadata={"error": str(e)})
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The AI service is temporarily unavailable.",
        )


# ═══════════════════════════════════════════
# Entry Point
# ═══════════════════════════════════════════

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info",
    )
