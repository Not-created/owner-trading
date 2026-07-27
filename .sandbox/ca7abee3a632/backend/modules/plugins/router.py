"""
Plugin management — /api/plugins
Framework for install/enable/disable/uninstall. Since Part 2 ships specific
plugins, this milestone exposes registry status only (no dummy plugins).
"""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from core.database import get_db
from core.error_handling import AppError
from modules.auth.deps import get_current_user

router = APIRouter(prefix="/api/plugins", tags=["plugins"])


class RegisterPluginBody(BaseModel):
    plugin_id: str
    name: str
    version: str = "1.0.0"
    kind: str = "generic"  # generic | broker | ai
    metadata: dict = {}


@router.get("")
async def list_plugins(user=Depends(get_current_user)):
    db = get_db()
    cursor = db.plugins.find({})
    out = []
    async for p in cursor:
        out.append({
            "plugin_id": p["plugin_id"],
            "name": p.get("name"),
            "version": p.get("version"),
            "kind": p.get("kind"),
            "enabled": p.get("enabled", True),
            "created_at": p.get("created_at"),
        })
    return {"plugins": out}


@router.post("")
async def register_plugin(body: RegisterPluginBody, user=Depends(get_current_user)):
    db = get_db()
    existing = await db.plugins.find_one({"plugin_id": body.plugin_id})
    if existing:
        raise AppError("VALIDATION", status=400, detail="Plugin already registered")
    await db.plugins.insert_one({
        "plugin_id": body.plugin_id,
        "name": body.name,
        "version": body.version,
        "kind": body.kind,
        "enabled": True,
        "metadata": body.metadata,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"ok": True}


@router.post("/{plugin_id}/enable")
async def enable_plugin(plugin_id: str, user=Depends(get_current_user)):
    db = get_db()
    r = await db.plugins.update_one({"plugin_id": plugin_id}, {"$set": {"enabled": True}})
    if r.matched_count == 0:
        raise AppError("NOT_FOUND", status=404)
    return {"ok": True}


@router.post("/{plugin_id}/disable")
async def disable_plugin(plugin_id: str, user=Depends(get_current_user)):
    db = get_db()
    r = await db.plugins.update_one({"plugin_id": plugin_id}, {"$set": {"enabled": False}})
    if r.matched_count == 0:
        raise AppError("NOT_FOUND", status=404)
    return {"ok": True}


@router.delete("/{plugin_id}")
async def uninstall_plugin(plugin_id: str, user=Depends(get_current_user)):
    db = get_db()
    r = await db.plugins.delete_one({"plugin_id": plugin_id})
    if r.deleted_count == 0:
        raise AppError("NOT_FOUND", status=404)
    return {"ok": True}
