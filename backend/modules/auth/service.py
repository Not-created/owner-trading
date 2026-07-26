"""
Auth Service — user lookup, brute-force protection, session store.
"""
from datetime import datetime, timezone, timedelta
from typing import Optional
from bson import ObjectId

from core.database import get_db
from core.config import get_settings
from core.security import hash_password, verify_password
from core.error_handling import AppError


async def find_user_by_login(login: str) -> Optional[dict]:
    """Accepts either username or email."""
    db = get_db()
    login_norm = login.strip().lower()
    return await db.users.find_one(
        {"$or": [{"username": login}, {"username_lower": login_norm}, {"email": login_norm}]}
    )


async def find_user_by_id(user_id: str) -> Optional[dict]:
    db = get_db()
    try:
        return await db.users.find_one({"_id": ObjectId(user_id)})
    except Exception:
        return None


async def check_brute_force(identifier: str) -> None:
    s = get_settings()
    db = get_db()
    window_start = datetime.now(timezone.utc) - timedelta(minutes=s.lockout_minutes)
    count = await db.login_attempts.count_documents({
        "identifier": identifier,
        "created_at_dt": {"$gte": window_start},
        "success": False,
    })
    if count >= s.max_failed_attempts:
        raise AppError("AUTH_LOCKED", status=429)


async def record_attempt(identifier: str, success: bool) -> None:
    db = get_db()
    now = datetime.now(timezone.utc)
    await db.login_attempts.insert_one({
        "identifier": identifier,
        "success": success,
        "created_at": now.isoformat(),
        "created_at_dt": now,
    })
    if success:
        await db.login_attempts.delete_many({"identifier": identifier, "success": False})


async def create_session(user_id: str, jti: str, device: dict, ttl_days: int) -> str:
    db = get_db()
    now = datetime.now(timezone.utc)
    expires = now + timedelta(days=ttl_days)
    doc = {
        "user_id": user_id,
        "token_jti": jti,
        "device": device,
        "created_at": now.isoformat(),
        "last_seen_at": now.isoformat(),
        "expires_at": expires,
    }
    result = await db.sessions.insert_one(doc)
    return str(result.inserted_id)


async def revoke_session(session_id: str, user_id: str) -> bool:
    db = get_db()
    try:
        r = await db.sessions.delete_one({"_id": ObjectId(session_id), "user_id": user_id})
        return r.deleted_count > 0
    except Exception:
        return False


async def revoke_all_sessions(user_id: str, except_jti: Optional[str] = None) -> int:
    db = get_db()
    q: dict = {"user_id": user_id}
    if except_jti:
        q["token_jti"] = {"$ne": except_jti}
    r = await db.sessions.delete_many(q)
    return r.deleted_count


async def seed_owner() -> None:
    """Idempotent single-user seed."""
    s = get_settings()
    db = get_db()
    now = datetime.now(timezone.utc).isoformat()
    existing = await db.users.find_one({"username": s.owner_username})
    if existing is None:
        await db.users.insert_one({
            "username": s.owner_username,
            "username_lower": s.owner_username.lower(),
            "email": s.owner_email,
            "password_hash": hash_password(s.owner_password),
            "role": "owner",
            "profile": {
                "display_name": "Platform Owner",
                "avatar_url": None,
                "recovery_email": None,
                "timezone": "UTC",
                "language": "en",
                "theme": "dark",
            },
            "two_factor_enabled": False,
            "created_at": now,
        })
    else:
        updates: dict = {}
        if existing.get("role") != "owner":
            updates["role"] = "owner"
        if not verify_password(s.owner_password, existing["password_hash"]):
            updates["password_hash"] = hash_password(s.owner_password)
        if updates:
            await db.users.update_one({"_id": existing["_id"]}, {"$set": updates})


def public_user(user: dict) -> dict:
    return {
        "id": str(user["_id"]),
        "username": user["username"],
        "email": user["email"],
        "role": user["role"],
        "profile": user.get("profile", {}),
        "two_factor_enabled": user.get("two_factor_enabled", False),
        "created_at": user.get("created_at"),
    }
