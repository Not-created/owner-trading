"""
MetaTrader 4 (MT4) broker adapter — real trading integration via REST bridge.
MT4 has no official Python API. This adapter targets a standard MT4 REST bridge
(community/open-source bridges such as https://github.com/khos2ow/rest-api or similar).
Docs: https://docs.mql4.com/
"""
import time
from typing import Any

import httpx

from modules.broker_core.base import BrokerPluginBase, BrokerHealth


class MT4BrokerPlugin(BrokerPluginBase):
    plugin_id = "mt4"
    display_name = "MetaTrader 4"
    version = "1.0.0"
    category = "forex"
    required_credentials = ["bridge_url", "api_key", "api_secret", "account", "password", "server"]
    credential_labels = {
        "bridge_url": "Bridge URL (e.g. http://localhost:8080)",
        "api_key": "Bridge API Key",
        "api_secret": "Bridge API Secret",
        "account": "MT4 Account Number",
        "password": "MT4 Password",
        "server": "Broker Server",
    }

    async def connect(self, credentials: dict) -> BrokerHealth:
        base = credentials.get("bridge_url", "").rstrip("/")
        if not base:
            return BrokerHealth(ok=False, detail="Missing bridge_url", latency_ms=0)
        start = time.perf_counter()
        try:
            headers = {
                "X-API-KEY": credentials["api_key"],
                "X-API-SECRET": credentials["api_secret"],
                "Content-Type": "application/json",
            }
            payload = {
                "account": credentials["account"],
                "password": credentials["password"],
                "server": credentials["server"],
            }
            async with httpx.AsyncClient(timeout=10.0) as c:
                r = await c.post(f"{base}/login", json=payload, headers=headers)
            latency = int((time.perf_counter() - start) * 1000)
            if r.status_code == 200:
                data = r.json()
                name = data.get("account_name") or data.get("name") or "MT4"
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
        base = credentials.get("bridge_url", "").rstrip("/")
        if not base:
            return {"error": "Missing bridge_url"}
        headers = {
            "X-API-KEY": credentials["api_key"],
            "X-API-SECRET": credentials["api_secret"],
            "Content-Type": "application/json",
        }
        try:
            async with httpx.AsyncClient(timeout=10.0) as c:
                r = await c.get(f"{base}/account", headers=headers)
            if r.status_code == 200:
                return r.json()
        except Exception:
            pass
        return {"error": "Failed to fetch account info from bridge"}
