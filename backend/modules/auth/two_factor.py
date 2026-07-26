"""
Two-Factor Authentication (TOTP) — /api/auth/2fa
- Owner can enable/disable TOTP. Login accepts optional totp_code when enabled.
- Trusted devices skip TOTP for the device's refresh-token lifetime.
"""
import io
import base64
import secrets
import pyotp
import qrcode
from datetime import datetime, timezone
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from core.database import get_db
from core.security import get_encryption
from core.error_handling import AppError
from core.logging_service import log_service
from modules.auth.deps import get_current_user

router = APIRouter(prefix="/api/auth/2fa", tags=["auth-2fa"])


class VerifyBody(BaseModel):
    code: str = Field(min_length=6, max_length=8)


class TrustDeviceBody(BaseModel):
    label: str = Field(default="This device", max_length=64)


def _enc():
    return get_encryption()


@router.get("/status")
async def status(user=Depends(get_current_user)):
    db = get_db()
    doc = await db.two_factor.find_one({"user_id": str(user["_id"])})
    return {
        "enabled": user.get("two_factor_enabled", False),
        "pending_setup": bool(doc and not doc.get("confirmed", False)),
        "backup_codes_remaining": len(doc.get("backup_codes", [])) if doc else 0,
    }


@router.post("/setup")
async def setup(user=Depends(get_current_user)):
    """Generate a new TOTP secret + provisioning QR code. Must be confirmed via /verify."""
    if user.get("two_factor_enabled"):
        raise AppError("VALIDATION", status=400, detail="2FA is already enabled. Disable it first.")

    secret = pyotp.random_base32()
    issuer = "Terminal Pro"
    account = user["username"]
    uri = pyotp.totp.TOTP(secret).provisioning_uri(name=account, issuer_name=issuer)

    # Build QR PNG (base64)
    img = qrcode.make(uri)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    qr_b64 = base64.b64encode(buf.getvalue()).decode("ascii")

    db = get_db()
    await db.two_factor.update_one(
        {"user_id": str(user["_id"])},
        {"$set": {
            "user_id": str(user["_id"]),
            "secret_encrypted": _enc().encrypt(secret),
            "confirmed": False,
            "backup_codes": [],
            "created_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )
    return {"secret": secret, "otpauth_uri": uri, "qr_png_b64": qr_b64}


@router.post("/verify")
async def verify(body: VerifyBody, user=Depends(get_current_user)):
    """Confirm the setup code and enable 2FA. Returns 10 one-time backup codes."""
    db = get_db()
    doc = await db.two_factor.find_one({"user_id": str(user["_id"])})
    if not doc or doc.get("confirmed"):
        raise AppError("VALIDATION", status=400, detail="No pending 2FA setup")
    secret = _enc().decrypt(doc["secret_encrypted"])
    if not pyotp.TOTP(secret).verify(body.code, valid_window=1):
        raise AppError("AUTH_INVALID", status=400, detail="Invalid code")

    codes = [secrets.token_hex(4).upper() for _ in range(10)]
    # Store SHA of codes? For a single-owner platform we keep them encrypted so
    # the owner can view remaining codes after the fact.
    encrypted_codes = [_enc().encrypt(c) for c in codes]

    await db.two_factor.update_one(
        {"user_id": str(user["_id"])},
        {"$set": {"confirmed": True, "backup_codes": encrypted_codes}},
    )
    await db.users.update_one({"_id": user["_id"]}, {"$set": {"two_factor_enabled": True}})
    await log_service.info("auth", "2FA enabled", user_id=str(user["_id"]))
    return {"ok": True, "backup_codes": codes}


@router.post("/disable")
async def disable(body: VerifyBody, user=Depends(get_current_user)):
    """Require a valid TOTP code (or backup code) to disable."""
    db = get_db()
    doc = await db.two_factor.find_one({"user_id": str(user["_id"])})
    if not user.get("two_factor_enabled") or not doc:
        raise AppError("VALIDATION", status=400, detail="2FA is not enabled")
    secret = _enc().decrypt(doc["secret_encrypted"])
    valid = pyotp.TOTP(secret).verify(body.code, valid_window=1)
    if not valid:
        # Try backup codes
        for i, enc in enumerate(doc.get("backup_codes", [])):
            try:
                if _enc().decrypt(enc) == body.code.upper().strip():
                    valid = True
                    break
            except Exception:
                continue
    if not valid:
        raise AppError("AUTH_INVALID", status=400, detail="Invalid code")

    await db.two_factor.delete_one({"user_id": str(user["_id"])})
    await db.users.update_one({"_id": user["_id"]}, {"$set": {"two_factor_enabled": False}})
    await db.trusted_devices.delete_many({"user_id": str(user["_id"])})
    await log_service.warn("auth", "2FA disabled", user_id=str(user["_id"]))
    return {"ok": True}


@router.get("/trusted-devices")
async def list_trusted(user=Depends(get_current_user)):
    db = get_db()
    cursor = db.trusted_devices.find({"user_id": str(user["_id"])})
    out = []
    async for d in cursor:
        out.append({
            "device_id": d["device_id"],
            "label": d.get("label"),
            "user_agent": d.get("user_agent"),
            "trusted_at": d.get("trusted_at"),
            "last_seen_at": d.get("last_seen_at"),
        })
    return {"devices": out}


@router.delete("/trusted-devices/{device_id}")
async def revoke_trusted(device_id: str, user=Depends(get_current_user)):
    db = get_db()
    r = await db.trusted_devices.delete_one({"device_id": device_id, "user_id": str(user["_id"])})
    if r.deleted_count == 0:
        raise AppError("NOT_FOUND", status=404)
    return {"ok": True}


async def verify_totp_or_raise(user: dict, code: str | None) -> bool:
    """Called from the login flow when 2FA is enabled. Returns True if OK."""
    if not code:
        return False
    db = get_db()
    doc = await db.two_factor.find_one({"user_id": str(user["_id"])})
    if not doc:
        return False
    try:
        secret = _enc().decrypt(doc["secret_encrypted"])
    except Exception:
        return False
    if pyotp.TOTP(secret).verify(code, valid_window=1):
        return True
    # Check + consume a backup code
    remaining = []
    consumed = False
    for enc in doc.get("backup_codes", []):
        try:
            if _enc().decrypt(enc) == code.upper().strip() and not consumed:
                consumed = True
                continue
        except Exception:
            pass
        remaining.append(enc)
    if consumed:
        await db.two_factor.update_one({"user_id": str(user["_id"])}, {"$set": {"backup_codes": remaining}})
        return True
    return False
