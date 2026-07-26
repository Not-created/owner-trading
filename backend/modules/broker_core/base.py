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
    required_credentials: list[str] = []

    @abstractmethod
    async def connect(self, credentials: dict[str, Any]) -> BrokerHealth: ...

    @abstractmethod
    async def disconnect(self, account_id: str) -> None: ...

    @abstractmethod
    async def health(self, account_id: str) -> BrokerHealth: ...

    def validate_credentials(self, credentials: dict[str, Any]) -> list[str]:
        missing = [k for k in self.required_credentials if not credentials.get(k)]
        return missing
