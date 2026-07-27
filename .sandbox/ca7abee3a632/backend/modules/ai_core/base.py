"""
Universal AI Core — abstract base for AI providers.
Every provider is a plugin implementing this interface.
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional


@dataclass
class ChatResult:
    text: str
    provider: str
    model: str
    latency_ms: int
    tokens_in: Optional[int] = None
    tokens_out: Optional[int] = None


class AIProviderBase(ABC):
    provider_id: str = ""
    display_name: str = ""
    default_model: str = ""
    available_models: list[str] = []

    @abstractmethod
    async def chat(self, prompt: str, *, model: str, system: str, session_id: str) -> ChatResult:
        ...

    async def health_check(self) -> dict:
        try:
            res = await self.chat(
                prompt="ping",
                model=self.default_model,
                system="Respond with the single word: pong",
                session_id=f"healthcheck-{self.provider_id}",
            )
            return {"ok": True, "latency_ms": res.latency_ms, "provider": self.provider_id}
        except Exception as e:
            return {"ok": False, "error": str(e)[:200], "provider": self.provider_id}
