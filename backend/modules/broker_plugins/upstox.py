"""
Upstox broker adapter — real trading integration.
API: https://api.upstox.com/v2
Docs: https://upstox.com/developer/api/v2/
"""
import time
from typing import Any

import httpx

from modules.broker_core.base import BrokerPluginBase, BrokerHealth


class UpstoxBrokerPlugin(BrokerPluginBase):
    plugin_id = "upstox"
    display_name = "Upstox"
    version = "1.0.0"
    category = "indian"
    required_credentials = ["access_token"]
    credential_labels = {
        "access_token": "Access Token (OAuth 2.0)",
    }

    def _base_url(self) -> str:
        return "https://api.upstox.com/v2"

    async def connect(self, credentials: dict) -> BrokerHealth:
        base = self._base_url()
        token = credentials.get("access_token", "").strip()
        if not token:
            return BrokerHealth(ok=False, detail="Missing access_token", latency_ms=0)
        start = time.perf_counter()
        try:
            headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}
            async with httpx.AsyncClient(timeout=10.0) as c:
                r = await c.get(f"{base}/user/profile", headers=headers)
            latency = int((time.perf_counter() - start) * 1000)
            if r.status_code == 200:
                data = r.json()
                name = data.get("data", {}).get("name") or "Upstox"
                return BrokerHealth(ok=True, detail=f"Connected · {name}", latency_ms=latency)
            text = r.text[:120]
            return BrokerHealth(ok=False, detail=f"HTTP {r.status_code}: {text}", latency_ms=latency)
        except Exception as e:
            return BrokerHealth(ok=False, detail=str(e)[:200], latency_ms=0)

    async def disconnect(self, account_id: str) -> None:
        return None

    async def health(self, account_id: str) -> BrokerHealth:
        return BrokerHealth(ok=False, detail="Use /connect endpoint for health verification.", latency_ms=0)

    async def account_info(self, credentials: dict) -> dict[str, Any]:
        token = credentials.get("access_token", "").strip()
        if not token:
            return {"error": "Missing access_token"}
        headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}
        try:
            async with httpx.AsyncClient(timeout=10.0) as c:
                r = await c.get(f"{self._base_url()}/user/profile", headers=headers)
            if r.status_code == 200:
                return r.json().get("data", {})
        except Exception:
            pass
        return {"error": "Failed to fetch profile"}
