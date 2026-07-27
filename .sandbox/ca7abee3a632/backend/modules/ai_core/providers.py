"""
Concrete AI provider plugins (OpenAI, Anthropic Claude, Google Gemini).
Uses emergentintegrations library + EMERGENT_LLM_KEY.
"""
import time
from emergentintegrations.llm.chat import LlmChat, UserMessage

from core.config import get_settings
from modules.ai_core.base import AIProviderBase, ChatResult


class _EmergentProvider(AIProviderBase):
    emergent_provider: str = ""

    async def chat(self, prompt: str, *, model: str, system: str, session_id: str) -> ChatResult:
        s = get_settings()
        chat = LlmChat(
            api_key=s.emergent_llm_key,
            session_id=session_id,
            system_message=system,
        ).with_model(self.emergent_provider, model)
        start = time.perf_counter()
        text = await chat.send_message(UserMessage(text=prompt))
        latency = int((time.perf_counter() - start) * 1000)
        return ChatResult(
            text=str(text),
            provider=self.provider_id,
            model=model,
            latency_ms=latency,
        )


class OpenAIProvider(_EmergentProvider):
    provider_id = "openai"
    display_name = "OpenAI"
    emergent_provider = "openai"
    default_model = "gpt-5.2"
    available_models = ["gpt-5.5", "gpt-5.4", "gpt-5.4-mini", "gpt-5.2", "gpt-5.1", "gpt-5", "gpt-4o", "gpt-4.1"]


class ClaudeProvider(_EmergentProvider):
    provider_id = "claude"
    display_name = "Anthropic Claude"
    emergent_provider = "anthropic"
    default_model = "claude-sonnet-4-5-20250929"
    available_models = ["claude-opus-4-8", "claude-opus-4-7", "claude-sonnet-4-6", "claude-sonnet-4-5-20250929", "claude-haiku-4-5-20251001"]


class GeminiProvider(_EmergentProvider):
    provider_id = "gemini"
    display_name = "Google Gemini"
    emergent_provider = "gemini"
    default_model = "gemini-3-flash-preview"
    available_models = ["gemini-3.5-flash", "gemini-3.1-pro-preview", "gemini-3-flash-preview", "gemini-2.5-pro", "gemini-2.5-flash"]
