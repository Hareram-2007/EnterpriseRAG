"""
Pagani Zonda R – Enterprise Intelligence API
FastAPI backend with RAG, JWT auth, rate limiting, CORS, logging,
database persistence, security middleware, health monitoring,
enterprise RBAC, analytics, audit, document management, and WebSocket support.
"""

import os
import time
import logging
from datetime import datetime, timezone
from contextlib import asynccontextmanager
import asyncio
from typing import Optional

from fastapi import (
    FastAPI, Depends, HTTPException, Request, status,
    APIRouter, WebSocket, WebSocketDisconnect,
    Query as QueryParam,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse, PlainTextResponse
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from pydantic import BaseModel, Field
from dotenv import load_dotenv

from auth import (
    UserRegister, UserLogin, TokenResponse, RefreshRequest,
    ChatRequest, ChatResponse, UserInfo, register_user, authenticate_user, refresh_access_token,
    get_current_user, users_db, require_permission, verify_admin_key,
    ROLE_PERMISSIONS, VALID_ROLES,
)
from vector_store import vector_store
from rag_pipeline import (
    generate_response, 
    generate_response_stream,
    agentic_router,
    _get_history,
)
from logging_config import setup_logging, log_event
from database import check_db_connection
from middleware import SecurityHeadersMiddleware, RequestSizeLimitMiddleware, RequestTracingMiddleware
from error_handlers import register_error_handlers
from audit import audit, get_audit_logs, get_login_attempts
from analytics import (
    get_user_engagement_metrics, get_query_success_rates,
    get_ai_performance_metrics, get_system_health,
    export_analytics_csv, set_server_start_time,
)
from websocket_manager import ws_manager
from cache import query_cache
from evaluator import Evaluator, IRMetrics
from stress_tester import StressTester
from auth import Gatekeeper, review_queue as auth_review_queue
from multi_agent import RetrieverAgent, SynthesisAgent, SharedState
from analytics import Strategist
from sse_manager import sse_manager

# Load environment variables from the same directory as this file
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

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
    """Initialize startup tasks in the background while uvicorn starts."""
    global SERVER_START_TIME
    SERVER_START_TIME = datetime.now(timezone.utc)
    set_server_start_time(SERVER_START_TIME)

    logger.info("═" * 60)
    logger.info("  PAGANI ZONDA R — Enterprise Intelligence API (Loading...)")
    logger.info("═" * 60)

    async def _background_init():
        """Handles heavy-duty initialization without blocking the event loop."""
        # Initialize database
        try:
            from database import init_db
            await asyncio.to_thread(init_db)
            
            from auth import _load_users_from_db
            await asyncio.to_thread(_load_users_from_db)
            logger.info("Background: Database initialized and users loaded.")
        except Exception as e:
            logger.error(f"Background: Database initialization failed: {e}")

        # Initialize vector store
        try:
            await asyncio.to_thread(vector_store.initialize)
            logger.info("Background: Vector store initialized.")
        except Exception as e:
            logger.error(f"Background: Vector store initialization failed: {e}")

        log_event("pagani.api", "system_startup", metadata={
            "timestamp": SERVER_START_TIME.isoformat()
        })
        logger.info("Background Initialization Complete.")

    # Launch background task and return lifespan control immediately
    asyncio.create_task(_background_init())
    
    logger.info("API server yielding to uvicorn (instant startup mode enabled).")
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


# ── Register Enterprise Error Handlers ──
register_error_handlers(app)

# ── Security Middleware ──
app.add_middleware(RequestTracingMiddleware)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RequestSizeLimitMiddleware)

# ── CORS ──
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000", 
        "http://127.0.0.1:3000",
        os.getenv("FRONTEND_URL", ""),
    ],
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
    def _write():
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

    # Use a background task for fire-and-forget recording
    import asyncio
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            asyncio.create_task(asyncio.to_thread(_write))
        else:
            _write()
    except Exception:
        # Fallback to sync write if no loop is available (e.g. startup)
        _write()


# ═══════════════════════════════════════════
# Chat Persistence Helper
# ═══════════════════════════════════════════

async def _persist_chat(username: str, question: str, response: str):
    """Persist a chat Q&A pair to the database (async-safe)."""
    def _sync_persist():
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
            logger.warning(f"Chat persistence failed: {e}")
            
    await asyncio.to_thread(_sync_persist)


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


@app.get("/api/health/detailed")
async def health_check_detailed(current_user: dict = Depends(require_permission("manage_users"))):
    """Secure detailed health check for admins."""
    return await health_check()


# ═══════════════════════════════════════════
# Auth Endpoints
# ═══════════════════════════════════════════

@app.post("/api/register", response_model=dict, status_code=status.HTTP_201_CREATED)
@limiter.limit("10/minute")
async def register(request: Request, user: UserRegister):
    """Register a new user with username, password, and role."""
    logger.info(f"Registration attempt: {user.username} (role: {user.role})")
    result = await register_user(user)
    _track_analytics("user_registered", user_id=user.username, metadata={"role": user.role})
    return {"message": "User registered successfully", **result}


@app.post("/api/login", response_model=TokenResponse)
@limiter.limit("5/minute")
async def login(request: Request, user: UserLogin):
    """Authenticate and receive JWT access + refresh tokens."""
    logger.info(f"Login attempt: {user.username}")
    log_event("pagani.api", "user_login", user_id=user.username)
    result = await authenticate_user(user)
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
        # Step 0: Cache Check
        cache_key = f"chat:{user_role}:{body.question}"
        cached_result = query_cache.get(cache_key)
        if cached_result:
            logger.info(f"Cache HIT for user {username} | query: '{body.question[:50]}'")
            return ChatResponse(**cached_result)

        # Step 1: Agentic Routing (Decide whether to search and reformulate query)
        history = _get_history(username)
        router_decision = await agentic_router(body.question, history)
        log_event("pagani.api", "role_routing", user_id=username, metadata=router_decision)
        
        # Step 2: Conditional Semantic Search
        context_docs = []
        if router_decision.get("needs_search", True):
            search_query = router_decision.get("search_query") or body.question
            logger.info(f"Router decided to search with query: '{search_query[:50]}'")
            context_docs = await asyncio.to_thread(
                vector_store.search,
                query=search_query,
                top_k=5,
                user_role=user_role,
                filters=router_decision.get("metadata_filters")
            )
            logger.info(f"Retrieved {len(context_docs)} documents for user {username}")
        else:
            logger.info(f"Router decided to skip vector search for user {username}")

        # Step 3: Generate response
        result = await generate_response(
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
        await _persist_chat(username, body.question, result["answer"])

        chat_response = {
            "answer": result["answer"],
            "sources": result["sources"],
            "confidence": result["confidence"],
            "user_role": user_role,
        }

        # Cache the result
        query_cache.set(cache_key, chat_response)

        return ChatResponse(**chat_response)

    except RuntimeError as e:
        err_msg = str(e)
        if "QUOTA_EXCEEDED" in err_msg:
            logger.error(f"Quota Exceeded for user {username}: {e}")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Your AI quota has been exceeded. Please check your Gemini API plan or billing details in Google AI Studio. (Error 429: Quota Exceeded)",
            )
        
        if "INVALID_API_KEY" in err_msg:
            logger.error(f"Invalid API Key for user {username}: {e}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Your Gemini API key is expired or invalid. Please update GEMINI_API_KEY in your backend/.env file and restart the server.",
            )
        
        logger.error(f"RAG pipeline error for user {username}: {e}")
        log_event("pagani.api", "api_error", user_id=username, metadata={"error": err_msg})
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


@app.post("/api/chat/debug")
@limiter.limit("20/minute")
async def chat_debug(
    request: Request,
    body: ChatRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    Debug-enhanced RAG chat endpoint.
    Returns the full pipeline trace alongside the normal response.
    Existing /api/chat and /api/chat/stream are NOT modified.
    """
    import time as _time
    t_start = _time.time()
    username = current_user["username"]
    user_role = current_user["role"]

    logger.info(f"Debug chat request | user={username} | role={user_role} | q='{body.question[:80]}'")

    try:
        # Step 1: Agentic Routing
        history = _get_history(username)
        router_decision = await agentic_router(body.question, history)

        # Step 2: Search with debug info
        context_docs = []
        debug_info = {
            "pipeline_steps": [
                {"step": "query_received", "label": "Query Received", "timestamp_ms": 0}
            ],
            "search_results": [],
            "retrieved_chunks": [],
            "timing": {},
            "router_decision": router_decision,
        }

        if router_decision.get("needs_search", True):
            search_query = router_decision.get("search_query") or body.question

            # Use the debug-enhanced search
            search_result = await asyncio.to_thread(
                vector_store.search_with_debug,
                query=search_query,
                top_k=5,
                user_role=user_role,
                filters=router_decision.get("metadata_filters")
            )
            context_docs = search_result["results"]
            debug_info = search_result["debug"]
            debug_info["router_decision"] = router_decision

        # Step 3: Generate response
        t_gen = _time.time()
        result = await generate_response(
            question=body.question,
            context_docs=context_docs,
            user_role=user_role,
            username=username,
        )
        gen_ms = int((_time.time() - t_gen) * 1000)
        total_ms = int((_time.time() - t_start) * 1000)

        debug_info["timing"]["generation_ms"] = gen_ms
        debug_info["timing"]["total_ms"] = total_ms
        debug_info["pipeline_steps"].append({
            "step": "llm_generated",
            "label": "LLM Response Generated",
            "timestamp_ms": total_ms,
        })

        # Persist chat (additive, same as normal endpoint)
        await _persist_chat(username, body.question, result["answer"])

        return {
            "answer": result["answer"],
            "sources": result["sources"],
            "confidence": result["confidence"],
            "user_role": user_role,
            "debug": debug_info,
        }

    except RuntimeError as e:
        logger.error(f"Debug RAG pipeline error for user {username}: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The AI service is temporarily unavailable. Please try again.",
        )
    except Exception as e:
        logger.error(f"Unexpected debug chat error for user {username}: {e}", exc_info=True)
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
        # Step 0: Cache Check (for simplicity, only full completions are cached)
        cache_key = f"chat_stream:{user_role}:{body.question}"
        cached_result = query_cache.get(cache_key)
        
        if cached_result:
            logger.info(f"Stream Cache HIT for user {username} | query: '{body.question[:50]}'")
            async def cached_generator():
                yield f"data: {cached_result['answer']}\n\n"
                yield "data: [DONE]\n\n"
            return StreamingResponse(
                cached_generator(),
                media_type="text/event-stream",
                headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}
            )

        history = _get_history(username)
        router_decision = await agentic_router(body.question, history)
        
        context_docs = []
        if router_decision.get("needs_search", True):
            search_query = router_decision.get("search_query") or body.question
            logger.info(f"Router decided to search with query: '{search_query[:50]}'")
            context_docs = await asyncio.to_thread(
                vector_store.search,
                query=search_query,
                top_k=5,
                user_role=user_role,
                filters=router_decision.get("metadata_filters")
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
            await _persist_chat(username, body.question, full_response)
            
            # Cache the result
            query_cache.set(cache_key, {"answer": full_response})
            
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
        err_msg = str(e)
        if "QUOTA_EXCEEDED" in err_msg:
            logger.error(f"Streaming Quota Exceeded for user {username}: {e}")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Your AI quota has been exceeded. Please check your Gemini API plan or billing details. (Error 429: Quota Exceeded)",
            )
            
        if "INVALID_API_KEY" in err_msg:
            logger.error(f"Invalid API Key for user {username}: {e}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Your Gemini API key is expired or invalid. Please update GEMINI_API_KEY in your backend/.env file and restart the server.",
            )
        
        logger.error(f"Streaming RAG error for user {username}: {e}")
        log_event("pagani.api", "api_error", user_id=username, metadata={"error": err_msg})
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The AI service is temporarily unavailable.",
        )


# ═══════════════════════════════════════════
# V1 Enterprise API Router
# ═══════════════════════════════════════════

v1_router = APIRouter(prefix="/api/v1", tags=["Enterprise V1"])


# ── Pydantic Models for V1 ──
class RoleChangeRequest(BaseModel):
    new_role: str = Field(..., description="New role to assign")


class DocumentMetadataUpdate(BaseModel):
    title: Optional[str] = None
    tags: Optional[list[str]] = None


# ───────────────────────────
# RBAC Admin Endpoints
# ───────────────────────────

@v1_router.get("/admin/users", summary="List all users")
async def v1_list_users(
    current_user: dict = Depends(require_permission("manage_users")),
):
    """List all registered users (admin/super_admin only)."""
    return {
        "users": [
            {"username": u, "role": d["role"], "created_at": d.get("created_at", "unknown")}
            for u, d in users_db.items()
        ],
        "total": len(users_db),
    }


@v1_router.delete("/admin/users/{username}", summary="Delete user account")
async def v1_delete_user(
    username: str,
    current_user: dict = Depends(require_permission("manage_users")),
):
    """Delete a user account and logically remove from the database."""
    if username not in users_db:
        raise HTTPException(status_code=404, detail="User not found")
        
    if username == current_user["username"]:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")

    # Remove from DB
    try:
        from database import get_db_session
        from models import User
        with get_db_session() as db:
            user = db.query(User).filter(User.name == username).first()
            if user:
                db.delete(user)
    except Exception as e:
        logger.error(f"Failed to delete user from database: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete user")

    # Remove from active memory
    del users_db[username]
    
    # Audit log
    audit.log("user_deleted", current_user["username"], metadata={"deleted_user": username})
    return {"message": f"User {username} deleted successfully"}


@v1_router.put("/admin/users/{username}/role", summary="Change user role")
async def v1_change_user_role(
    username: str,
    body: RoleChangeRequest,
    current_user: dict = Depends(require_permission("manage_roles")),
):
    """Change a user's role (super_admin only)."""
    if username not in users_db:
        raise HTTPException(status_code=404, detail="User not found")
    if body.new_role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail=f"Invalid role. Must be one of: {', '.join(VALID_ROLES)}")

    old_role = users_db[username]["role"]
    users_db[username]["role"] = body.new_role

    # Log role change
    audit.log_role_change(
        changed_by=current_user["username"],
        target_user=username,
        old_role=old_role,
        new_role=body.new_role,
    )

    # Persist to DB
    try:
        from database import get_db_session
        from models import User, RoleAuditLog
        with get_db_session() as db:
            user = db.query(User).filter(User.name == username).first()
            if user:
                user.role = body.new_role
            db.add(RoleAuditLog(
                changed_by=current_user["username"],
                target_user=username,
                old_role=old_role,
                new_role=body.new_role,
            ))
    except Exception as e:
        logger.warning(f"Role change DB persistence failed: {e}")

    return {
        "message": f"Role updated: {username} ({old_role} -> {body.new_role})",
        "username": username,
        "old_role": old_role,
        "new_role": body.new_role,
    }


@v1_router.get("/admin/roles/audit", summary="Role change audit log")
async def v1_role_audit_log(
    limit: int = QueryParam(default=50, le=500),
    current_user: dict = Depends(require_permission("manage_users")),
):
    """View role change audit trail."""
    try:
        from database import get_db_session
        from models import RoleAuditLog
        with get_db_session() as db:
            logs = db.query(RoleAuditLog).order_by(RoleAuditLog.timestamp.desc()).limit(limit).all()
            formatted_logs = [
                {
                    "id": log.id,
                    "changed_by": log.changed_by,
                    "target_user": log.target_user,
                    "old_role": log.old_role,
                    "new_role": log.new_role,
                    "timestamp": log.timestamp.isoformat() if log.timestamp else None,
                }
                for log in logs
            ]
            return {"audit_logs": formatted_logs, "total": len(formatted_logs)}
    except Exception as e:
        logger.error(f"Failed to retrieve role audit logs: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve role audit logs")


@v1_router.get("/admin/permissions", summary="View permission matrix")
async def v1_permissions(
    current_user: dict = Depends(get_current_user),
):
    """View the RBAC permission matrix."""
    return {
        "permissions": ROLE_PERMISSIONS,
        "valid_roles": list(VALID_ROLES),
        "your_role": current_user["role"],
        "your_permissions": ROLE_PERMISSIONS.get(current_user["role"], []),
    }


# ───────────────────────────
# Analytics Endpoints
# ───────────────────────────

@v1_router.get("/analytics/engagement", summary="User engagement metrics")
async def v1_analytics_engagement(
    days: int = QueryParam(default=30, le=365),
    current_user: dict = Depends(require_permission("manage_users")),
):
    """Get user engagement metrics for the specified period."""
    return get_user_engagement_metrics(days=days)


@v1_router.get("/analytics/queries", summary="Query success/failure rates")
async def v1_analytics_queries(
    days: int = QueryParam(default=30, le=365),
    current_user: dict = Depends(require_permission("manage_users")),
):
    """Get query success/failure rate statistics."""
    return get_query_success_rates(days=days)


@v1_router.get("/analytics/ai-performance", summary="AI performance metrics")
async def v1_analytics_ai(
    days: int = QueryParam(default=30, le=365),
    current_user: dict = Depends(require_permission("manage_users")),
):
    """Get AI performance metrics (confidence, latency)."""
    return get_ai_performance_metrics(days=days)


@v1_router.get("/analytics/system-health", summary="System health metrics")
async def v1_system_health(
    current_user: dict = Depends(require_permission("manage_users")),
):
    """Get system health metrics (CPU, memory, uptime)."""
    return get_system_health()


@v1_router.get("/analytics/export", summary="Export analytics as CSV")
async def v1_analytics_export(
    days: int = QueryParam(default=30, le=365),
    current_user: dict = Depends(require_permission("manage_users")),
):
    """Export analytics events as CSV."""
    csv_data = export_analytics_csv(days=days)
    return PlainTextResponse(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=analytics_{days}d.csv"},
    )


# ───────────────────────────
# Audit Endpoints
# ───────────────────────────

@v1_router.get("/audit/logs", summary="View audit logs")
async def v1_audit_logs(
    action: Optional[str] = None,
    user_id: Optional[str] = None,
    limit: int = QueryParam(default=100, le=1000),
    offset: int = QueryParam(default=0, ge=0),
    current_user: dict = Depends(require_permission("manage_users")),
):
    """Admin view of all audit/system logs."""
    logs = get_audit_logs(action=action, user_id=user_id, limit=limit, offset=offset)
    return {"logs": logs, "total": len(logs)}


@v1_router.get("/audit/login-attempts", summary="Login attempt history")
async def v1_login_attempts(
    limit: int = QueryParam(default=50, le=500),
    current_user: dict = Depends(require_permission("manage_users")),
):
    """View recent login attempts."""
    attempts = get_login_attempts(limit=limit)
    return {"attempts": attempts, "total": len(attempts)}


# ───────────────────────────
# Document Management Endpoints (Read-Only)
# ───────────────────────────






# ───────────────────────────
# Cache Stats Endpoint
# ───────────────────────────

@v1_router.get("/cache/stats", summary="Cache statistics")
async def v1_cache_stats(
    current_user: dict = Depends(require_permission("manage_users")),
):
    """View query cache statistics."""
    return {
        "query_cache": query_cache.stats,
    }


# ───────────────────────────
# WebSocket Endpoints
# ───────────────────────────

@v1_router.websocket("/ws/notifications")
async def ws_notifications(websocket: WebSocket):
    """WebSocket for real-time notifications."""
    await ws_manager.connect(websocket, "notifications")
    try:
        while True:
            # Keep connection alive, optionally receive client messages
            data = await websocket.receive_text()
            # Echo or handle client messages
            await ws_manager.send_personal(websocket, {"type": "ack", "message": data})
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket, "notifications")


@v1_router.websocket("/ws/logs")
async def ws_logs(websocket: WebSocket):
    """WebSocket for real-time log streaming (admin only)."""
    await ws_manager.connect(websocket, "logs")
    try:
        while True:
            data = await websocket.receive_text()
            await ws_manager.send_personal(websocket, {"type": "ack", "message": data})
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket, "logs")




# ───────────────────────────
# Evaluation Endpoints
# ───────────────────────────

class EvalRequest(BaseModel):
    query: str
    response: str
    reference: Optional[str] = None
    retrieved_ids: Optional[list[str]] = None
    relevant_ids: Optional[list[str]] = None
    input_tokens: int = 0
    output_tokens: int = 0
    latency_seconds: float = 0.0

@v1_router.post("/evaluate", summary="Evaluate a RAG response")
async def v1_evaluate(
    body: EvalRequest,
    current_user: dict = Depends(require_permission("execute")),
):
    """Run LLMJudge scoring + IR metrics + cost tracking and persist results."""
    evaluator = Evaluator()
    result = evaluator.evaluate(
        query=body.query,
        response=body.response,
        reference=body.reference,
        retrieved_ids=body.retrieved_ids,
        relevant_ids=body.relevant_ids,
        input_tokens=body.input_tokens,
        output_tokens=body.output_tokens,
        latency_seconds=body.latency_seconds,
    )
    return result


@v1_router.post("/evaluate/ir-metrics", summary="Compute IR metrics only")
async def v1_ir_metrics(
    retrieved_ids: list[str],
    relevant_ids: list[str],
    current_user: dict = Depends(get_current_user),
):
    """Compute Precision, Recall, F1 without LLM judge."""
    return IRMetrics.compute(retrieved_ids, relevant_ids)


# ───────────────────────────
# Admin – Review Queue / Feedback / Golden Answers
# ───────────────────────────

@v1_router.get("/admin/review-queue", summary="View flagged queries")
async def v1_review_queue(
    _key: str = Depends(verify_admin_key),
):
    """View all Gatekeeper-flagged queries awaiting review (X-Admin-Key)."""
    items = []
    try:
        from database import get_db_session
        from models import ReviewQueue as RQ
        with get_db_session() as db:
            rows = db.query(RQ).filter(RQ.status == "pending_review").order_by(RQ.created_at.desc()).all()
            items = [{"id": r.id, "username": r.username, "question": r.question, "reason": r.reason, "status": r.status, "created_at": r.created_at.isoformat() if r.created_at else None} for r in rows]
    except Exception:
        items = [{"id": k, **v} for k, v in auth_review_queue.items()]
    return {"review_queue": items, "total": len(items)}


class ReviewActionRequest(BaseModel):
    action: str = Field(..., pattern="^(approve|reject|edit)$")
    edited_response: Optional[str] = None


@v1_router.patch("/admin/review/{item_id}", summary="Approve/reject/edit a flagged query")
async def v1_review_action(
    item_id: str,
    body: ReviewActionRequest,
    _key: str = Depends(verify_admin_key),
):
    """Resolve a review queue item with approve/reject/edit action (X-Admin-Key)."""
    try:
        from database import get_db_session
        from models import ReviewQueue as RQ
        with get_db_session() as db:
            row = db.query(RQ).filter(RQ.id == item_id).first()
            if not row:
                raise HTTPException(status_code=404, detail="Review item not found")
            if body.action == "approve":
                row.status = "approved"
            elif body.action == "reject":
                row.status = "rejected"
            elif body.action == "edit":
                row.status = "approved"
                if body.edited_response:
                    row.final_response = body.edited_response
            row.resolved_at = datetime.now(timezone.utc)
            db.commit()
            return {"message": f"Review item {body.action}d", "id": item_id}
    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"DB resolve failed: {e}")
    if item_id in auth_review_queue:
        auth_review_queue[item_id]["status"] = body.action + "d"
        return {"message": f"Resolved (in-memory)", "id": item_id}
    raise HTTPException(status_code=404, detail="Review item not found")


@v1_router.get("/admin/audit-log", summary="View audit logs")
async def v1_admin_audit_log(
    action: Optional[str] = None,
    user_id: Optional[str] = None,
    limit: int = QueryParam(default=100, le=500),
    offset: int = QueryParam(default=0, ge=0),
    _key: str = Depends(verify_admin_key),
):
    """View all audit log entries (X-Admin-Key)."""
    logs = get_audit_logs(action=action, user_id=user_id, limit=limit, offset=offset)
    return {"logs": logs, "total": len(logs)}


@v1_router.get("/admin/strategist-reports", summary="View strategist reports")
async def v1_admin_strategist_reports(
    limit: int = QueryParam(default=20, le=100),
    _key: str = Depends(verify_admin_key),
):
    """View AI strategist nightly analysis reports (X-Admin-Key)."""
    try:
        from database import get_db_session
        from models import StrategistReport
        with get_db_session() as db:
            rows = db.query(StrategistReport).order_by(StrategistReport.created_at.desc()).limit(limit).all()
            return {"reports": [{
                "id": r.id,
                "report_text": r.report_text,
                "period_start": r.period_start.isoformat() if r.period_start else None,
                "period_end": r.period_end.isoformat() if r.period_end else None,
                "queries_analyzed": r.analyzed_count,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            } for r in rows], "total": len(rows)}
    except Exception as e:
        logger.error(f"Failed to list strategist reports: {e}")
        return {"reports": [], "total": 0}


class FeedbackRequest(BaseModel):
    query: str
    response: Optional[str] = None
    rating: int = Field(..., ge=1, le=5)
    comment: Optional[str] = None

@v1_router.post("/query/feedback", summary="Submit user feedback")
async def v1_submit_feedback(
    body: FeedbackRequest,
    current_user: dict = Depends(get_current_user),
):
    """Submit feedback on a response (rating + optional comment)."""
    try:
        from database import get_db_session
        from models import Feedback
        with get_db_session() as db:
            db.add(Feedback(
                user_id=current_user["username"],
                query=body.query,
                response=body.response,
                rating=body.rating,
                comment=body.comment,
            ))
            db.commit()
    except Exception as e:
        logger.error(f"Feedback persistence failed: {e}")
    return {"message": "Feedback submitted", "rating": body.rating}


class GoldenAnswerRequest(BaseModel):
    query: str
    expected_answer: str
    relevant_chunk_ids: Optional[list[str]] = None
    tags: Optional[list[str]] = None

@v1_router.post("/admin/golden-answers", summary="Add a golden answer")
async def v1_add_golden_answer(
    body: GoldenAnswerRequest,
    current_user: dict = Depends(require_permission("manage_users")),
):
    """Add a ground-truth golden answer for evaluation benchmarks."""
    try:
        from database import get_db_session
        from models import GoldenAnswer
        with get_db_session() as db:
            ga = GoldenAnswer(
                query=body.query,
                expected_answer=body.expected_answer,
                relevant_chunk_ids=body.relevant_chunk_ids,
                tags=body.tags,
            )
            db.add(ga)
            db.commit()
            return {"message": "Golden answer stored", "id": ga.id}
    except Exception as e:
        logger.error(f"Golden answer persistence failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to store golden answer")


@v1_router.get("/admin/golden-answers", summary="List golden answers")
async def v1_list_golden_answers(
    limit: int = QueryParam(default=50, le=500),
    current_user: dict = Depends(require_permission("manage_users")),
):
    """List all ground-truth golden answers."""
    try:
        from database import get_db_session
        from models import GoldenAnswer
        with get_db_session() as db:
            rows = db.query(GoldenAnswer).order_by(GoldenAnswer.created_at.desc()).limit(limit).all()
            return {"golden_answers": [{"id": r.id, "query": r.query, "expected_answer": r.expected_answer, "tags": r.tags} for r in rows], "total": len(rows)}
    except Exception as e:
        logger.error(f"Failed to list golden answers: {e}")
        return {"golden_answers": [], "total": 0}


# ───────────────────────────
# Stress Test Endpoints
# ───────────────────────────

class StressTestRequest(BaseModel):
    test_type: str = Field(default="all", pattern="^(all|bias|evasion|injection)$")
    queries: Optional[list[str]] = None


@v1_router.post("/stress-test/run", summary="Run stress test suite")
@limiter.limit("1/minute")
async def v1_stress_run(
    request: Request,
    body: StressTestRequest,
    _key: str = Depends(verify_admin_key),
):
    """Run adversarial stress tests via Server-Sent Events (X-Admin-Key, 1/min max)."""
    tester = StressTester()
    
    async def event_generator():
        import json
        if body.test_type == "bias":
            gen = tester.run_bias_test_stream()
        elif body.test_type == "evasion":
            gen = tester.run_evasion_test_stream()
        elif body.test_type == "injection":
            gen = tester.run_injection_test_stream()
        else:
            gen = tester.run_all_stream()
            
        async for event in gen:
            yield event
            
        yield "data: [DONE]\n\n"
        
        # Log to audit after completion
        audit.log(action="stress_test_executed", user_id="admin", metadata={
            "test_type": body.test_type,
            "streaming": True,
        })

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive"
        }
    )


# ───────────────────────────
# Evaluation Endpoints
# ───────────────────────────

@v1_router.get("/evaluations/summary", summary="Evaluation metrics summary")
async def v1_evaluations_summary():
    """Public summary of RAG evaluation metrics."""
    try:
        from database import get_db_session
        from models import Evaluation
        from sqlalchemy import func
        with get_db_session() as db:
            stats = db.query(
                func.avg(Evaluation.faithfulness).label("avg_faithfulness"),
                func.avg(Evaluation.relevance).label("avg_relevance"),
                func.avg(Evaluation.completeness).label("avg_completeness"),
                func.avg(Evaluation.f1_score).label("avg_f1"),
                func.avg(Evaluation.latency_ms).label("avg_latency_ms"),
                func.avg(Evaluation.estimated_cost_usd).label("avg_cost_usd"),
                func.count(Evaluation.id).label("total_queries"),
            ).first()
            # Queries by day (last 7 days)
            from datetime import timedelta
            cutoff = datetime.now(timezone.utc) - timedelta(days=7)
            daily = db.query(
                func.date(Evaluation.created_at).label("day"),
                func.count(Evaluation.id).label("count"),
            ).filter(
                Evaluation.created_at >= cutoff
            ).group_by(
                func.date(Evaluation.created_at)
            ).order_by("day").all()
            return {
                "avg_faithfulness": round(float(stats.avg_faithfulness or 0), 3),
                "avg_relevance": round(float(stats.avg_relevance or 0), 3),
                "avg_completeness": round(float(stats.avg_completeness or 0), 3),
                "avg_f1": round(float(stats.avg_f1 or 0), 3),
                "avg_latency_ms": round(float(stats.avg_latency_ms or 0), 1),
                "avg_cost_usd": round(float(stats.avg_cost_usd or 0), 6),
                "total_queries": int(stats.total_queries or 0),
                "queries_by_day": [{"day": str(d.day), "count": d.count} for d in daily],
            }
    except Exception as e:
        logger.error(f"Evaluations summary failed: {e}")
        return {"avg_faithfulness": 0, "avg_relevance": 0, "avg_completeness": 0, "avg_f1": 0, "avg_latency_ms": 0, "avg_cost_usd": 0, "total_queries": 0, "queries_by_day": []}


@v1_router.get("/evaluations/recent", summary="Recent evaluation records")
async def v1_evaluations_recent(
    limit: int = QueryParam(default=50, le=200),
    current_user: dict = Depends(get_current_user),
):
    """Last N evaluation records (JWT auth)."""
    try:
        from database import get_db_session
        from models import Evaluation
        with get_db_session() as db:
            rows = db.query(Evaluation).order_by(Evaluation.created_at.desc()).limit(limit).all()
            return {"evaluations": [{
                "id": r.id,
                "query": r.query,
                "faithfulness": r.faithfulness,
                "relevance": r.relevance,
                "completeness": r.completeness,
                "precision": r.precision,
                "recall": r.recall,
                "f1_score": r.f1_score,
                "confidence_score": r.confidence_score,
                "latency_ms": r.latency_ms,
                "estimated_cost_usd": r.estimated_cost_usd,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            } for r in rows], "total": len(rows)}
    except Exception as e:
        logger.error(f"Evaluations recent failed: {e}")
        return {"evaluations": [], "total": 0}


# ───────────────────────────
# Pipeline Status
# ───────────────────────────

# In-memory pipeline node status dict updated during queries
PIPELINE_STATUS = {
    "data_sources": {"status": "idle", "last_run_ms": 0, "last_run_at": None},
    "restructuring": {"status": "idle", "last_run_ms": 0, "last_run_at": None},
    "chunking": {"status": "idle", "last_run_ms": 0, "last_run_at": None},
    "metadata": {"status": "idle", "last_run_ms": 0, "last_run_at": None},
    "planner": {"status": "idle", "last_run_ms": 0, "last_run_at": None},
    "tool_execution": {"status": "idle", "last_run_ms": 0, "last_run_at": None},
    "router": {"status": "idle", "last_run_ms": 0, "last_run_at": None},
    "multi_agent": {"status": "idle", "last_run_ms": 0, "last_run_at": None},
    "agent_1": {"status": "idle", "last_run_ms": 0, "last_run_at": None},
    "agent_2": {"status": "idle", "last_run_ms": 0, "last_run_at": None},
    "agent_3": {"status": "idle", "last_run_ms": 0, "last_run_at": None},
    "human_validation": {"status": "idle", "last_run_ms": 0, "last_run_at": None},
    "evaluation": {"status": "idle", "last_run_ms": 0, "last_run_at": None},
    "database": {"status": "idle", "last_run_ms": 0, "last_run_at": None},
}


@v1_router.get("/pipeline/status", summary="Live pipeline node status")
async def v1_pipeline_status(
    current_user: dict = Depends(get_current_user),
):
    """Returns in-memory dict of pipeline node statuses (JWT auth)."""
    return PIPELINE_STATUS


# ───────────────────────────
# SSE-Integrated Full Pipeline Chat
# ───────────────────────────

@v1_router.post("/chat/sse", summary="Full pipeline chat with SSE events")
async def v1_chat_sse(
    request: Request,
    body: ChatRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    Full RAG pipeline with Server-Sent Events at each stage:
    planning → gatekeeper → retrieval → routing → agents → cost → evaluation → done
    """
    import asyncio
    import time
    from rag_pipeline import Planner, ToolExecution, ConditionalRouter as CondRouter
    from multi_agent import run_multi_agent, run_single_agent
    from evaluator import Evaluator, LatencyCostTracker
    from auth import Gatekeeper as GK

    username = current_user["username"]
    user_role = current_user["role"]
    t_start = time.time()
    
    sse_queue = asyncio.Queue()

    async def pipeline_worker():
        try:
            await sse_queue.put({"event": "progress", "data": {"step": 1, "label": "Planning query", "icon": "brain"}})
            planner = Planner()
            plan = await planner.plan(body.question, sse_queue)
            
            gk = GK()
            gate_result = gk.check_query(body.question, username)
            await sse_queue.put({"event": "gatekeeper", "data": {"status": gate_result["status"], "query": body.question[:100]}})
            
            if gate_result["status"] == "under_review":
                await sse_queue.put({"event": "done", "data": {"answer": "Your query has been flagged for human review.", "status": "under_review"}})
                await sse_queue.put(None)
                return
                
            await sse_queue.put({"event": "progress", "data": {"step": 2, "label": "Retrieving context", "icon": "search"}})
            tool_exec = ToolExecution(vector_store, sse_queue)
            chunks = await tool_exec.execute(plan, body.question)
            
            await sse_queue.put({"event": "progress", "data": {"step": 3, "label": "Routing query", "icon": "route"}})
            router = CondRouter(sse_queue)
            route_decision = await router.route(chunks)
            
            await sse_queue.put({"event": "progress", "data": {"step": 4, "label": "Running generation agents", "icon": "bot"}})
            decision = route_decision["decision"]
            final_response = ""
            
            if decision == "multi_agent" or decision == "multi-agent":
                state = await run_multi_agent(body.question, chunks, {"user_role": user_role, "format": body.format}, sse_queue)
                final_response = state["final_response"]
            elif decision == "human_validation" or decision == "human review":
                final_response = "This query requires human review due to low confidence."
                await sse_queue.put({"event": "done", "data": {"answer": final_response, "status": "under_review"}})
                await sse_queue.put(None)
                return
            else:
                state = await run_single_agent(body.question, chunks, sse_queue, metadata={"user_role": user_role, "format": body.format})
                final_response = state["final_response"]
                
            # --- Disabled evaluation to maximize speed ---
            # try:
            #     evaluator = Evaluator()
            #     eval_result = await evaluator.evaluate_async(...)
            # except Exception as e:
            #     logger.error(f"Evaluation failed: {e}")
                
            total_ms = int((time.time() - t_start) * 1000)
            _track_analytics("sse_pipeline_complete", user_id=username, metadata={
                "strategy": plan.get("strategy"),
                "agent_path": decision,
                "total_ms": total_ms,
            })
            
            await sse_queue.put({"event": "done", "data": {
                "answer": final_response,
                "confidence": route_decision["confidence"],
                "strategy": plan.get("strategy"),
                "agent_path": decision,
                "total_pipeline_ms": total_ms
            }})
            
        except Exception as e:
            logger.error(f"Pipeline processing failed: {e}", exc_info=True)
            await sse_queue.put({"event": "error", "data": {"message": str(e)}})
        finally:
            await sse_queue.put(None) # Signal termination

    async def pipeline_generator():
        # Start processing task
        asyncio.create_task(pipeline_worker())
        
        while True:
            msg = await sse_queue.get()
            if msg is None:
                break
            yield sse_manager._format_sse(msg["event"], msg["data"])

    return StreamingResponse(
        pipeline_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ───────────────────────────
# SSE Streaming Endpoints
# ───────────────────────────

@v1_router.get("/events/stream", summary="SSE event stream")
async def v1_sse_stream(
    channel: str = QueryParam(default="default"),
    current_user: dict = Depends(get_current_user),
):
    """Subscribe to real-time Server-Sent Events with automatic heartbeat."""
    queue = sse_manager.subscribe(channel)

    async def event_generator():
        async for message in sse_manager.stream(queue, channel):
            yield message

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@v1_router.post("/events/publish", summary="Publish an SSE event")
async def v1_sse_publish(
    event: str = "update",
    channel: str = "default",
    current_user: dict = Depends(require_permission("execute")),
):
    """Publish an event to all SSE subscribers on a channel."""
    await sse_manager.publish(event, {
        "message": f"Event from {current_user['username']}",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }, channel)
    return {"published": True, "channel": channel, "subscribers": sse_manager.active_connections(channel)}


@v1_router.get("/events/status", summary="SSE connection stats")
async def v1_sse_status(
    current_user: dict = Depends(get_current_user),
):
    """View active SSE subscriber count per channel."""
    return {
        "channels": {ch: len(subs) for ch, subs in sse_manager._channels.items()},
        "total_subscribers": sum(len(s) for s in sse_manager._channels.values()),
    }


# ── Mount V1 Router ──
app.include_router(v1_router)


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