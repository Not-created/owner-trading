"""
AI Runtime Engine.
Runs AI Developer tasks asynchronously. Each task has a lifecycle:

    queued -> running -> (validated | failed | completed)

Task kinds:
    analyze     : pure intelligence-engine reports
    ask         : AI Q&A with project + memory context (see service.ask)
    generate    : produce a change proposal (Safe Development Engine)
    sandbox     : validate a proposal in an isolated workspace
    upgrade     : shortcut for generate+sandbox for a target module

Only the Owner can enqueue tasks. No task ever writes to production files.
"""
import asyncio
import uuid
from datetime import datetime, timezone
from typing import Any

from core.database import get_db
from core.logging_service import log_service
from modules.ai_developer import (
    generator, intelligence, memory, sandbox, service as dev_service,
)


TASK_KINDS = {"analyze", "ask", "generate", "sandbox", "upgrade"}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def create_task(*, user_id: str, kind: str, payload: dict) -> dict:
    if kind not in TASK_KINDS:
        raise ValueError(f"Unknown task kind: {kind}")
    doc = {
        "task_id": uuid.uuid4().hex,
        "user_id": user_id,
        "kind": kind,
        "payload": payload,
        "status": "queued",
        "result": None,
        "error": None,
        "created_at": _now(),
        "updated_at": _now(),
    }
    await get_db().dev_tasks.insert_one(doc)
    # Fire and forget — execution happens in background asyncio task.
    asyncio.create_task(_execute(doc["task_id"]))
    doc.pop("_id", None)
    return doc


async def _set_status(task_id: str, status: str, *, result: Any = None, error: str | None = None) -> None:
    update = {"status": status, "updated_at": _now()}
    if result is not None:
        update["result"] = result
    if error is not None:
        update["error"] = error
    await get_db().dev_tasks.update_one({"task_id": task_id}, {"$set": update})


async def _execute(task_id: str) -> None:
    db = get_db()
    task = await db.dev_tasks.find_one({"task_id": task_id})
    if not task:
        return
    await _set_status(task_id, "running")
    try:
        result = await _run(task)
        await _set_status(task_id, "completed", result=result)
        await log_service.info("ai", f"Dev task completed: {task['kind']}", user_id=task["user_id"])
    except Exception as e:
        await _set_status(task_id, "failed", error=str(e)[:2000])
        await log_service.error("ai", f"Dev task failed: {task['kind']}: {e}", user_id=task["user_id"])


async def _run(task: dict) -> dict:
    kind = task["kind"]
    payload = task.get("payload") or {}
    user_id = task["user_id"]

    if kind == "analyze":
        return intelligence.full_report()

    if kind == "ask":
        question = payload.get("question", "").strip()
        include_snapshot = bool(payload.get("include_snapshot", True))
        return await dev_service.ask(user_id, question, include_snapshot)

    if kind == "generate":
        req = payload.get("request", "").strip()
        hints = payload.get("hint_paths") or []
        return await generator.generate_proposal(user_id, req, hint_paths=hints)

    if kind == "sandbox":
        files = payload.get("files") or {}
        if not isinstance(files, dict) or not files:
            raise ValueError("payload.files (path->content) required")
        return sandbox.validate(files)

    if kind == "upgrade":
        module_id = payload.get("module_id", "").strip()
        instructions = payload.get("instructions", "").strip()
        if not module_id:
            raise ValueError("payload.module_id required")
        hints = [f"backend/modules/{module_id}/"]
        request = f"Upgrade module '{module_id}'. Instructions: {instructions or 'improve robustness while preserving all existing endpoints.'}"
        proposal = await generator.generate_proposal(user_id, request, hint_paths=hints)
        files = {f["path"]: f.get("content", "")
                 for f in proposal.get("files", [])
                 if f.get("action", "write") == "write" and f.get("path")}
        validation = sandbox.validate(files) if files else {"validation": {"ok": False, "checks": []}, "sandbox_id": None}
        return {"proposal": proposal, "validation": validation}

    raise ValueError(f"Unhandled task kind: {kind}")


async def list_tasks(user_id: str, limit: int = 100, status: str | None = None) -> list[dict]:
    db = get_db()
    q: dict = {"user_id": user_id}
    if status:
        q["status"] = status
    out = []
    async for d in db.dev_tasks.find(q).sort("created_at", -1).limit(limit):
        d.pop("_id", None)
        out.append(d)
    return out


async def get_task(user_id: str, task_id: str) -> dict | None:
    doc = await get_db().dev_tasks.find_one({"task_id": task_id, "user_id": user_id})
    if not doc:
        return None
    doc.pop("_id", None)
    return doc


async def cancel_task(user_id: str, task_id: str) -> bool:
    """Marks a queued task cancelled. Running tasks cannot be interrupted here."""
    db = get_db()
    r = await db.dev_tasks.update_one(
        {"task_id": task_id, "user_id": user_id, "status": "queued"},
        {"$set": {"status": "cancelled", "updated_at": _now()}},
    )
    return r.modified_count > 0
