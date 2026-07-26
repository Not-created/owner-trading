"""
Auth Router — /api/auth
Single-user platform. No public registration.
"""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel, Field
from bson import ObjectId

from core.database import get_db
from core.logging_service import log_service
from core.security import verify_password, hash_password, secure_token
from core.error_handling import AppError
from modules.auth import service as svc
from modules.auth.deps import (
    get_current_user,
    create_access_token,
    create_refresh_token,
    set_auth_cookies,
    clear_auth_cookies,
    decode_token,
    generate_jti,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginBody(BaseModel):
    login: str = Field(min_length=1, max_length=128)  # username or email
    password: str = Field(min_length=1, max_length=256)
    remember_device: bool = False
    totp_code: str | None = None            # required if 2FA is enabled and device is not trusted
    trusted_device_token: str | None = None  # skip 2FA if device was previously trusted
    trust_this_device: bool = False          # after successful 2FA, remember this device


class ChangePasswordBody(BaseModel):
    current_password: str = Field(min_length=1, max_length=256)
    new_password: str = Field(min_length=8, max_length=256)


@router.post("/login")
async def login(body: LoginBody, request: Request, response: Response):
    fwd = request.headers.get("x-forwarded-for", "")
    real_ip = fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else "unknown")
    ip = real_ip
    identifier = f"login:{body.login.lower()}"
    await svc.check_brute_force(identifier)

    user = await svc.find_user_by_login(body.login)
    if not user or not verify_password(body.password, user["password_hash"]):
        await svc.record_attempt(identifier, success=False)
        await log_service.warn("auth", f"Failed login: {body.login}", meta={"ip": ip})
        raise AppError("AUTH_INVALID", status=401)

    # 2FA gate
    if user.get("two_factor_enabled"):
        from modules.auth.two_factor import verify_totp_or_raise
        db = get_db()
        trusted_ok = False
        if body.trusted_device_token:
            td = await db.trusted_devices.find_one({"user_id": str(user["_id"]), "device_id": body.trusted_device_token})
            if td:
                trusted_ok = True
                await db.trusted_devices.update_one({"_id": td["_id"]}, {"$set": {"last_seen_at": datetime.now(timezone.utc).isoformat()}})
        if not trusted_ok:
            if not await verify_totp_or_raise(user, body.totp_code):
                # Do not count this against brute force (password already verified)
                raise AppError("AUTH_INVALID", status=401, detail="TOTP_REQUIRED" if not body.totp_code else "TOTP_INVALID")

    await svc.record_attempt(identifier, success=True)
    user_id = str(user["_id"])
    jti = generate_jti()
    ua = request.headers.get("user-agent", "unknown")
    device = {"ip": ip, "user_agent": ua, "remember": body.remember_device}
    await svc.create_session(user_id, jti, device, ttl_days=30 if body.remember_device else 7)

    # Optionally trust this device after successful 2FA login
    trusted_device_id = None
    if user.get("two_factor_enabled") and body.trust_this_device:
        db = get_db()
        trusted_device_id = secure_token(16)
        await db.trusted_devices.insert_one({
            "device_id": trusted_device_id,
            "user_id": user_id,
            "label": ua[:80],
            "user_agent": ua,
            "trusted_at": datetime.now(timezone.utc).isoformat(),
            "last_seen_at": datetime.now(timezone.utc).isoformat(),
        })

    access = create_access_token(user_id, jti)
    refresh = create_refresh_token(user_id, jti)
    set_auth_cookies(response, access, refresh)

    await log_service.info("auth", f"Login success: {user['username']}", user_id=user_id, meta={"ip": ip})
    return {"user": svc.public_user(user), "trusted_device_token": trusted_device_id}


@router.post("/logout")
async def logout(request: Request, response: Response, user=Depends(get_current_user)):
    db = get_db()
    jti = user.get("_current_jti")
    if jti:
        await db.sessions.delete_one({"token_jti": jti})
    clear_auth_cookies(response)
    await log_service.info("auth", f"Logout: {user['username']}", user_id=str(user["_id"]))
    return {"ok": True}


@router.post("/logout-all")
async def logout_all(response: Response, user=Depends(get_current_user)):
    revoked = await svc.revoke_all_sessions(str(user["_id"]))
    clear_auth_cookies(response)
    await log_service.info("auth", f"Logout-all: {user['username']}", user_id=str(user["_id"]), meta={"revoked": revoked})
    return {"ok": True, "revoked": revoked}


@router.get("/me")
async def me(user=Depends(get_current_user)):
    return {"user": svc.public_user(user)}


@router.post("/refresh")
async def refresh_token(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if not token:
        raise AppError("AUTH_REQUIRED", status=401)
    payload = decode_token(token, "refresh")
    user_id = payload["sub"]
    jti = payload["jti"]
    db = get_db()
    session = await db.sessions.find_one({"token_jti": jti, "user_id": user_id})
    if not session:
        raise AppError("AUTH_EXPIRED", status=401)
    access = create_access_token(user_id, jti)
    new_refresh = create_refresh_token(user_id, jti)
    set_auth_cookies(response, access, new_refresh)
    return {"ok": True}


@router.post("/change-password")
async def change_password(body: ChangePasswordBody, user=Depends(get_current_user)):
    if not verify_password(body.current_password, user["password_hash"]):
        raise AppError("AUTH_INVALID", status=400, detail="Current password is incorrect")
    db = get_db()
    await db.users.update_one(
        {"_id": user["_id"]},
        {"$set": {"password_hash": hash_password(body.new_password)}},
    )
    await log_service.info("auth", "Password changed", user_id=str(user["_id"]))
    return {"ok": True}


@router.get("/sessions")
async def list_sessions(user=Depends(get_current_user)):
    db = get_db()
    cursor = db.sessions.find({"user_id": str(user["_id"])})
    out = []
    async for s in cursor:
        out.append({
            "id": str(s["_id"]),
            "device": s.get("device", {}),
            "created_at": s.get("created_at"),
            "last_seen_at": s.get("last_seen_at"),
            "is_current": s.get("token_jti") == user.get("_current_jti"),
        })
    return {"sessions": out}


@router.delete("/sessions/{session_id}")
async def revoke_session_ep(session_id: str, user=Depends(get_current_user)):
    ok = await svc.revoke_session(session_id, str(user["_id"]))
    if not ok:
        raise AppError("NOT_FOUND", status=404)
    return {"ok": True}


@router.get("/login-history")
async def login_history(user=Depends(get_current_user)):
    db = get_db()
    identifier = f"login:{user['username'].lower()}"
    cursor = db.login_attempts.find({"identifier": identifier}).sort("created_at_dt", -1).limit(50)
    out = []
    async for a in cursor:
        out.append({
            "identifier": a.get("identifier"),
            "success": a.get("success"),
            "created_at": a.get("created_at"),
        })
    return {"history": out}
