"""
Project Memory — persistent long-term memory for the AI Developer.
Collections:
  dev_architecture   : point-in-time architecture snapshots
  dev_decisions      : owner-approved decisions (ADR-style)
  dev_upgrades       : upgrade history (module, version, summary, task_id)
  dev_notes          : free-form notes surfaced to future AI runs
"""
import uuid
from datetime import datetime, timezone
from typing import Any

from core.database import get_db
from modules.ai_developer.intelligence import architecture_summary, module_graph, knowledge_graph


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def snapshot_architecture(reason: str = "") -> dict:
    doc = {
        "snapshot_id": uuid.uuid4().hex,
        "reason": reason,
        "architecture": architecture_summary(),
        "module_graph": module_graph(),
        "knowledge_graph": knowledge_graph(),
        "created_at": _now(),
    }
    await get_db().dev_architecture.insert_one(doc)
    doc.pop("_id", None)
    return doc


async def list_architecture(limit: int = 20) -> list[dict]:
    db = get_db()
    out = []
    async for d in db.dev_architecture.find({}).sort("created_at", -1).limit(limit):
        d.pop("_id", None)
        out.append(d)
    return out


async def record_decision(*, user_id: str, title: str, context: str, decision: str, consequences: str = "") -> dict:
    doc = {
        "decision_id": uuid.uuid4().hex,
        "user_id": user_id,
        "title": title,
        "context": context,
        "decision": decision,
        "consequences": consequences,
        "created_at": _now(),
    }
    await get_db().dev_decisions.insert_one(doc)
    doc.pop("_id", None)
    return doc


async def list_decisions(limit: int = 50) -> list[dict]:
    db = get_db()
    out = []
    async for d in db.dev_decisions.find({}).sort("created_at", -1).limit(limit):
        d.pop("_id", None)
        out.append(d)
    return out


async def record_upgrade(*, module_id: str, from_version: str, to_version: str, summary: str, task_id: str | None = None) -> dict:
    doc = {
        "upgrade_id": uuid.uuid4().hex,
        "module_id": module_id,
        "from_version": from_version,
        "to_version": to_version,
        "summary": summary,
        "task_id": task_id,
        "created_at": _now(),
    }
    await get_db().dev_upgrades.insert_one(doc)
    doc.pop("_id", None)
    return doc


async def list_upgrades(limit: int = 100) -> list[dict]:
    db = get_db()
    out = []
    async for d in db.dev_upgrades.find({}).sort("created_at", -1).limit(limit):
        d.pop("_id", None)
        out.append(d)
    return out


async def add_note(*, user_id: str, title: str, body: str, tags: list[str] | None = None) -> dict:
    doc = {
        "note_id": uuid.uuid4().hex,
        "user_id": user_id,
        "title": title,
        "body": body,
        "tags": tags or [],
        "created_at": _now(),
    }
    await get_db().dev_notes.insert_one(doc)
    doc.pop("_id", None)
    return doc


async def list_notes(limit: int = 100) -> list[dict]:
    db = get_db()
    out = []
    async for d in db.dev_notes.find({}).sort("created_at", -1).limit(limit):
        d.pop("_id", None)
        out.append(d)
    return out


async def memory_context(max_items: int = 8) -> dict[str, Any]:
    """Compact memory snippet injected into every AI Developer prompt."""
    db = get_db()
    latest_arch = await db.dev_architecture.find_one({}, sort=[("created_at", -1)])
    decisions = []
    async for d in db.dev_decisions.find({}).sort("created_at", -1).limit(max_items):
        decisions.append({"title": d["title"], "decision": d["decision"], "date": d.get("created_at")})
    upgrades = []
    async for u in db.dev_upgrades.find({}).sort("created_at", -1).limit(max_items):
        upgrades.append({"module": u["module_id"], "to": u["to_version"], "summary": u["summary"]})
    notes = []
    async for n in db.dev_notes.find({}).sort("created_at", -1).limit(max_items):
        notes.append({"title": n["title"], "body": n["body"][:400]})
    return {
        "latest_architecture_at": (latest_arch or {}).get("created_at"),
        "recent_decisions": decisions,
        "recent_upgrades": upgrades,
        "notes": notes,
    }
