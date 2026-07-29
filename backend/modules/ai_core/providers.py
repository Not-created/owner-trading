"""
Concrete AI provider plugins (OpenAI, Anthropic Claude, Google Gemini).
Uses official public SDKs and environment-specific API keys.
"""
import asyncio
import time
from typing import Any

import google.generativeai as genai
import httpx
import openai

from core.config import get_settings
from modules.ai_core.base import AIProviderBase, ChatResult


class _PublicAIProvider(AIProviderBase):
    provider_id: str = ""
    display_name: str = ""
    default_model: str = ""
    available_models: list[str] = []

    async def _placeholder_response(self, prompt: str, model: str, system: str) -> ChatResult:
        return ChatResult(
            text=(
                f"{self.display_name} is not configured. "
                "Set the correct API key environment variable to enable real AI responses."
            ),
            provider=self.provider_id,
            model=model,
            latency_ms=0,
        )

    async def chat(self, prompt: str, *, model: str, system: str, session_id: str) -> ChatResult:
        raise NotImplementedError

    async def health_check(self) -> dict:
        if not self.is_configured():
            return {
                "ok": False,
                "error": f"{self.display_name} API key is not configured",
                "provider": self.provider_id,
            }
        return await super().health_check()

    def is_configured(self) -> bool:
        return False

    @staticmethod
    def _safe_extract(response: Any, *fields: str) -> Any:
        result = response
        for field in fields:
            if isinstance(result, dict) and field in result:
                result = result[field]
            elif hasattr(result, field):
                result = getattr(result, field)
            else:
                return None
        return result


class OpenAIProvider(_PublicAIProvider):
    provider_id = "openai"
    display_name = "OpenAI"
    default_model = "gpt-5.2"
    available_models = ["gpt-5.5", "gpt-5.4", "gpt-5.4-mini", "gpt-5.2", "gpt-5.1", "gpt-5", "gpt-4o", "gpt-4.1"]

    def is_configured(self) -> bool:
        return bool(get_settings().openai_api_key)

    async def chat(self, prompt: str, *, model: str, system: str, session_id: str) -> ChatResult:
        s = get_settings()
        if not s.openai_api_key:
            return await self._placeholder_response(prompt, model, system)

        openai.api_key = s.openai_api_key
        messages = [
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ]
        start = time.perf_counter()
        try:
            response = await openai.ChatCompletion.acreate(model=model, messages=messages)
        except AttributeError:
            response = await asyncio.to_thread(openai.ChatCompletion.create, model=model, messages=messages)
        latency = int((time.perf_counter() - start) * 1000)
        text = self._safe_extract(response, "choices", 0, "message", "content") or ""
        return ChatResult(text=str(text), provider=self.provider_id, model=model, latency_ms=latency)


class ClaudeProvider(_PublicAIProvider):
    provider_id = "claude"
    display_name = "Anthropic Claude"
    default_model = "claude-sonnet-4-5-20250929"
    available_models = ["claude-opus-4-8", "claude-opus-4-7", "claude-sonnet-4-6", "claude-sonnet-4-5-20250929", "claude-haiku-4-5-20251001"]

    def is_configured(self) -> bool:
        return bool(get_settings().anthropic_api_key)

    async def chat(self, prompt: str, *, model: str, system: str, session_id: str) -> ChatResult:
        s = get_settings()
        if not s.anthropic_api_key:
            return await self._placeholder_response(prompt, model, system)

        url = "https://api.anthropic.com/v1/chat/completions"
        body = {
            "model": model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": prompt},
            ],
        }
        headers = {
            "Authorization": f"Bearer {s.anthropic_api_key}",
            "Content-Type": "application/json",
        }
        start = time.perf_counter()
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(url, json=body, headers=headers)
            response.raise_for_status()
            data = response.json()
        latency = int((time.perf_counter() - start) * 1000)
        text = self._safe_extract(data, "choices", 0, "message", "content") or ""
        return ChatResult(text=str(text), provider=self.provider_id, model=model, latency_ms=latency)


class GeminiProvider(_PublicAIProvider):
    provider_id = "gemini"
    display_name = "Google Gemini"
    default_model = "gemini-3-flash-preview"
    available_models = ["gemini-3.5-flash", "gemini-3.1-pro-preview", "gemini-3-flash-preview", "gemini-2.5-pro", "gemini-2.5-flash"]

    def is_configured(self) -> bool:
        return bool(get_settings().google_api_key)

    async def chat(self, prompt: str, *, model: str, system: str, session_id: str) -> ChatResult:
        s = get_settings()
        if not s.google_api_key:
            return await self._placeholder_response(prompt, model, system)

        genai.configure(api_key=s.google_api_key)
        messages = [
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ]
        start = time.perf_counter()
        try:
            response = await asyncio.to_thread(genai.ChatCompletion.create, model=model, messages=messages)
        except Exception:
            response = genai.ChatCompletion.create(model=model, messages=messages)
        latency = int((time.perf_counter() - start) * 1000)
        text = self._safe_extract(response, "candidates", 0, "content") or self._safe_extract(response, "last") or ""
        return ChatResult(text=str(text), provider=self.provider_id, model=model, latency_ms=latency)
