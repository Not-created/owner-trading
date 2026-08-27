"""
MetaTrader 5 (MT5) broker adapter — real trading integration.
Requires the MetaTrader5 terminal installed and the `MetaTrader5` Python package.
Docs: https://www.metatrader5.com/en/metatrader5/api
"""
import time
from typing import Any

try:
    import MetaTrader5 as mt5  # type: ignore[import-untyped]
    HAS_MT5 = True
except ImportError:
    HAS_MT5 = False

from modules.broker_core.base import BrokerPluginBase, BrokerHealth


class MT5BrokerPlugin(BrokerPluginBase):
    plugin_id = "mt5"
    display_name = "MetaTrader 5"
    version = "1.0.0"
    category = "forex"
    required_credentials = ["login", "password", "server", "path"]
    credential_labels = {
        "login": "MT5 Account Number",
        "password": "MT5 Password",
        "server": "Broker Server",
        "path": "Terminal Path (optional)",
    }

    async def connect(self, credentials: dict) -> BrokerHealth:
        if not HAS_MT5:
            return BrokerHealth(ok=False, detail="MetaTrader5 package not installed. Install the MetaTrader5 Python package and terminal.", latency_ms=0)
        start = time.perf_counter()
        try:
            path = credentials.get("path") or ""
            if path:
                if not mt5.initialize(path=path, login=int(credentials["login"]), password=credentials["password"], server=credentials["server"]):
                    err = mt5.last_error()[1]
                    return BrokerHealth(ok=False, detail=f"MT5 init failed: {err}", latency_ms=0)
            else:
                if not mt5.initialize(login=int(credentials["login"]), password=credentials["password"], server=credentials["server"]):
                    err = mt5.last_error()[1]
                    return BrokerHealth(ok=False, detail=f"MT5 init failed: {err}", latency_ms=0)
            latency = int((time.perf_counter() - start) * 1000)
            info = mt5.account_info()
            if info is None:
                mt5.shutdown()
                return BrokerHealth(ok=False, detail="Failed to fetch account info", latency_ms=latency)
            name = getattr(info, "name", "") or getattr(info, "server", "MT5")
            mt5.shutdown()
            return BrokerHealth(ok=True, detail=f"Connected · {name}", latency_ms=latency)
        except Exception as e:
            try:
                mt5.shutdown()
            except Exception:
                pass
            return BrokerHealth(ok=False, detail=str(e)[:200], latency_ms=0)

    async def disconnect(self, account_id: str) -> None:
        if HAS_MT5:
            try:
                mt5.shutdown()
            except Exception:
                pass

    async def health(self, account_id: str) -> BrokerHealth:
        return BrokerHealth(ok=False, detail="Use /connect endpoint for health verification.", latency_ms=0)

    async def account_info(self, credentials: dict) -> dict[str, Any]:
        if not HAS_MT5:
            return {"error": "MetaTrader5 package not installed"}
        try:
            path = credentials.get("path") or ""
            if path:
                if not mt5.initialize(path=path, login=int(credentials["login"]), password=credentials["password"], server=credentials["server"]):
                    return {"error": mt5.last_error()[1]}
            else:
                if not mt5.initialize(login=int(credentials["login"]), password=credentials["password"], server=credentials["server"]):
                    return {"error": mt5.last_error()[1]}
            info = mt5.account_info()
            if info is None:
                mt5.shutdown()
                return {"error": "Failed to fetch account info"}
            out = {
                "login": info.login,
                "name": info.name,
                "server": info.server,
                "currency": info.currency,
                "balance": info.balance,
                "equity": info.equity,
                "margin": info.margin,
                "margin_free": info.margin_free,
                "profit": info.profit,
            }
            mt5.shutdown()
            return out
        except Exception as e:
            try:
                mt5.shutdown()
            except Exception:
                pass
            return {"error": str(e)[:200]}
