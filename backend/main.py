"""
Pagani Zonda R – Enterprise Intelligence API
FastAPI backend with RAG, JWT auth, rate limiting, CORS, and logging.
"""

import os
import time
import logging
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

load_dotenv()

# ── Logging ──
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(name)-24s | %(levelname)-7s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("pagani.api")

# ── Rate Limiter ──
limiter = Limiter(key_func=get_remote_address)


# ── Lifespan ──
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize vector store on startup."""
    logger.info("═" * 60)
    logger.info("  PAGANI ZONDA R — Enterprise Intelligence API")
    logger.info("═" * 60)
    try:
        vector_store.initialize()
        logger.info("Vector store initialized successfully.")
    except Exception as e:
        logger.error(f"Vector store initialization failed: {e}")
        logger.warning("API will start but /chat endpoints may fail.")
    logger.info("API server ready.")
    yield
    logger.info("API server shutting down.")


# ── App ──
app = FastAPI(
    title="Pagani Zonda R – Enterprise Intelligence API",
    description="RAG-powered AI assistant for Pagani Zonda R enterprise data.",
    version="1.0.0",
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
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "detail": "An internal server error occurred.",
            "error_code": "INTERNAL_ERROR",
        },
    )


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
# Health Check
# ═══════════════════════════════════════════

@app.get("/api/health")
async def health_check():
    return {
        "status": "operational",
        "service": "Pagani Zonda R Enterprise Intelligence",
        "vector_store_initialized": vector_store._initialized,
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
    return {"message": "User registered successfully", **result}


@app.post("/api/login", response_model=TokenResponse)
@limiter.limit("5/minute")
async def login(request: Request, user: UserLogin):
    """Authenticate and receive JWT access + refresh tokens."""
    logger.info(f"Login attempt: {user.username}")
    return authenticate_user(user)


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

    try:
        # Step 1: Agentic Routing (Decide whether to search and reformulate query)
        history = _get_history(username)
        router_decision = agentic_router(body.question, history)
        
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

        return ChatResponse(
            answer=result["answer"],
            sources=result["sources"],
            confidence=result["confidence"],
            user_role=user_role,
        )

    except RuntimeError as e:
        logger.error(f"RAG pipeline error for user {username}: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The AI service is temporarily unavailable. Please try again.",
        )
    except Exception as e:
        logger.error(f"Unexpected chat error for user {username}: {e}", exc_info=True)
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

        async def event_generator():
            async for chunk in generate_response_stream(
                question=body.question,
                context_docs=context_docs,
                user_role=user_role,
                username=username,
            ):
                yield f"data: {chunk}\n\n"
            yield "data: [DONE]\n\n"

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
