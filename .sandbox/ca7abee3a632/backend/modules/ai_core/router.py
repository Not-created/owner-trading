"""
AI Core Router — /api/ai
"""
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from modules.auth.deps import get_current_user
from modules.ai_core import service as svc

router = APIRouter(prefix="/api/ai", tags=["ai"])


class ChatBody(BaseModel):
    prompt: str = Field(min_length=1, max_length=8000)
    provider: str | None = None
    model: str | None = None
    system: str = "You are a helpful trading assistant embedded in an enterprise AI trading platform."


@router.get("/providers")
async def providers(user=Depends(get_current_user)):
    provs = await svc.list_providers()
    default = await svc.get_default_config()
    return {"providers": provs, "default": default}


@router.post("/default")
async def set_default(body: dict, user=Depends(get_current_user)):
    await svc.set_default_config(body.get("provider", ""), body.get("model", ""))
    return {"ok": True}


@router.get("/health")
async def health(user=Depends(get_current_user)):
    return {"results": await svc.health_check_all()}


@router.post("/chat")
async def chat(body: ChatBody, user=Depends(get_current_user)):
    default = await svc.get_default_config()
    provider = body.provider or default["provider"]
    model = body.model or default["model"]
    return await svc.chat(
        body.prompt,
        provider_id=provider,
        model=model,
        user_id=str(user["_id"]),
        system=body.system,
    )


@router.get("/usage")
async def usage(user=Depends(get_current_user)):
    return await svc.usage_summary(str(user["_id"]))
