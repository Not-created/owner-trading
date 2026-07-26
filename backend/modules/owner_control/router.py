"""
Owner Control — the central control center of the platform.

Exposes the live module graph (registered via ModuleRegistry) and platform-wide
capabilities. Every future module auto-appears here without code changes to
this router.
"""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends

from core.database import get_db
from core.module_registry import module_registry
from core.permissions import CAPABILITIES, DEFAULT_PERMISSIONS
from modules.auth.deps import get_current_user
from modules.auth.service import public_user

router = APIRouter(prefix="/api/owner-control", tags=["owner-control"])


@router.get("/overview")
async def overview(user=Depends(get_current_user)):
    db = get_db()
    now = datetime.now(timezone.utc)
    counts = {
        "sessions": await db.sessions.count_documents({"user_id": str(user["_id"])}),
        "audit_logs": await db.audit_logs.count_documents({}),
        "broker_accounts": await db.broker_accounts.count_documents({"user_id": str(user["_id"])}),
        "plugins": await db.plugins.count_documents({}),
        "ai_usage": await db.ai_usage.count_documents({"user_id": str(user["_id"])}),
        "settings_keys": await db.settings_store.count_documents({}),
    }
    return {
        "owner": public_user(user),
        "server_time": now.isoformat(),
        "counts": counts,
        "capabilities": CAPABILITIES,
    }


@router.get("/modules")
async def list_modules(user=Depends(get_current_user)):
    return {"modules": module_registry.as_dicts()}


@router.get("/capabilities")
async def list_capabilities(user=Depends(get_current_user)):
    return {"capabilities": CAPABILITIES, "role": "owner", "grants": DEFAULT_PERMISSIONS["owner"]}
