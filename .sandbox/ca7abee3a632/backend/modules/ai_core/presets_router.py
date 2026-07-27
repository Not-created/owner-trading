"""
AI Prompt Presets — /api/ai/presets
Owner-defined command presets ("market recap", "risk audit", ...) that can be
executed with one click. Stored per-user in `ai_presets` collection.
"""
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from core.database import get_db
from core.error_handling import AppError
from modules.auth.deps import get_current_user

router = APIRouter(prefix="/api/ai/presets", tags=["ai-presets"])

# Seeded when a user has no presets yet.
STARTER_PRESETS = [
    {
        "name": "Market Recap",
        "category": "market",
        "prompt": "Give me a concise pre-open market recap for US equities: notable overnight moves, macro catalysts, sector leaders/laggards, and 3 things to watch today. Be terse and specific.",
    },
    {
        "name": "Risk Audit",
        "category": "risk",
        "prompt": "Act as a senior risk officer. I need a quick portfolio risk audit checklist covering: concentration, correlated exposure, leverage, options gamma, and event risk this week. Reply as a numbered list.",
    },
    {
        "name": "Earnings Preview",
        "category": "research",
        "prompt": "Draft an earnings preview template for a given stock: consensus EPS/revenue, key KPIs, options-implied move, prior quarter surprise, and 3 questions I should track on the call.",
    },
    {
        "name": "Idea Devil's Advocate",
        "category": "research",
        "prompt": "I will paste a trade thesis. Play devil's advocate: list the 5 strongest counter-arguments, the 3 pieces of evidence that would falsify the thesis, and the position size a disciplined trader would use given the disagreement.",
    },
    {
        "name": "Session Wrap",
        "category": "market",
        "prompt": "Give me a 6-bullet end-of-session wrap: index performance, breadth, volume, sector rotation, notable movers, and one paragraph on what tomorrow's setup looks like.",
    },
]


class PresetBody(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    prompt: str = Field(min_length=1, max_length=8000)
    category: str = Field(default="general", max_length=32)


async def _seed_if_empty(user_id: str) -> None:
    db = get_db()
    count = await db.ai_presets.count_documents({"user_id": user_id})
    if count > 0:
        return
    now = datetime.now(timezone.utc).isoformat()
    docs = [
        {
            "preset_id": uuid.uuid4().hex,
            "user_id": user_id,
            "name": p["name"],
            "prompt": p["prompt"],
            "category": p["category"],
            "system": True,
            "created_at": now,
        }
        for p in STARTER_PRESETS
    ]
    await db.ai_presets.insert_many(docs)


@router.get("")
async def list_presets(user=Depends(get_current_user)):
    user_id = str(user["_id"])
    await _seed_if_empty(user_id)
    db = get_db()
    cursor = db.ai_presets.find({"user_id": user_id}).sort("created_at", 1)
    out = []
    async for p in cursor:
        out.append({
            "preset_id": p["preset_id"],
            "name": p["name"],
            "prompt": p["prompt"],
            "category": p.get("category", "general"),
            "system": p.get("system", False),
            "created_at": p.get("created_at"),
        })
    return {"presets": out}


@router.post("")
async def create_preset(body: PresetBody, user=Depends(get_current_user)):
    db = get_db()
    doc = {
        "preset_id": uuid.uuid4().hex,
        "user_id": str(user["_id"]),
        "name": body.name,
        "prompt": body.prompt,
        "category": body.category,
        "system": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.ai_presets.insert_one(doc)
    return {"preset_id": doc["preset_id"]}


@router.put("/{preset_id}")
async def update_preset(preset_id: str, body: PresetBody, user=Depends(get_current_user)):
    db = get_db()
    r = await db.ai_presets.update_one(
        {"preset_id": preset_id, "user_id": str(user["_id"])},
        {"$set": {"name": body.name, "prompt": body.prompt, "category": body.category}},
    )
    if r.matched_count == 0:
        raise AppError("NOT_FOUND", status=404)
    return {"ok": True}


@router.delete("/{preset_id}")
async def delete_preset(preset_id: str, user=Depends(get_current_user)):
    db = get_db()
    r = await db.ai_presets.delete_one({"preset_id": preset_id, "user_id": str(user["_id"])})
    if r.deleted_count == 0:
        raise AppError("NOT_FOUND", status=404)
    return {"ok": True}
