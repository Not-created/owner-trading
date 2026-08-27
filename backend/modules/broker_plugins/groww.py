"""
Groww broker adapter — real trading integration.
API: https://groww.in/ (limited public API; full API for partners)
Docs: https://groww.in/terms-and-conditions/api
"""
import time
from typing import Any

import httpx

from modules.broker_core.base import BrokerPluginBase, BrokerHealth


class GrowwBrokerPlugin(BrokerPluginBase):
    plugin_id = "groww"
    display_name = "Groww"
    version = "1.0.0"
    category = "indian"
    required_credentials = ["api_key", "api_secret"]
    credential_labels = {
        "api_key": "API Key",
        "api_secret": "API Secret",
    }

    def _base_url(self) -> str:
        return "https://api.groww.in"

    async def connect(self, credentials: dict) -> BrokerHealth:
        base = self._base_url()
        start = time.perf_counter()
        try:
            headers = {
                "Authorization": f"Basic {credentials['api_key']}:{credentials['api_secret']}",
                "Content-Type": "application/json",
            }
            async with httpx.AsyncClient(timeout=10.0) as c:
                r = await c.get(f"{base}/v1/user/profile", headers=headers)
            latency = int((time.perf_counter() - start) * 1000)
            if r.status_code == 200:
                data = r.json()
                name = data.get("name") or data.get("data", {}).get("name") or "Groww"
                return BrokerHealth(ok=True, detail=f"Connected · {name}", latency_ms=latency)
            if r.status_code == 404:
                return BrokerHealth(ok=False, detail="Endpoint not available (partner API required)", latency_ms=latency)
            text = r.text[:120]
            return BrokerHealth(ok=False, detail=f"HTTP {r.status_code}: {text}", latency_ms=latency)
        except Exception as e:
            return BrokerHealth(ok=False, detail=str(e)[:200], latency_ms=0)

    async def disconnect(self, account_id: str) -> None:
        return None

    async def health(self, account_id: str) -> BrokerHealth:
        return BrokerHealth(ok=False, detail="Use /connect endpoint for health verification.", latency_ms=0)

    async def account_info(self, credentials: dict) -> dict[str, Any]:
        base = self._base_url()
        headers = {
            "Authorization": f"Basic {credentials['api_key']}:{credentials['api_secret']}",
            "Content-Type": "application/json",
        }
        try:
            async with httpx.AsyncClient(timeout=10.0) as c:
                r = await c.get(f"{base}/v1/user/profile", headers=headers)
            if r.status_code == 200:
                return r.json()
        except Exception:
            pass
        return {"error": "Failed to fetch profile"}
