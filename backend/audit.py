"""
Pagani Zonda R – Audit & Logging System
Track user actions, login attempts, data access with DB persistence.
"""

import logging
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger("pagani.audit")


class AuditLogger:
    """Records user actions to the database for compliance and review."""

    # Standard action types
    ACTION_LOGIN_SUCCESS = "login_success"
    ACTION_LOGIN_FAILURE = "login_failure"
    ACTION_REGISTER = "user_register"
    ACTION_ROLE_CHANGE = "role_change"
    ACTION_DOCUMENT_UPLOAD = "document_upload"
    ACTION_DOCUMENT_DELETE = "document_delete"
    ACTION_CHAT_QUERY = "chat_query"
    ACTION_DATA_ACCESS = "data_access"
    ACTION_PERMISSION_DENIED = "permission_denied"
    ACTION_SETTINGS_CHANGE = "settings_change"

    @staticmethod
    def log(
        action: str,
        user_id: Optional[str] = None,
        metadata: Optional[dict] = None,
    ):
        """
        Record an audit event to both the logger and the database.
        This is fire-and-forget to avoid blocking the request.
        """
        logger.info(
            f"AUDIT | action={action} | user={user_id or 'system'} | "
            f"meta={metadata or {}}"
        )
        try:
            from database import get_db_session
            from models import SystemLog
            with get_db_session() as db:
                db.add(SystemLog(
                    action=action,
                    user_id=user_id,
                    metadata_=metadata,
                ))
        except Exception as e:
            logger.warning(f"Audit DB persistence failed (non-fatal): {e}")

    @staticmethod
    def log_role_change(
        changed_by: str,
        target_user: str,
        old_role: str,
        new_role: str,
    ):
        """Log a role change event with structured metadata."""
        AuditLogger.log(
            action=AuditLogger.ACTION_ROLE_CHANGE,
            user_id=changed_by,
            metadata={
                "target_user": target_user,
                "old_role": old_role,
                "new_role": new_role,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            },
        )


def get_audit_logs(
    action: Optional[str] = None,
    user_id: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
) -> list[dict]:
    """
    Retrieve audit logs from the database with optional filters.
    Returns a list of dicts for JSON serialization.
    """
    try:
        from database import get_db_session
        from models import SystemLog
        with get_db_session() as db:
            query = db.query(SystemLog)
            if action:
                query = query.filter(SystemLog.action == action)
            if user_id:
                query = query.filter(SystemLog.user_id == user_id)
            query = query.order_by(SystemLog.timestamp.desc())
            query = query.offset(offset).limit(limit)
            logs = query.all()
            return [
                {
                    "id": log.id,
                    "action": log.action,
                    "user_id": log.user_id,
                    "metadata": log.metadata_,
                    "timestamp": log.timestamp.isoformat() if log.timestamp else None,
                }
                for log in logs
            ]
    except Exception as e:
        logger.error(f"Failed to retrieve audit logs: {e}")
        return []


def get_login_attempts(limit: int = 50) -> list[dict]:
    """Retrieve recent login attempt logs."""
    return get_audit_logs(
        action=AuditLogger.ACTION_LOGIN_SUCCESS,
        limit=limit,
    ) + get_audit_logs(
        action=AuditLogger.ACTION_LOGIN_FAILURE,
        limit=limit,
    )


# ── Singleton ──
audit = AuditLogger()
