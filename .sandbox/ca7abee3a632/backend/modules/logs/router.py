"""
Audit + Activity logs router — /api/logs
"""
from fastapi import APIRouter, Depends, Query
from core.database import get_db
from modules.auth.deps import get_current_user

router = APIRouter(prefix="/api/logs", tags=["logs"])


@router.get("")
async def list_logs(
    user=Depends(get_current_user),
    level: str | None = None,
    category: str | None = None,
    q: str | None = None,
    limit: int = Query(default=100, ge=1, le=500),
):
    db = get_db()
    query = {}
    if level:
        query["level"] = level
    if category:
        query["category"] = category
    if q:
        query["message"] = {"$regex": q, "$options": "i"}
    cursor = db.audit_logs.find(query).sort("created_at", -1).limit(limit)
    out = []
    async for doc in cursor:
        out.append({
            "id": str(doc["_id"]),
            "level": doc.get("level"),
            "category": doc.get("category"),
            "message": doc.get("message"),
            "user_id": doc.get("user_id"),
            "meta": doc.get("meta", {}),
            "created_at": doc.get("created_at"),
        })
    return {"logs": out}


@router.get("/categories")
async def categories(user=Depends(get_current_user)):
    from core.logging_service import CATEGORIES, LEVELS
    return {"categories": sorted(CATEGORIES), "levels": sorted(LEVELS)}
