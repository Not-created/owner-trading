"""
Universal Market Data Core — final provider contract.

This module defines the stable, provider-independent market-data
interface used by the rest of OWNER-TRADING.

Design rules:
- Provider-specific API/SDK logic must remain inside provider adapters.
- Trading, order execution, broker credentials, and strategy logic do NOT
  belong in this module.
- Live market data and historical data use separate contracts.
- Consumers must depend on these normalized models/interfaces instead of
  provider-specific response formats.
- A provider may support only a subset of capabilities; unsupported
  operations must fail explicitly rather than returning fake data.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any


class MarketDataCapability(str, Enum):
    """Capabilities a market-data provider may expose."""

    QUOTES = "quotes"
    HISTORICAL = "historical"
    INTRADAY = "intraday"
    REALTIME = "realtime"
    WEBSOCKET = "websocket"


@dataclass(frozen=True)
class Quote:
    """
    Normalized latest-quote representation.

    Provider-specific response fields must be converted into this model
    before reaching the rest of the application.
    """

    symbol: str
    price: float
    change: float = 0.0
    change_percent: float = 0.0
    currency: str = "USD"
    name: str | None = None
    market: str | None = None

    bid: float | None = None
    ask: float | None = None
    volume: float | None = None
    timestamp: datetime | None = None

    provider: str | None = None
    raw: dict[str, Any] | None = field(
        default=None,
        repr=False,
        compare=False,
    )


@dataclass(frozen=True)
class OHLCVBar:
    """
    Normalized historical/intraday candle.

    `timestamp` represents the beginning of the candle in the provider's
    normalized timezone convention.
    """

    symbol: str
    timestamp: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float = 0.0
    interval: str | None = None
    currency: str | None = None
    provider: str | None = None


@dataclass(frozen=True)
class MarketDataHealth:
    """Normalized provider health information."""

    ok: bool
    detail: str = ""
    latency_ms: int = 0
    provider_id: str | None = None


class MarketDataProvider(ABC):
    """
    Stable universal interface for market-data providers.

    Provider adapters implement only the capabilities they actually
    support. The application must not depend on a specific provider's
    SDK or response structure.
    """

    provider_id: str = ""
    display_name: str = ""
    version: str = "1.0.0"
    category: str = ""
    capabilities: tuple[MarketDataCapability, ...] = (
        MarketDataCapability.QUOTES,
    )

    @abstractmethod
    async def quotes(
        self,
        symbols: list[str],
    ) -> list[Quote]:
        """
        Return normalized latest quotes for the requested symbols.

        Unknown/unavailable symbols may be omitted from the result.
        Providers must never manufacture market prices.
        """
        ...

    async def historical(
        self,
        symbol: str,
        *,
        start: datetime,
        end: datetime,
        interval: str,
    ) -> list[OHLCVBar]:
        """
        Return normalized historical OHLCV data.

        Providers that do not support historical data must fail explicitly.
        """
        raise NotImplementedError(
            f"{self.provider_id or 'Market data provider'} "
            "does not support historical data"
        )

    async def health(self) -> MarketDataHealth:
        """
        Return provider connectivity/health information.

        The default implementation performs no network request.
        Concrete providers may override it.
        """
        return MarketDataHealth(
            ok=True,
            detail="Provider initialized",
            latency_ms=0,
            provider_id=self.provider_id or None,
        )

    def supports(
        self,
        capability: MarketDataCapability,
    ) -> bool:
        """Return whether this provider declares a capability."""
        return capability in self.capabilities

    def validate_symbols(
        self,
        symbols: list[str],
    ) -> list[str]:
        """
        Normalize and validate a symbol collection.

        This performs only provider-independent normalization. Actual
        symbol/exchange validation belongs to the provider.
        """
        return [
            str(symbol).strip().upper()
            for symbol in symbols
            if str(symbol).strip()
    ]
