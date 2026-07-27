"""
Settings Engine — /api/settings
Persisted key/value settings store. All settings save; nothing is read-only.
"""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from core.database import get_db
from modules.auth.deps import get_current_user

router = APIRouter(prefix="/api/settings", tags=["settings"])


class UpsertBody(BaseModel):
    key: str
    value: dict


@router.get("")
async def list_settings(user=Depends(get_current_user)):
    db = get_db()
    cursor = db.settings_store.find({})
    out = {}
    async for s in cursor:
        out[s["key"]] = s.get("value")
    return {"settings": out}


@router.get("/{key}")
async def get_setting(key: str, user=Depends(get_current_user)):
    db = get_db()
    doc = await db.settings_store.find_one({"key": key})
    return {"key": key, "value": (doc or {}).get("value")}


@router.put("/{key}")
async def upsert_setting(key: str, body: dict, user=Depends(get_current_user)):
    db = get_db()
    now = datetime.now(timezone.utc).isoformat()
    await db.settings_store.update_one(
        {"key": key},
        {"$set": {"key": key, "value": body, "updated_at": now}},
        upsert=True,
    )
    return {"ok": True}
