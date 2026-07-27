"""
AI Provider registry — plugin architecture.
New providers register themselves without changing existing code.
"""
from typing import Iterable
from modules.ai_core.base import AIProviderBase
from modules.ai_core.providers import OpenAIProvider, ClaudeProvider, GeminiProvider


class ProviderRegistry:
    def __init__(self) -> None:
        self._providers: dict[str, AIProviderBase] = {}

    def register(self, provider: AIProviderBase) -> None:
        self._providers[provider.provider_id] = provider

    def unregister(self, provider_id: str) -> None:
        self._providers.pop(provider_id, None)

    def get(self, provider_id: str) -> AIProviderBase | None:
        return self._providers.get(provider_id)

    def all(self) -> Iterable[AIProviderBase]:
        return list(self._providers.values())


ai_registry = ProviderRegistry()

# Bootstrap default providers (each is fully replaceable)
ai_registry.register(OpenAIProvider())
ai_registry.register(ClaudeProvider())
ai_registry.register(GeminiProvider())
