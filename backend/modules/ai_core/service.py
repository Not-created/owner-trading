"""
AI Core Service — chat, health, usage tracking, failover.
"""
from datetime import datetime, timezone
from core.database import get_db
from core.logging_service import log_service
from core.error_handling import AppError
from modules.ai_core.registry import ai_registry
from modules.ai_core.base import ChatResult


async def get_default_config() -> dict:
    """Persisted user preference for default provider/model."""
    db = get_db()
    doc = await db.settings_store.find_one({"key": "ai_default"})
    if doc:
        return {"provider": doc["value"]["provider"], "model": doc["value"]["model"]}
    return {"provider": "openai", "model": "gpt-5.2"}


async def set_default_config(provider: str, model: str) -> None:
    p = ai_registry.get(provider)
    if not p:
        raise AppError("NOT_FOUND", status=404, detail="Unknown provider")
    if model not in p.available_models:
        raise AppError("VALIDATION", status=400, detail="Model not available for provider")
    db = get_db()
    await db.settings_store.update_one(
        {"key": "ai_default"},
        {"$set": {"key": "ai_default", "value": {"provider": provider, "model": model}}},
        upsert=True,
    )


async def _record_usage(user_id: str, res: ChatResult, ok: bool, error: str | None = None) -> None:
    db = get_db()
    await db.ai_usage.insert_one({
        "user_id": user_id,
        "provider": res.provider if res else None,
        "model": res.model if res else None,
        "latency_ms": res.latency_ms if res else None,
        "ok": ok,
        "error": error,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })


async def chat(prompt: str, *, provider_id: str, model: str, user_id: str, system: str = "You are a helpful trading assistant.") -> dict:
    provider = ai_registry.get(provider_id)
    if not provider:
        raise AppError("NOT_FOUND", status=404, detail="Provider not registered")
    session_id = f"{user_id}-{provider_id}"
    try:
        res = await provider.chat(prompt=prompt, model=model, system=system, session_id=session_id)
        await _record_usage(user_id, res, ok=True)
        await log_service.info("ai", f"chat ok: {provider_id}/{model}", user_id=user_id)
        return {"text": res.text, "provider": res.provider, "model": res.model, "latency_ms": res.latency_ms}
    except Exception as e:
        await log_service.error("ai", f"chat failed: {provider_id}/{model}: {e}", user_id=user_id)
        # try failover across other providers
        for other in ai_registry.all():
            if other.provider_id == provider_id:
                continue
            try:
                res = await other.chat(prompt=prompt, model=other.default_model, system=system, session_id=f"{user_id}-{other.provider_id}")
                await _record_usage(user_id, res, ok=True, error=f"failover from {provider_id}")
                await log_service.warn("ai", f"failover -> {other.provider_id}", user_id=user_id)
                return {"text": res.text, "provider": res.provider, "model": res.model, "latency_ms": res.latency_ms, "failover_from": provider_id}
            except Exception:
                continue
        raise AppError("PROVIDER_ERROR", status=502, detail="All AI providers failed")


async def health_check_all() -> list[dict]:
    results = []
    for p in ai_registry.all():
        res = await p.health_check()
        results.append({
            "provider": p.provider_id,
            "display_name": p.display_name,
            **res,
        })
    return results


async def list_providers() -> list[dict]:
    return [
        {
            "provider_id": p.provider_id,
            "display_name": p.display_name,
            "default_model": p.default_model,
            "available_models": p.available_models,
        }
        for p in ai_registry.all()
    ]


async def usage_summary(user_id: str) -> dict:
    db = get_db()
    total = await db.ai_usage.count_documents({"user_id": user_id})
    by_provider = {}
    async for doc in db.ai_usage.find({"user_id": user_id}):
        pid = doc.get("provider") or "unknown"
        by_provider.setdefault(pid, {"count": 0, "errors": 0})
        by_provider[pid]["count"] += 1
        if not doc.get("ok"):
            by_provider[pid]["errors"] += 1
    return {"total_requests": total, "by_provider": by_provider}
