"""
Pagani Zonda R – Enterprise Analytics
Compute engagement metrics, query stats, AI performance, and system health.
"""

import os
import time
import logging
import platform
from datetime import datetime, timezone, timedelta
from typing import Optional

logger = logging.getLogger("pagani.analytics")

# ── Server start time (set from main.py) ──
_server_start_time: Optional[datetime] = None


def set_server_start_time(t: datetime):
    global _server_start_time
    _server_start_time = t


def get_user_engagement_metrics(days: int = 30) -> dict:
    """Aggregate user engagement from AnalyticsEvent table."""
    try:
        from database import get_db_session
        from models import AnalyticsEvent, User
        from sqlalchemy import func

        cutoff = datetime.now(timezone.utc) - timedelta(days=days)

        with get_db_session() as db:
            total_events = db.query(func.count(AnalyticsEvent.id)).filter(
                AnalyticsEvent.timestamp >= cutoff
            ).scalar() or 0

            unique_users = db.query(func.count(func.distinct(AnalyticsEvent.user_id))).filter(
                AnalyticsEvent.timestamp >= cutoff
            ).scalar() or 0

            total_chats = db.query(func.count(AnalyticsEvent.id)).filter(
                AnalyticsEvent.event_type == "chat_started",
                AnalyticsEvent.timestamp >= cutoff,
            ).scalar() or 0

            total_logins = db.query(func.count(AnalyticsEvent.id)).filter(
                AnalyticsEvent.event_type == "login_success",
                AnalyticsEvent.timestamp >= cutoff,
            ).scalar() or 0

            total_registrations = db.query(func.count(AnalyticsEvent.id)).filter(
                AnalyticsEvent.event_type == "user_registered",
                AnalyticsEvent.timestamp >= cutoff,
            ).scalar() or 0

            total_users = db.query(func.count(User.id)).scalar() or 0

            # Events by type
            event_breakdown = db.query(
                AnalyticsEvent.event_type,
                func.count(AnalyticsEvent.id)
            ).filter(
                AnalyticsEvent.timestamp >= cutoff
            ).group_by(AnalyticsEvent.event_type).all()

            return {
                "period_days": days,
                "total_events": total_events,
                "unique_active_users": unique_users,
                "total_users": total_users,
                "total_chats": total_chats,
                "total_logins": total_logins,
                "total_registrations": total_registrations,
                "event_breakdown": {row[0]: row[1] for row in event_breakdown},
                "generated_at": datetime.now(timezone.utc).isoformat(),
            }
    except Exception as e:
        logger.error(f"Failed to compute engagement metrics: {e}")
        return {"error": str(e)}


def get_query_success_rates(days: int = 30) -> dict:
    """Compute query success/failure rates from analytics events."""
    try:
        from database import get_db_session
        from models import AnalyticsEvent
        from sqlalchemy import func

        cutoff = datetime.now(timezone.utc) - timedelta(days=days)

        with get_db_session() as db:
            total_queries = db.query(func.count(AnalyticsEvent.id)).filter(
                AnalyticsEvent.event_type == "query_submitted",
                AnalyticsEvent.timestamp >= cutoff,
            ).scalar() or 0

            successful = db.query(func.count(AnalyticsEvent.id)).filter(
                AnalyticsEvent.event_type == "response_received",
                AnalyticsEvent.timestamp >= cutoff,
            ).scalar() or 0

            failed = total_queries - successful if total_queries > successful else 0

            return {
                "period_days": days,
                "total_queries": total_queries,
                "successful": successful,
                "failed": failed,
                "success_rate": round(successful / total_queries, 3) if total_queries > 0 else 0.0,
                "generated_at": datetime.now(timezone.utc).isoformat(),
            }
    except Exception as e:
        logger.error(f"Failed to compute query rates: {e}")
        return {"error": str(e)}


def get_ai_performance_metrics(days: int = 30) -> dict:
    """Compute AI performance metrics from analytics events."""
    try:
        from database import get_db_session
        from models import AnalyticsEvent
        from sqlalchemy import func

        cutoff = datetime.now(timezone.utc) - timedelta(days=days)

        with get_db_session() as db:
            # Get response events with metadata
            events = db.query(AnalyticsEvent).filter(
                AnalyticsEvent.event_type == "response_received",
                AnalyticsEvent.timestamp >= cutoff,
            ).all()

            confidences = []
            latencies = []
            for ev in events:
                if ev.metadata_:
                    if "confidence" in ev.metadata_:
                        conf = ev.metadata_["confidence"]
                        if isinstance(conf, (int, float)):
                            confidences.append(conf)
                        elif conf == "high":
                            confidences.append(90)
                        elif conf == "medium":
                            confidences.append(60)
                        elif conf == "low":
                            confidences.append(30)
                    if "latency_s" in ev.metadata_:
                        latencies.append(ev.metadata_["latency_s"])

            return {
                "period_days": days,
                "total_responses": len(events),
                "confidence": {
                    "avg": round(sum(confidences) / len(confidences), 1) if confidences else 0,
                    "high_count": sum(1 for c in confidences if c >= 70),
                    "medium_count": sum(1 for c in confidences if 40 <= c < 70),
                    "low_count": sum(1 for c in confidences if c < 40),
                },
                "latency": {
                    "avg_s": round(sum(latencies) / len(latencies), 2) if latencies else 0,
                    "min_s": round(min(latencies), 2) if latencies else 0,
                    "max_s": round(max(latencies), 2) if latencies else 0,
                },
                "generated_at": datetime.now(timezone.utc).isoformat(),
            }
    except Exception as e:
        logger.error(f"Failed to compute AI performance metrics: {e}")
        return {"error": str(e)}


def get_system_health() -> dict:
    """Compute system health metrics."""
    health = {
        "platform": platform.platform(),
        "python_version": platform.python_version(),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    # Uptime
    if _server_start_time:
        uptime = (datetime.now(timezone.utc) - _server_start_time).total_seconds()
        health["uptime_seconds"] = round(uptime, 0)
        health["uptime_human"] = _format_uptime(uptime)

    # System metrics (psutil optional)
    try:
        import psutil
        health["cpu_percent"] = psutil.cpu_percent(interval=0.1)
        mem = psutil.virtual_memory()
        health["memory"] = {
            "total_gb": round(mem.total / (1024**3), 2),
            "used_gb": round(mem.used / (1024**3), 2),
            "percent": mem.percent,
        }
        disk = psutil.disk_usage("/")
        health["disk"] = {
            "total_gb": round(disk.total / (1024**3), 2),
            "used_gb": round(disk.used / (1024**3), 2),
            "percent": round(disk.percent, 1),
        }
    except ImportError:
        health["system_metrics"] = "psutil not installed — install for CPU/memory metrics"
    except Exception as e:
        health["system_metrics_error"] = str(e)

    return health


def _format_uptime(seconds: float) -> str:
    """Convert seconds to human-readable uptime string."""
    days = int(seconds // 86400)
    hours = int((seconds % 86400) // 3600)
    minutes = int((seconds % 3600) // 60)
    if days > 0:
        return f"{days}d {hours}h {minutes}m"
    elif hours > 0:
        return f"{hours}h {minutes}m"
    return f"{minutes}m"


def export_analytics_csv(days: int = 30) -> str:
    """Export analytics as CSV string."""
    import csv
    import io

    try:
        from database import get_db_session
        from models import AnalyticsEvent

        cutoff = datetime.now(timezone.utc) - timedelta(days=days)

        with get_db_session() as db:
            events = db.query(AnalyticsEvent).filter(
                AnalyticsEvent.timestamp >= cutoff
            ).order_by(AnalyticsEvent.timestamp.desc()).all()

            output = io.StringIO()
            writer = csv.writer(output)
            writer.writerow(["id", "event_type", "user_id", "metadata", "timestamp"])
            for ev in events:
                writer.writerow([
                    ev.id,
                    ev.event_type,
                    ev.user_id or "",
                    str(ev.metadata_) if ev.metadata_ else "",
                    ev.timestamp.isoformat() if ev.timestamp else "",
                ])
            return output.getvalue()
    except Exception as e:
        logger.error(f"Failed to export analytics: {e}")
        return f"Error: {e}"
