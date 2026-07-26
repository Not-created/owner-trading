"""
AI Developer router — /api/dev
Owner-only endpoints. Read-only project inspection + AI-assisted planning.
Every write/deploy action goes through /api/dev/approvals (execution deferred).
"""
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field

from core.database import get_db
from core.error_handling import AppError
from modules.auth.deps import get_current_user
from modules.ai_developer import inspector, service as devsvc, approvals

router = APIRouter(prefix="/api/dev", tags=["ai-developer"])


def _require_owner(user: dict) -> None:
    if user.get("role") != "super_admin":
        raise AppError("PERMISSION_DENIED", status=403)


class AskBody(BaseModel):
    question: str = Field(min_length=1, max_length=6000)
    include_snapshot: bool = True


class ApprovalBody(BaseModel):
    action_type: str
    title: str = Field(min_length=1, max_length=200)
    reason: str = Field(max_length=1000, default="")
    payload: dict = Field(default_factory=dict)


class DecisionBody(BaseModel):
    decision: str = Field(pattern="^(approved|rejected)$")
    note: str | None = None


@router.get("/project-map")
async def project_map(user=Depends(get_current_user)):
    _require_owner(user)
    return inspector.project_map()


@router.get("/modules")
async def modules(user=Depends(get_current_user)):
    _require_owner(user)
    return {"modules": inspector.modules_inventory()}


@router.get("/dependencies")
async def dependencies(user=Depends(get_current_user)):
    _require_owner(user)
    return inspector.dependencies_report()


@router.get("/file")
async def read_file(path: str = Query(..., min_length=1), user=Depends(get_current_user)):
    _require_owner(user)
    try:
        return inspector.read_file(path)
    except FileNotFoundError:
        raise AppError("NOT_FOUND", status=404)
    except PermissionError as e:
        raise AppError("PERMISSION_DENIED", status=403, detail=str(e))
    except ValueError as e:
        raise AppError("VALIDATION", status=400, detail=str(e))


@router.get("/search")
async def search(q: str = Query(..., min_length=2), user=Depends(get_current_user)):
    _require_owner(user)
    return {"hits": inspector.search_code(q)}


@router.get("/snapshot")
async def snapshot(user=Depends(get_current_user)):
    _require_owner(user)
    return await devsvc.project_snapshot()


@router.get("/db-schema")
async def db_schema(user=Depends(get_current_user)):
    _require_owner(user)
    db = get_db()
    collections = await db.list_collection_names()
    out = []
    for c in collections:
        try:
            count = await db[c].count_documents({})
            sample = await db[c].find_one({})
            keys = sorted(sample.keys()) if sample else []
        except Exception:
            count, keys = -1, []
        # Strip mongo internals + secrets from sample keys
        keys = [k for k in keys if k not in {"_id", "password_hash", "secret_encrypted", "credentials_encrypted"}]
        out.append({"collection": c, "count": count, "sample_keys": keys})
    return {"collections": out}


@router.get("/health")
async def health_report(user=Depends(get_current_user)):
    _require_owner(user)
    db = get_db()
    users = await db.users.count_documents({})
    sessions = await db.sessions.count_documents({})
    errors_24h = await db.audit_logs.count_documents({"level": {"$in": ["error", "critical"]}})
    warnings_24h = await db.audit_logs.count_documents({"level": "warning"})
    plugins = await db.plugins.count_documents({})
    ai_requests = await db.ai_usage.count_documents({})
    return {
        "users": users,
        "active_sessions": sessions,
        "errors_recent": errors_24h,
        "warnings_recent": warnings_24h,
        "installed_plugins": plugins,
        "ai_requests_total": ai_requests,
    }


@router.post("/ask")
async def ask(body: AskBody, user=Depends(get_current_user)):
    _require_owner(user)
    return await devsvc.ask(str(user["_id"]), body.question, body.include_snapshot)


@router.get("/approvals")
async def list_approvals(status: str | None = None, user=Depends(get_current_user)):
    _require_owner(user)
    return {"approvals": await approvals.list_approvals(str(user["_id"]), status)}


@router.post("/approvals")
async def create_approval(body: ApprovalBody, user=Depends(get_current_user)):
    _require_owner(user)
    doc = await approvals.create_approval(
        user_id=str(user["_id"]),
        action_type=body.action_type,  # type: ignore[arg-type]
        title=body.title,
        reason=body.reason,
        payload=body.payload,
    )
    doc.pop("_id", None)
    return doc


@router.post("/approvals/{approval_id}/decide")
async def decide_approval(approval_id: str, body: DecisionBody, user=Depends(get_current_user)):
    _require_owner(user)
    try:
        doc = await approvals.decide(str(user["_id"]), approval_id, body.decision, body.note)
    except LookupError:
        raise AppError("NOT_FOUND", status=404)
    except ValueError as e:
        raise AppError("VALIDATION", status=400, detail=str(e))
    doc.pop("_id", None)
    return doc


@router.get("/capabilities")
async def capabilities(user=Depends(get_current_user)):
    _require_owner(user)
    return {
        "read": [
            "project_map", "read_file", "modules", "endpoints",
            "dependencies", "db_schema", "logs_analysis", "search_code",
        ],
        "reason": [
            "ask (uses default AI Core provider with project snapshot context)",
            "generate code proposals (returned as diffs, never executed)",
            "generate test plans", "generate documentation",
            "detect bugs", "suggest performance / security improvements",
            "generate database migration proposals",
            "prepare git commit messages", "prepare deployment plans",
        ],
        "gated_by_approval": [
            "write_file", "delete_file", "run_migration", "install_dependency",
            "git_commit", "git_push", "deploy", "replace_module", "run_command",
        ],
        "never_automatic": [
            "GitHub push", "Deployment", "File deletion", "Replacing major modules",
            "Executing dangerous shell commands",
        ],
        "note": "Every gated action must create an Approval record. Execution is Owner-controlled and deferred to a subsequent milestone.",
    }
