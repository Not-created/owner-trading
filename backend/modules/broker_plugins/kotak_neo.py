"""
Kotak Neo broker adapter — real trading integration.
API: https://api.kotaksecurities.com
Docs: https://neo.kotak.com/neo-mf/rest-api-documentation/
"""
import time
from typing import Any

import httpx

from modules.broker_core.base import BrokerPluginBase, BrokerHealth


class KotakNeoBrokerPlugin(BrokerPluginBase):
    plugin_id = "kotak_neo"
    display_name = "Kotak Neo"
    version = "1.0.0"
    category = "indian"
    required_credentials = ["api_key", "api_secret", "mobileno", "password", "mpin"]
    credential_labels = {
        "api_key": "API Key",
        "api_secret": "API Secret",
        "mobileno": "Mobile Number",
        "password": "Password",
        "mpin": "MPIN",
    }

    def _base_url(self) -> str:
        return "https://api.kotaksecurities.com"

    async def connect(self, credentials: dict) -> BrokerHealth:
        base = self._base_url()
        url = f"{base}/session/1.0/session/create"
        start = time.perf_counter()
        try:
            async with httpx.AsyncClient(timeout=10.0) as c:
                r = await c.post(url, json={
                    "api_key": credentials["api_key"],
                    "api_secret": credentials["api_secret"],
                    "mobileno": credentials["mobileno"],
                    "password": credentials["password"],
                    "mpin": credentials["mpin"],
                })
            latency = int((time.perf_counter() - start) * 1000)
            if r.status_code == 200:
                data = r.json()
                token = data.get("token") or data.get("access_token")
                if token:
                    info = await self._get_user_details(base, token)
                    name = info.get("name") or info.get("account_name") or "Kotak Neo"
                    return BrokerHealth(ok=True, detail=f"Connected · {name}", latency_ms=latency)
                return BrokerHealth(ok=False, detail="Invalid response: missing token", latency_ms=latency)
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
        token = await self._auth(base, credentials)
        if not token:
            return {"error": "Authentication failed"}
        return await self._get_user_details(base, token)

    async def _auth(self, base: str, credentials: dict) -> str | None:
        try:
            async with httpx.AsyncClient(timeout=10.0) as c:
                r = await c.post(f"{base}/session/1.0/session/create", json={
                    "api_key": credentials["api_key"],
                    "api_secret": credentials["api_secret"],
                    "mobileno": credentials["mobileno"],
                    "password": credentials["password"],
                    "mpin": credentials["mpin"],
                })
            if r.status_code == 200:
                data = r.json()
                return data.get("token") or data.get("access_token")
        except Exception:
            pass
        return None

    async def _get_user_details(self, base: str, token: str) -> dict:
        try:
            headers = {"Authorization": f"Bearer {token}", "accept": "application/json"}
            async with httpx.AsyncClient(timeout=6.0) as c:
                r = await c.get(f"{base}/session/1.0/session/getUserDetails", headers=headers)
            if r.status_code == 200:
                return r.json()
        except Exception:
            pass
        return {}
