"""
Broker Core Service — account lifecycle, primary broker selection, encrypted credentials.
"""
import uuid
from datetime import datetime, timezone

from core.database import get_db
from core.security import get_encryption
from core.error_handling import AppError
from core.logging_service import log_service
from modules.broker_core.registry import broker_registry


async def list_plugins() -> list[dict]:
    return broker_registry.list_safe()


async def list_accounts(user_id: str) -> list[dict]:
    db = get_db()
    cursor = db.broker_accounts.find({"user_id": user_id})
    out = []
    async for a in cursor:
        out.append({
            "account_id": a["account_id"],
            "plugin_id": a["plugin_id"],
            "label": a.get("label"),
            "status": a.get("status", "disconnected"),
            "is_primary": a.get("is_primary", False),
            "created_at": a.get("created_at"),
            "last_health": a.get("last_health"),
        })
    return out


async def add_account(user_id: str, plugin_id: str, label: str, credentials: dict) -> dict:
    plugin = broker_registry.get(plugin_id)
    if not plugin:
        raise AppError("NOT_FOUND", status=404, detail="Broker plugin not registered")
    missing = plugin.validate_credentials(credentials)
    if missing:
        raise AppError("VALIDATION", status=400, detail=f"Missing: {', '.join(missing)}")
    enc = get_encryption()
    encrypted = {k: enc.encrypt(str(v)) for k, v in credentials.items()}
    account_id = uuid.uuid4().hex
    db = get_db()
    now = datetime.now(timezone.utc).isoformat()
    await db.broker_accounts.insert_one({
        "account_id": account_id,
        "user_id": user_id,
        "plugin_id": plugin_id,
        "label": label,
        "credentials_encrypted": encrypted,
        "status": "disconnected",
        "is_primary": False,
        "created_at": now,
    })
    await log_service.info("broker", f"Account added: {plugin_id}/{label}", user_id=user_id)
    return {"account_id": account_id}


async def remove_account(user_id: str, account_id: str) -> None:
    db = get_db()
    r = await db.broker_accounts.delete_one({"user_id": user_id, "account_id": account_id})
    if r.deleted_count == 0:
        raise AppError("NOT_FOUND", status=404)


async def set_primary(user_id: str, account_id: str) -> None:
    db = get_db()
    acc = await db.broker_accounts.find_one({"user_id": user_id, "account_id": account_id})
    if not acc:
        raise AppError("NOT_FOUND", status=404)
    await db.broker_accounts.update_many({"user_id": user_id}, {"$set": {"is_primary": False}})
    await db.broker_accounts.update_one({"account_id": account_id}, {"$set": {"is_primary": True}})


async def connect_account(user_id: str, account_id: str) -> dict:
    db = get_db()
    acc = await db.broker_accounts.find_one({"user_id": user_id, "account_id": account_id})
    if not acc:
        raise AppError("NOT_FOUND", status=404)
    plugin = broker_registry.get(acc["plugin_id"])
    if not plugin:
        raise AppError("NOT_FOUND", status=404, detail="Plugin no longer installed")
    enc = get_encryption()
    creds = {k: enc.decrypt(v) for k, v in acc.get("credentials_encrypted", {}).items()}
    health = await plugin.connect(creds)
    status = "connected" if health.ok else "error"
    await db.broker_accounts.update_one(
        {"account_id": account_id},
        {"$set": {"status": status, "last_health": {"ok": health.ok, "detail": health.detail, "latency_ms": health.latency_ms}}},
    )
    return {"ok": health.ok, "detail": health.detail, "latency_ms": health.latency_ms}


async def disconnect_account(user_id: str, account_id: str) -> None:
    db = get_db()
    acc = await db.broker_accounts.find_one({"user_id": user_id, "account_id": account_id})
    if not acc:
        raise AppError("NOT_FOUND", status=404)
    plugin = broker_registry.get(acc["plugin_id"])
    if plugin:
        try:
            await plugin.disconnect(account_id)
        except Exception:
            pass
    await db.broker_accounts.update_one({"account_id": account_id}, {"$set": {"status": "disconnected"}})


async def test_connection(user_id: str, account_id: str) -> dict:
    db = get_db()
    acc = await db.broker_accounts.find_one({"user_id": user_id, "account_id": account_id})
    if not acc:
        raise AppError("NOT_FOUND", status=404)
    plugin = broker_registry.get(acc["plugin_id"])
    if not plugin:
        raise AppError("NOT_FOUND", status=404, detail="Plugin no longer installed")
    enc = get_encryption()
    creds = {k: enc.decrypt(v) for k, v in acc.get("credentials_encrypted", {}).items()}
    health = await plugin.connect(creds)
    return {"ok": health.ok, "detail": health.detail, "latency_ms": health.latency_ms}


async def get_account_info(user_id: str, account_id: str) -> dict:
    db = get_db()
    acc = await db.broker_accounts.find_one({"user_id": user_id, "account_id": account_id})
    if not acc:
        raise AppError("NOT_FOUND", status=404)
    plugin = broker_registry.get(acc["plugin_id"])
    if not plugin:
        raise AppError("NOT_FOUND", status=404, detail="Plugin no longer installed")
    enc = get_encryption()
    creds = {k: enc.decrypt(v) for k, v in acc.get("credentials_encrypted", {}).items()}
    info = await plugin.account_info(creds)
    safe = {k: v for k, v in info.items() if k not in ("password", "secret", "token", "api_secret", "api_key")}
    return safe
