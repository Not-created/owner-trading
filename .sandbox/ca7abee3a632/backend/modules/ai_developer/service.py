"""
AI Developer service — builds context and asks the AI Core.
"""
from core.database import get_db
from modules.ai_core.service import chat, get_default_config
from modules.ai_developer.inspector import modules_inventory, project_map, dependencies_report


AI_DEV_SYSTEM = """You are the AI Developer inside the Terminal/Pro enterprise trading platform.

Your job: help the Platform Owner understand, extend, upgrade and safely modify
this project. You have read-only access to project metadata (module list, endpoint
list, dependency snapshot, DB collection stats, recent logs) which is injected
below when relevant.

STRICT RULES:
1. Never claim you have executed any action. Everything you produce is a *proposal*.
2. Every code change must be returned as a fenced diff or full file block. Never
   pretend to write the file yourself.
3. For dangerous operations (git push, deploy, delete file, run shell command,
   replace module) explicitly tell the Owner that this requires an explicit
   Approval record — describe the exact action, the risks, and how to roll back.
4. Prefer minimal, surgical patches over wholesale rewrites.
5. Follow existing architecture: clean modules, dependency injection, no globals,
   no hardcoded secrets, /api prefix on backend routes, React + Tailwind + shadcn
   on frontend. Use JetBrains Mono for data, IBM Plex Sans for body, Space Grotesk
   for headings. Match the Bloomberg-terminal dark aesthetic.
6. If information is missing, list exactly which files or metrics you need — do
   not fabricate.
7. Output structure for change proposals:
     Summary → Impacted files → Proposed diff → Test plan → Rollback plan → Approval type.
"""


async def project_snapshot() -> dict:
    """Compact snapshot the AI can reason over."""
    db = get_db()
    collections = await db.list_collection_names()
    counts = {}
    for c in collections:
        try:
            counts[c] = await db[c].count_documents({})
        except Exception:
            counts[c] = -1

    # Recent error/warn logs
    recent_issues = []
    async for l in db.audit_logs.find({"level": {"$in": ["error", "warning", "critical"]}}).sort("created_at", -1).limit(20):
        recent_issues.append({
            "created_at": l.get("created_at"),
            "level": l.get("level"),
            "category": l.get("category"),
            "message": l.get("message"),
        })

    return {
        "modules": modules_inventory(),
        "dependencies": dependencies_report(),
        "database": {"collections": collections, "counts": counts},
        "recent_issues": recent_issues,
    }


async def ask(user_id: str, question: str, include_snapshot: bool = True) -> dict:
    from modules.ai_developer import memory as devmem
    default = await get_default_config()
    system = AI_DEV_SYSTEM
    prompt = question
    if include_snapshot:
        snap = await project_snapshot()
        mem = await devmem.memory_context()
        import json
        ctx = json.dumps({"snapshot": snap, "memory": mem}, default=str)
        if len(ctx) > 18000:
            ctx = ctx[:18000] + "...[truncated]"
        prompt = f"# Project snapshot + memory\n{ctx}\n\n# Owner question\n{question}"
    result = await chat(
        prompt=prompt,
        provider_id=default["provider"],
        model=default["model"],
        user_id=user_id,
        system=system,
    )
    return result
