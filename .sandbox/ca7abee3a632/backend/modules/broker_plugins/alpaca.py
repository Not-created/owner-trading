"""
Alpaca broker plugin — real trading integration (paper + live).
Implements BrokerPluginBase; registered with the Universal Broker Engine.
No changes to core code required.
"""
import time
import httpx

from modules.broker_core.base import BrokerPluginBase, BrokerHealth


class AlpacaBrokerPlugin(BrokerPluginBase):
    plugin_id = "alpaca"
    display_name = "Alpaca Markets"
    version = "1.0.0"
    required_credentials = ["api_key", "api_secret", "environment"]  # environment: paper|live

    def _base_url(self, env: str) -> str:
        return "https://paper-api.alpaca.markets" if env == "paper" else "https://api.alpaca.markets"

    def _headers(self, creds: dict) -> dict:
        return {
            "APCA-API-KEY-ID": creds["api_key"],
            "APCA-API-SECRET-KEY": creds["api_secret"],
            "Accept": "application/json",
        }

    async def connect(self, credentials: dict) -> BrokerHealth:
        env = (credentials.get("environment") or "paper").lower()
        url = f"{self._base_url(env)}/v2/account"
        start = time.perf_counter()
        try:
            async with httpx.AsyncClient(timeout=6.0) as c:
                r = await c.get(url, headers=self._headers(credentials))
            latency = int((time.perf_counter() - start) * 1000)
            if r.status_code == 200:
                acct = r.json()
                return BrokerHealth(
                    ok=True,
                    detail=f"{env} · account {acct.get('account_number', '?')} · status {acct.get('status', '?')}",
                    latency_ms=latency,
                )
            return BrokerHealth(ok=False, detail=f"HTTP {r.status_code}: {r.text[:120]}", latency_ms=latency)
        except Exception as e:
            return BrokerHealth(ok=False, detail=str(e)[:200], latency_ms=0)

    async def disconnect(self, account_id: str) -> None:
        # Alpaca REST is stateless — nothing to release. Kept for interface parity.
        return None

    async def health(self, account_id: str) -> BrokerHealth:
        # Reuse connect (both need creds); the service handles credentials lookup.
        return BrokerHealth(ok=False, detail="Use /connect endpoint for health verification.", latency_ms=0)
