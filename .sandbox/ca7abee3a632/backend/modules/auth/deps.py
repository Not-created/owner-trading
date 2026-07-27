"""
JWT + cookie-based auth dependency.
"""
import uuid
from datetime import datetime, timezone, timedelta
from fastapi import Request, Response
import jwt

from core.config import get_settings
from core.error_handling import AppError
from modules.auth.service import find_user_by_id


def _now() -> datetime:
    return datetime.now(timezone.utc)


def create_access_token(user_id: str, jti: str) -> str:
    s = get_settings()
    payload = {
        "sub": user_id,
        "jti": jti,
        "type": "access",
        "exp": _now() + timedelta(minutes=s.access_token_ttl_min),
    }
    return jwt.encode(payload, s.jwt_secret, algorithm=s.jwt_algorithm)


def create_refresh_token(user_id: str, jti: str) -> str:
    s = get_settings()
    payload = {
        "sub": user_id,
        "jti": jti,
        "type": "refresh",
        "exp": _now() + timedelta(days=s.refresh_token_ttl_days),
    }
    return jwt.encode(payload, s.jwt_secret, algorithm=s.jwt_algorithm)


def decode_token(token: str, expected_type: str) -> dict:
    s = get_settings()
    try:
        payload = jwt.decode(token, s.jwt_secret, algorithms=[s.jwt_algorithm])
    except jwt.ExpiredSignatureError:
        raise AppError("AUTH_EXPIRED", status=401)
    except jwt.InvalidTokenError:
        raise AppError("AUTH_REQUIRED", status=401)
    if payload.get("type") != expected_type:
        raise AppError("AUTH_REQUIRED", status=401)
    return payload


def set_auth_cookies(response: Response, access: str, refresh: str) -> None:
    s = get_settings()
    response.set_cookie(
        "access_token", access,
        httponly=True, secure=True, samesite="none",
        max_age=s.access_token_ttl_min * 60, path="/",
    )
    response.set_cookie(
        "refresh_token", refresh,
        httponly=True, secure=True, samesite="none",
        max_age=s.refresh_token_ttl_days * 86400, path="/",
    )


def clear_auth_cookies(response: Response) -> None:
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise AppError("AUTH_REQUIRED", status=401)
    payload = decode_token(token, "access")
    user = await find_user_by_id(payload["sub"])
    if not user:
        raise AppError("AUTH_REQUIRED", status=401)
    user["_current_jti"] = payload.get("jti")
    return user


def generate_jti() -> str:
    return uuid.uuid4().hex
