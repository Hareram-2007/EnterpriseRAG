"""
Pagani Zonda R – Authentication & Authorization
JWT-based auth with refresh tokens, role-based access, and Pydantic models.
"""

import os
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel, Field
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger("pagani.auth")

# ── DB Persistence Helpers (additive, non-breaking) ──
def _persist_user_to_db(username: str, password_hash: str, role: str):
    """Persist a registered user to the database (fire-and-forget)."""
    try:
        from database import get_db_session
        from models import User
        with get_db_session() as db:
            existing = db.query(User).filter(User.name == username).first()
            if not existing:
                db.add(User(name=username, password_hash=password_hash, role=role))
    except Exception as e:
        logger.warning(f"DB user persistence failed (non-fatal): {e}")


def _log_auth_event(action: str, username: str, metadata: dict | None = None):
    """Log an auth event to the database (fire-and-forget)."""
    try:
        from logging_config import log_event
        log_event("pagani.auth", action, user_id=username, metadata=metadata)
    except Exception as e:
        logger.warning(f"Auth event logging failed (non-fatal): {e}")

# ── Configuration ──
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "pagani-default-secret")
JWT_REFRESH_SECRET_KEY = os.getenv("JWT_REFRESH_SECRET_KEY", "pagani-refresh-secret")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))
REFRESH_TOKEN_EXPIRE_DAYS = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "7"))
ALGORITHM = "HS256"

# ── Password Hashing ──
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# ── Security Scheme ──
security = HTTPBearer(auto_error=False)

# ── In-Memory User Store (Demo) ──
# Structure: { username: { password_hash, role, created_at } }
users_db: dict[str, dict] = {}


def _load_users_from_db():
    """Load persisted users from DB into in-memory store on startup."""
    try:
        from database import get_db_session
        from models import User
        with get_db_session() as db:
            for user in db.query(User).all():
                if user.name not in users_db:
                    users_db[user.name] = {
                        "password_hash": user.password_hash,
                        "role": user.role,
                        "created_at": getattr(user, "created_at", datetime.now(timezone.utc).isoformat()),
                    }
        if users_db:
            logger.info(f"Loaded {len(users_db)} users from database")
    except Exception as e:
        logger.warning(f"Could not load users from DB (non-fatal): {e}")


# Load users on module import
_load_users_from_db()

# ── Valid Roles ──
VALID_ROLES = {"super_admin", "admin", "engineer", "viewer"}

# ── Permission Matrix ──
ROLE_PERMISSIONS: dict[str, list[str]] = {
    "super_admin": ["read", "write", "delete", "execute", "manage_roles", "manage_users"],
    "admin": ["read", "write", "delete", "execute", "manage_users"],
    "engineer": ["read", "write", "execute"],
    "viewer": ["read"],
}

# ── Brute-Force Protection ──
# Track failed login attempts: { ip_or_username: { count, locked_until } }
_login_attempts: dict[str, dict] = {}
MAX_LOGIN_ATTEMPTS = 5
LOCKOUT_MINUTES = 15


# ═══════════════════════════════════════════
# Pydantic Models
# ═══════════════════════════════════════════

class UserRegister(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=6, max_length=128)
    role: str = Field(default="viewer")


class UserLogin(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    role: str
    username: str


class RefreshRequest(BaseModel):
    refresh_token: str


class ChatRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=2000)


class ChatResponse(BaseModel):
    answer: str
    sources: list[str]
    confidence: str
    user_role: str


class UserInfo(BaseModel):
    username: str
    role: str
    created_at: str


class ErrorResponse(BaseModel):
    detail: str
    error_code: str = "UNKNOWN_ERROR"


# ═══════════════════════════════════════════
# Password Utilities
# ═══════════════════════════════════════════

def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


# ═══════════════════════════════════════════
# JWT Token Creation
# ═══════════════════════════════════════════

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({
        "exp": expire,
        "iat": datetime.now(timezone.utc),
        "type": "access",
    })
    return jwt.encode(to_encode, JWT_SECRET_KEY, algorithm=ALGORITHM)


def create_refresh_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({
        "exp": expire,
        "iat": datetime.now(timezone.utc),
        "type": "refresh",
    })
    return jwt.encode(to_encode, JWT_REFRESH_SECRET_KEY, algorithm=ALGORITHM)


# ═══════════════════════════════════════════
# JWT Token Verification
# ═══════════════════════════════════════════

def verify_access_token(token: str) -> dict:
    """Verify and decode an access token. Raises HTTPException on failure."""
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token type",
            )
        username: str = payload.get("sub")
        role: str = payload.get("role")
        if username is None or role is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token payload",
            )
        return {"username": username, "role": role}
    except JWTError as e:
        logger.warning(f"Token verification failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired or is invalid",
            headers={"WWW-Authenticate": "Bearer"},
        )


def verify_refresh_token(token: str) -> dict:
    """Verify and decode a refresh token."""
    try:
        payload = jwt.decode(token, JWT_REFRESH_SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("type") != "refresh":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid refresh token type",
            )
        username: str = payload.get("sub")
        role: str = payload.get("role")
        if username is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid refresh token payload",
            )
        return {"username": username, "role": role}
    except JWTError as e:
        logger.warning(f"Refresh token verification failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token has expired or is invalid",
        )


# ═══════════════════════════════════════════
# FastAPI Dependencies
# ═══════════════════════════════════════════

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    """
    FastAPI dependency: extract and validate the current user from JWT.
    Usage: user = Depends(get_current_user)
    """
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_data = verify_access_token(credentials.credentials)

    # Verify user still exists in store
    if user_data["username"] not in users_db:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User no longer exists",
        )

    logger.info(f"Authenticated user: {user_data['username']} (role: {user_data['role']})")
    return user_data


def require_permission(permission: str):
    """
    Dependency factory: checks if current user's role has the required permission.
    Usage: Depends(require_permission("manage_roles"))
    """
    async def _check(current_user: dict = Depends(get_current_user)):
        role = current_user.get("role", "viewer")
        perms = ROLE_PERMISSIONS.get(role, [])
        if permission not in perms:
            from error_handlers import AuthorizationError
            raise AuthorizationError(
                message=f"Role '{role}' does not have '{permission}' permission.",
                details={"role": role, "required_permission": permission},
            )
        return current_user
    return _check


def check_brute_force(identifier: str):
    """Check if the identifier (username/IP) is locked out due to brute-force."""
    entry = _login_attempts.get(identifier)
    if not entry:
        return
    if entry.get("locked_until"):
        if datetime.now(timezone.utc) < entry["locked_until"]:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Account locked due to too many failed attempts. Try again later.",
            )
        else:
            # Lockout expired, reset
            del _login_attempts[identifier]


def record_login_failure(identifier: str):
    """Record a failed login attempt."""
    if identifier not in _login_attempts:
        _login_attempts[identifier] = {"count": 0, "locked_until": None}
    _login_attempts[identifier]["count"] += 1
    if _login_attempts[identifier]["count"] >= MAX_LOGIN_ATTEMPTS:
        _login_attempts[identifier]["locked_until"] = (
            datetime.now(timezone.utc) + timedelta(minutes=LOCKOUT_MINUTES)
        )
        logger.warning(f"Brute-force lockout for: {identifier}")


def clear_login_attempts(identifier: str):
    """Clear failed login attempts on successful login."""
    _login_attempts.pop(identifier, None)


# ═══════════════════════════════════════════
# User Management
# ═══════════════════════════════════════════

def register_user(user: UserRegister) -> dict:
    """Register a new user. Returns user info."""
    if user.username in users_db:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username already exists",
        )

    if user.role not in VALID_ROLES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid role. Must be one of: {', '.join(VALID_ROLES)}",
        )

    hashed = hash_password(user.password)
    users_db[user.username] = {
        "password_hash": hashed,
        "role": user.role,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    # Persist to DB (additive)
    _persist_user_to_db(user.username, hashed, user.role)
    _log_auth_event("user_register", user.username, {"role": user.role})

    logger.info(f"User registered: {user.username} (role: {user.role})")
    return {"username": user.username, "role": user.role}


async def authenticate_user(user: UserLogin) -> TokenResponse:
    """Authenticate a user and return JWT tokens."""
    import asyncio
    # Check brute-force lockout
    check_brute_force(user.username)

    db_user = users_db.get(user.username)
    if not db_user:
        record_login_failure(user.username)
        _log_auth_event("login_failure", user.username)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )

    # Run bcrypt in thread pool to avoid blocking the event loop
    password_valid = await asyncio.to_thread(verify_password, user.password, db_user["password_hash"])
    if not password_valid:
        record_login_failure(user.username)
        _log_auth_event("login_failure", user.username)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )

    token_data = {"sub": user.username, "role": db_user["role"]}
    access_token = create_access_token(token_data)
    refresh_token = create_refresh_token(token_data)

    # Log auth event (additive)
    _log_auth_event("login_success", user.username, {"role": db_user["role"]})

    # Clear brute-force counter on success
    clear_login_attempts(user.username)

    logger.info(f"User authenticated: {user.username}")
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        role=db_user["role"],
        username=user.username,
    )


def refresh_access_token(refresh_token: str) -> TokenResponse:
    """Generate a new access token from a valid refresh token."""
    payload = verify_refresh_token(refresh_token)
    username = payload["username"]

    db_user = users_db.get(username)
    if not db_user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User no longer exists",
        )

    token_data = {"sub": username, "role": db_user["role"]}
    new_access_token = create_access_token(token_data)
    new_refresh_token = create_refresh_token(token_data)

    logger.info(f"Token refreshed for user: {username}")
    return TokenResponse(
        access_token=new_access_token,
        refresh_token=new_refresh_token,
        expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        role=db_user["role"],
        username=username,
    )
