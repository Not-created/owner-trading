"""
Approval workflow for AI Developer critical actions.
Every write/deploy/commit/delete must first become a pending Approval.
Only the Owner can approve. Nothing runs automatically.

This module ships the workflow interface + storage. Execution of approved
actions is intentionally NOT wired to filesystem/git/deploy in Part 1 — that
lands as a follow-up module. Approvals accumulate so the AI Developer can
propose changes and the Owner can review them.
"""
import uuid
from datetime import datetime, timezone
from typing import Literal

from core.database import get_db

ActionType = Literal[
    "write_file", "delete_file", "run_migration", "install_dependency",
    "git_commit", "git_push", "deploy", "replace_module", "run_command",
]

DANGEROUS_ACTIONS = {
    "git_push", "deploy", "delete_file", "replace_module", "run_command",
}


async def create_approval(
    *,
    user_id: str,
    action_type: ActionType,
    title: str,
    reason: str,
    payload: dict,
) -> dict:
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "approval_id": uuid.uuid4().hex,
        "user_id": user_id,
        "action_type": action_type,
        "title": title,
        "reason": reason,
        "payload": payload,
        "dangerous": action_type in DANGEROUS_ACTIONS,
        "status": "pending",
        "created_at": now,
        "decided_at": None,
        "decision_note": None,
    }
    await get_db().ai_approvals.insert_one(doc)
    return doc


async def list_approvals(user_id: str, status: str | None = None) -> list[dict]:
    db = get_db()
    q: dict = {"user_id": user_id}
    if status:
        q["status"] = status
    cursor = db.ai_approvals.find(q).sort("created_at", -1).limit(200)
    out = []
    async for d in cursor:
        d.pop("_id", None)
        out.append(d)
    return out


async def decide(user_id: str, approval_id: str, decision: str, note: str | None = None) -> dict:
    if decision not in ("approved", "rejected"):
        raise ValueError("decision must be approved|rejected")
    db = get_db()
    doc = await db.ai_approvals.find_one({"approval_id": approval_id, "user_id": user_id})
    if not doc:
        raise LookupError("Approval not found")
    if doc["status"] != "pending":
        raise ValueError(f"Approval already {doc['status']}")
    await db.ai_approvals.update_one(
        {"approval_id": approval_id},
        {"$set": {
            "status": decision,
            "decided_at": datetime.now(timezone.utc).isoformat(),
            "decision_note": note,
        }},
    )
    # NOTE: execution of approved actions is deliberately deferred.
    # An approved record simply becomes an audit trail the Owner reviews.
    return {**doc, "status": decision, "decision_note": note}
