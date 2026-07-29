"""
AI Developer Core router extensions — /api/dev/*
Wires Intelligence, Memory, Runtime, Generator, Sandbox, Validator.
"""
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from core.error_handling import AppError
from modules.auth.deps import get_current_user
from modules.ai_developer import intelligence, memory, runtime, generator, sandbox, validator

router = APIRouter(prefix="/api/dev", tags=["ai-developer-core"])


def _require_owner(user: dict) -> None:
    if user.get("role") != "super_admin":
        raise AppError("PERMISSION_DENIED", status=403)


# ---------- Intelligence ----------

@router.get("/intelligence/architecture")
async def intel_arch(user=Depends(get_current_user)):
    _require_owner(user)
    return intelligence.architecture_summary()


@router.get("/intelligence/graph")
async def intel_graph(user=Depends(get_current_user)):
    _require_owner(user)
    return intelligence.knowledge_graph()


@router.get("/intelligence/duplicates")
async def intel_duplicates(user=Depends(get_current_user)):
    _require_owner(user)
    return intelligence.duplicate_report()


@router.get("/intelligence/missing")
async def intel_missing(user=Depends(get_current_user)):
    _require_owner(user)
    return intelligence.missing_features()


@router.get("/intelligence/security")
async def intel_security(user=Depends(get_current_user)):
    _require_owner(user)
    return intelligence.security_scan()


@router.get("/intelligence/performance")
async def intel_perf(user=Depends(get_current_user)):
    _require_owner(user)
    return intelligence.performance_hints()


@router.get("/intelligence/bugs")
async def intel_bugs(user=Depends(get_current_user)):
    _require_owner(user)
    return intelligence.bug_hints()


@router.get("/intelligence/full")
async def intel_full(user=Depends(get_current_user)):
    _require_owner(user)
    return intelligence.full_report()


# ---------- Memory ----------

class DecisionBody(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    context: str = Field(default="", max_length=4000)
    decision: str = Field(min_length=1, max_length=4000)
    consequences: str = Field(default="", max_length=4000)


class NoteBody(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    body: str = Field(min_length=1, max_length=8000)
    tags: list[str] = Field(default_factory=list)


class UpgradeBody(BaseModel):
    module_id: str
    from_version: str
    to_version: str
    summary: str
    task_id: str | None = None


@router.post("/memory/architecture-snapshot")
async def mem_snapshot(reason: str = "manual", user=Depends(get_current_user)):
    _require_owner(user)
    return await memory.snapshot_architecture(reason)


@router.get("/memory/architecture")
async def mem_arch(user=Depends(get_current_user)):
    _require_owner(user)
    return {"snapshots": await memory.list_architecture()}


@router.post("/memory/decisions")
async def mem_add_decision(body: DecisionBody, user=Depends(get_current_user)):
    _require_owner(user)
    return await memory.record_decision(
        user_id=str(user["_id"]),
        title=body.title, context=body.context,
        decision=body.decision, consequences=body.consequences,
    )


@router.get("/memory/decisions")
async def mem_decisions(user=Depends(get_current_user)):
    _require_owner(user)
    return {"decisions": await memory.list_decisions()}


@router.post("/memory/upgrades")
async def mem_add_upgrade(body: UpgradeBody, user=Depends(get_current_user)):
    _require_owner(user)
    return await memory.record_upgrade(
        module_id=body.module_id, from_version=body.from_version,
        to_version=body.to_version, summary=body.summary, task_id=body.task_id,
    )


@router.get("/memory/upgrades")
async def mem_upgrades(user=Depends(get_current_user)):
    _require_owner(user)
    return {"upgrades": await memory.list_upgrades()}


@router.post("/memory/notes")
async def mem_add_note(body: NoteBody, user=Depends(get_current_user)):
    _require_owner(user)
    return await memory.add_note(
        user_id=str(user["_id"]), title=body.title, body=body.body, tags=body.tags,
    )


@router.get("/memory/notes")
async def mem_notes(user=Depends(get_current_user)):
    _require_owner(user)
    return {"notes": await memory.list_notes()}


@router.get("/memory/context")
async def mem_context(user=Depends(get_current_user)):
    _require_owner(user)
    return await memory.memory_context()


# ---------- Runtime ----------

class TaskBody(BaseModel):
    kind: str = Field(pattern="^(analyze|ask|generate|sandbox|upgrade)$")
    payload: dict = Field(default_factory=dict)


@router.post("/tasks")
async def create_task(body: TaskBody, user=Depends(get_current_user)):
    _require_owner(user)
    try:
        return await runtime.create_task(user_id=str(user["_id"]), kind=body.kind, payload=body.payload)
    except ValueError as e:
        raise AppError("VALIDATION", status=400, detail=str(e))


@router.get("/tasks")
async def list_tasks(status: str | None = None, user=Depends(get_current_user)):
    _require_owner(user)
    return {"tasks": await runtime.list_tasks(str(user["_id"]), status=status)}


@router.get("/tasks/{task_id}")
async def get_task(task_id: str, user=Depends(get_current_user)):
    _require_owner(user)
    task = await runtime.get_task(str(user["_id"]), task_id)
    if not task:
        raise AppError("NOT_FOUND", status=404)
    return task


@router.delete("/tasks/{task_id}")
async def cancel_task(task_id: str, user=Depends(get_current_user)):
    _require_owner(user)
    ok = await runtime.cancel_task(str(user["_id"]), task_id)
    if not ok:
        raise AppError("VALIDATION", status=400, detail="Task not queued or not found")
    return {"ok": True}


# ---------- Direct proposal + sandbox (advanced) ----------

class GenerateBody(BaseModel):
    request: str = Field(min_length=1, max_length=8000)
    hint_paths: list[str] = Field(default_factory=list)


@router.post("/generate")
async def gen(body: GenerateBody, user=Depends(get_current_user)):
    _require_owner(user)
    return await generator.generate_proposal(str(user["_id"]), body.request, hint_paths=body.hint_paths)


class SandboxBody(BaseModel):
    files: dict[str, str]


@router.post("/sandbox/validate")
async def sb_validate(body: SandboxBody, user=Depends(get_current_user)):
    _require_owner(user)
    return sandbox.validate(body.files)


@router.delete("/sandbox/{sandbox_id}")
async def sb_cleanup(sandbox_id: str, user=Depends(get_current_user)):
    _require_owner(user)
    return {"ok": sandbox.cleanup(sandbox_id)}
