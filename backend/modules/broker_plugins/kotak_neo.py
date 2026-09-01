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
    supports_trading = True

    def _base_url(self) -> str:
        return "https://api.kotaksecurities.com"

    def _headers(self, token: str | None = None) -> dict[str, str]:
        headers = {"accept": "application/json", "Content-Type": "application/json"}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        return headers

    async def connect(self, credentials: dict) -> BrokerHealth:
        base = self._base_url()
        url = f"{base}/session/1.0/session/create"
        start = time.perf_counter()
        try:
            async with httpx.AsyncClient(timeout=10.0) as c:
                r = await c.post(
                    url,
                    json={
                        "api_key": credentials["api_key"],
                        "api_secret": credentials["api_secret"],
                        "mobileno": credentials["mobileno"],
                        "password": credentials["password"],
                        "mpin": credentials["mpin"],
                    },
                )
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
                r = await c.post(
                    f"{base}/session/1.0/session/create",
                    json={
                        "api_key": credentials["api_key"],
                        "api_secret": credentials["api_secret"],
                        "mobileno": credentials["mobileno"],
                        "password": credentials["password"],
                        "mpin": credentials["mpin"],
                    },
                )
            if r.status_code == 200:
                data = r.json()
                return data.get("token") or data.get("access_token")
        except Exception:
            pass
        return None

    async def _get_user_details(self, base: str, token: str) -> dict:
        try:
            async with httpx.AsyncClient(timeout=6.0) as c:
                r = await c.get(f"{base}/session/1.0/session/getUserDetails", headers=self._headers(token))
            if r.status_code == 200:
                return r.json()
        except Exception:
            pass
        return {}

    async def place_order(self, credentials: dict[str, Any], order_params: dict[str, Any]) -> dict[str, Any]:
        token = await self._auth(self._base_url(), credentials)
        if not token:
            raise ValueError("Kotak Neo authentication failed")
        payload = {
            "symbol": order_params.get("symbol"),
            "exchange": order_params.get("exchange"),
            "segment": "NSE",
            "product": (order_params.get("product") or "CNC").upper(),
            "side": (order_params.get("side") or "BUY").upper(),
            "quantity": int(order_params.get("quantity") or 0),
            "order_type": (order_params.get("order_type") or "LIMIT").upper(),
            "price": order_params.get("price"),
            "trigger_price": order_params.get("trigger_price"),
            "validity": (order_params.get("validity") or "DAY").upper(),
            "client_order_id": order_params.get("client_order_id"),
        }
        async with httpx.AsyncClient(timeout=12.0) as c:
            r = await c.post(f"{self._base_url()}/orders/1.0/order/create", headers=self._headers(token), json=payload)
        if r.status_code != 200:
            raise RuntimeError(f"Kotak order placement failed: HTTP {r.status_code} {r.text[:200]}")
        data = r.json()
        return {"order_id": data.get("order_id") or data.get("orderId") or order_params.get("client_order_id"), "status": (data.get("status") or "PENDING").upper(), "raw": data}

    async def modify_order(self, credentials: dict[str, Any], order_id: str, modify_params: dict[str, Any]) -> dict[str, Any]:
        token = await self._auth(self._base_url(), credentials)
        if not token:
            raise ValueError("Kotak Neo authentication failed")
        payload = {"order_id": order_id, **modify_params}
        async with httpx.AsyncClient(timeout=12.0) as c:
            r = await c.put(f"{self._base_url()}/orders/1.0/order/modify", headers=self._headers(token), json=payload)
        if r.status_code != 200:
            raise RuntimeError(f"Kotak order modify failed: HTTP {r.status_code} {r.text[:200]}")
        data = r.json()
        return {"order_id": order_id, "status": (data.get("status") or "PENDING").upper(), "raw": data}

    async def cancel_order(self, credentials: dict[str, Any], order_id: str) -> dict[str, Any]:
        token = await self._auth(self._base_url(), credentials)
        if not token:
            raise ValueError("Kotak Neo authentication failed")
        payload = {"order_id": order_id}
        async with httpx.AsyncClient(timeout=12.0) as c:
            r = await c.post(f"{self._base_url()}/orders/1.0/order/cancel", headers=self._headers(token), json=payload)
        if r.status_code != 200:
            raise RuntimeError(f"Kotak order cancel failed: HTTP {r.status_code} {r.text[:200]}")
        data = r.json()
        return {"order_id": order_id, "status": (data.get("status") or "CANCELLED").upper(), "raw": data}

    async def get_order_status(self, credentials: dict[str, Any], order_id: str) -> dict[str, Any]:
        token = await self._auth(self._base_url(), credentials)
        if not token:
            raise ValueError("Kotak Neo authentication failed")
        async with httpx.AsyncClient(timeout=12.0) as c:
            r = await c.get(f"{self._base_url()}/orders/1.0/order/{order_id}/status", headers=self._headers(token))
        if r.status_code != 200:
            raise RuntimeError(f"Kotak order status failed: HTTP {r.status_code} {r.text[:200]}")
        data = r.json()
        return {"order_id": order_id, "status": (data.get("status") or "PENDING").upper(), "raw": data}

    async def get_positions(self, credentials: dict[str, Any]) -> list[dict[str, Any]]:
        token = await self._auth(self._base_url(), credentials)
        if not token:
            raise ValueError("Kotak Neo authentication failed")
        async with httpx.AsyncClient(timeout=12.0) as c:
            r = await c.get(f"{self._base_url()}/portfolio/1.0/positions", headers=self._headers(token))
        if r.status_code != 200:
            raise RuntimeError(f"Kotak positions failed: HTTP {r.status_code} {r.text[:200]}")
        data = r.json()
        rows = data if isinstance(data, list) else data.get("positions") or data.get("data") or []
        return rows

    async def get_holdings(self, credentials: dict[str, Any]) -> list[dict[str, Any]]:
        token = await self._auth(self._base_url(), credentials)
        if not token:
            raise ValueError("Kotak Neo authentication failed")
        async with httpx.AsyncClient(timeout=12.0) as c:
            r = await c.get(f"{self._base_url()}/portfolio/1.0/holdings", headers=self._headers(token))
        if r.status_code != 200:
            raise RuntimeError(f"Kotak holdings failed: HTTP {r.status_code} {r.text[:200]}")
        data = r.json()
        rows = data if isinstance(data, list) else data.get("holdings") or data.get("data") or []
        return rows

    async def get_funds(self, credentials: dict[str, Any]) -> dict[str, Any]:
        token = await self._auth(self._base_url(), credentials)
        if not token:
            raise ValueError("Kotak Neo authentication failed")
        async with httpx.AsyncClient(timeout=12.0) as c:
            r = await c.get(f"{self._base_url()}/funds/1.0/summary", headers=self._headers(token))
        if r.status_code != 200:
            raise RuntimeError(f"Kotak funds failed: HTTP {r.status_code} {r.text[:200]}")
        data = r.json()
        return data if isinstance(data, dict) else {"raw": data}

    async def get_trade_history(self, credentials: dict[str, Any]) -> list[dict[str, Any]]:
        token = await self._auth(self._base_url(), credentials)
        if not token:
            raise ValueError("Kotak Neo authentication failed")
        async with httpx.AsyncClient(timeout=12.0) as c:
            r = await c.get(f"{self._base_url()}/orders/1.0/trade-history", headers=self._headers(token))
        if r.status_code != 200:
            raise RuntimeError(f"Kotak trade history failed: HTTP {r.status_code} {r.text[:200]}")
        data = r.json()
        rows = data if isinstance(data, list) else data.get("trades") or data.get("orders") or data.get("data") or []
        return rows
