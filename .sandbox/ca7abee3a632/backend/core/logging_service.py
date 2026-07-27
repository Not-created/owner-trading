"""
Centralized structured logging + audit log store.
Writes to Python logger AND MongoDB `audit_logs` collection so logs are searchable.
"""
import logging
from datetime import datetime, timezone
from typing import Any, Optional

from core.database import get_db

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
)

LEVELS = {"info", "warning", "error", "critical", "debug"}
CATEGORIES = {
    "auth", "user", "api", "broker", "ai", "system",
    "security", "audit", "trading", "notification", "plugin",
}


class LogService:
    def __init__(self) -> None:
        self._logger = logging.getLogger("platform")

    async def log(
        self,
        level: str,
        category: str,
        message: str,
        *,
        user_id: Optional[str] = None,
        meta: Optional[dict[str, Any]] = None,
    ) -> None:
        level = level.lower()
        if level not in LEVELS:
            level = "info"
        if category not in CATEGORIES:
            category = "system"

        # Console
        py_level = getattr(logging, level.upper(), logging.INFO)
        self._logger.log(py_level, f"[{category}] {message}")

        # MongoDB
        doc = {
            "level": level,
            "category": category,
            "message": message,
            "user_id": user_id,
            "meta": meta or {},
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        try:
            await get_db().audit_logs.insert_one(doc)
        except Exception as e:  # never let logging break the app
            self._logger.error(f"audit_log insert failed: {e}")

    async def info(self, category: str, msg: str, **kw: Any) -> None:
        await self.log("info", category, msg, **kw)

    async def warn(self, category: str, msg: str, **kw: Any) -> None:
        await self.log("warning", category, msg, **kw)

    async def error(self, category: str, msg: str, **kw: Any) -> None:
        await self.log("error", category, msg, **kw)

    async def critical(self, category: str, msg: str, **kw: Any) -> None:
        await self.log("critical", category, msg, **kw)


log_service = LogService()
