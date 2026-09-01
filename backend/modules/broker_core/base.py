"""
Universal Broker Core — abstract plugin base.
Future brokers implement this interface; no core code changes required.
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any


@dataclass
class BrokerHealth:
    ok: bool
    detail: str = ""
    latency_ms: int = 0


class BrokerPluginBase(ABC):
    plugin_id: str = ""
    display_name: str = ""
    version: str = "1.0.0"
    category: str = ""
    required_credentials: list[str] = []
    credential_labels: dict[str, str] = {}

    @abstractmethod
    async def connect(self, credentials: dict[str, Any]) -> BrokerHealth: ...

    @abstractmethod
    async def disconnect(self, account_id: str) -> None: ...

    @abstractmethod
    async def health(self, account_id: str) -> BrokerHealth: ...

    async def account_info(self, credentials: dict[str, Any]) -> dict[str, Any]:
        return {}

    def validate_credentials(self, credentials: dict[str, Any]) -> list[str]:
        missing = [k for k in self.required_credentials if not credentials.get(k)]
        return missing

    @property
    def supports_trading(self) -> bool:
        """Returns True if the broker plugin implements live/paper order execution."""
        return False

    async def place_order(self, credentials: dict[str, Any], order_params: dict[str, Any]) -> dict[str, Any]:
        """Submit a new order. To be implemented by trading-capable broker adapters in Phase 2."""
        raise NotImplementedError(f"{self.display_name or self.plugin_id} does not implement place_order.")

    async def modify_order(self, credentials: dict[str, Any], order_id: str, modify_params: dict[str, Any]) -> dict[str, Any]:
        """Modify a pending order. To be implemented by trading-capable broker adapters in Phase 2."""
        raise NotImplementedError(f"{self.display_name or self.plugin_id} does not implement modify_order.")

    async def cancel_order(self, credentials: dict[str, Any], order_id: str) -> dict[str, Any]:
        """Cancel an open order. To be implemented by trading-capable broker adapters in Phase 2."""
        raise NotImplementedError(f"{self.display_name or self.plugin_id} does not implement cancel_order.")

    async def get_positions(self, credentials: dict[str, Any]) -> list[dict[str, Any]]:
        """Fetch open positions. To be implemented by trading-capable broker adapters in Phase 2."""
        raise NotImplementedError(f"{self.display_name or self.plugin_id} does not implement get_positions.")

    async def get_orders(self, credentials: dict[str, Any], status: str | None = None) -> list[dict[str, Any]]:
        """Fetch historical or pending orders. To be implemented by trading-capable broker adapters in Phase 2."""
        raise NotImplementedError(f"{self.display_name or self.plugin_id} does not implement get_orders.")
