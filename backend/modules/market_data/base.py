"""
Market Data provider abstraction — plugin-style, matches Universal architecture.
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional


@dataclass
class Quote:
    symbol: str
    price: float
    change: float
    change_percent: float
    currency: str = "USD"
    name: Optional[str] = None
    market: Optional[str] = None


class MarketDataProvider(ABC):
    provider_id: str = ""
    display_name: str = ""

    @abstractmethod
    async def quotes(self, symbols: list[str]) -> list[Quote]: ...
