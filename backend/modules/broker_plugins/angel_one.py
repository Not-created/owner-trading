"""
Angel One broker adapter — real trading integration.
API: https://apiconnect.angelbroking.com
Docs: https://smartapi.angelbroking.com/docs/
"""
import time
from typing import Any

import httpx

from modules.broker_core.base import BrokerPluginBase, BrokerHealth


class AngelOneBrokerPlugin(BrokerPluginBase):
    plugin_id = "angel_one"
    display_name = "Angel One"
    version = "1.0.0"
    category = "indian"
    required_credentials = ["api_key", "client_id", "password", "totp"]
    credential_labels = {
        "api_key": "API Key",
        "client_id": "Client ID",
        "password": "Password",
        "totp": "TOTP (current 6-digit code)",
    }

    def _base_url(self) -> str:
        return "https://apiconnect.angelbroking.com"

    async def connect(self, credentials: dict) -> BrokerHealth:
        base = self._base_url()
        url = f"{base}/rest/auth/angelbroking/user/v1/loginByPassword"
        start = time.perf_counter()
        try:
            async with httpx.AsyncClient(timeout=10.0) as c:
                r = await c.post(url, json={
                    "api_key": credentials["api_key"],
                    "client_id": credentials["client_id"],
                    "password": credentials["password"],
                    "otp": credentials["totp"],
                })
            latency = int((time.perf_counter() - start) * 1000)
            if r.status_code == 200:
                data = r.json()
                if data.get("status") is True and data.get("data", {}).get("jwt_token"):
                    info = await self._profile(base, data["data"]["jwt_token"])
                    name = info.get("data", {}).get("name") or "Angel One"
                    return BrokerHealth(ok=True, detail=f"Connected · {name}", latency_ms=latency)
                return BrokerHealth(ok=False, detail=str(data.get("message", "Login failed"))[:120], latency_ms=latency)
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
        return await self._profile(base, token)

    async def _auth(self, base: str, credentials: dict) -> str | None:
        try:
            async with httpx.AsyncClient(timeout=10.0) as c:
                r = await c.post(f"{base}/rest/auth/angelbroking/user/v1/loginByPassword", json={
                    "api_key": credentials["api_key"],
                    "client_id": credentials["client_id"],
                    "password": credentials["password"],
                    "otp": credentials["totp"],
                })
            if r.status_code == 200:
                data = r.json()
                if data.get("status") is True:
                    return data.get("data", {}).get("jwt_token")
        except Exception:
            pass
        return None

    async def _profile(self, base: str, token: str) -> dict:
        try:
            headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
            async with httpx.AsyncClient(timeout=6.0) as c:
                r = await c.get(f"{base}/rest/secure/angelbroking/user/v1/getProfile", headers=headers)
            if r.status_code == 200:
                return r.json()
        except Exception:
            pass
        return {}
