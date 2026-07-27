"""
User management — /api/users
Single-user platform; only self-profile is editable.
"""
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from core.database import get_db
from modules.auth.deps import get_current_user
from modules.auth.service import public_user

router = APIRouter(prefix="/api/users", tags=["users"])


class ProfileUpdate(BaseModel):
    display_name: str | None = None
    avatar_url: str | None = None
    recovery_email: str | None = None
    timezone: str | None = None
    language: str | None = None
    theme: str | None = None


@router.get("/me")
async def me(user=Depends(get_current_user)):
    return {"user": public_user(user)}


@router.patch("/me/profile")
async def update_profile(body: ProfileUpdate, user=Depends(get_current_user)):
    db = get_db()
    updates = {f"profile.{k}": v for k, v in body.model_dump(exclude_none=True).items()}
    if updates:
        await db.users.update_one({"_id": user["_id"]}, {"$set": updates})
    fresh = await db.users.find_one({"_id": user["_id"]})
    return {"user": public_user(fresh)}
