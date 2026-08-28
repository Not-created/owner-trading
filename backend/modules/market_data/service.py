"""
Market Data Registry + Service — final application-facing market-data layer.

Architecture:

    Provider Adapter
          ↓
    MarketDataProvider contract
          ↓
    MarketDataRegistry
          ↓
    Market Data Service
          ↓
    Dashboard / Strategy / Backtest / Trading / AI

Rules:
- Application code must use this service instead of directly importing
  provider-specific implementations.
- Provider-specific API/SDK logic remains inside providers.py.
- No broker execution logic belongs here.
- No fake or synthetic market data is generated.
- Unsupported provider capabilities fail explicitly.
- Only one active market-data provider is used for normal application
  requests.
- Provider registration is idempotent.
"""

from __future__ import annotations

from datetime import datetime
from typing import Iterable

from modules.market_data.base import (
    MarketDataCapability,
    MarketDataHealth,
    MarketDataProvider,
    OHLCVBar,
    Quote,
)
from modules.market_data.providers import YahooFinanceProvider


class MarketDataRegistry:
    """
    Registry for normalized market-data providers.

    The registry owns provider instances and controls which provider is
    active for normal service requests.
    """

    def __init__(self) -> None:
        self._providers: dict[str, MarketDataProvider] = {}
        self._active: str | None = None

    def register(
        self,
        provider: MarketDataProvider,
        *,
        activate: bool = False,
    ) -> None:
        """
        Register or replace a provider by its stable provider_id.

        Re-registering the same provider_id does not create duplicate
        registry entries.
        """
        provider_id = str(
            provider.provider_id
        ).strip()

        if not provider_id:
            raise ValueError(
                "Market-data provider_id cannot be empty"
            )

        self._providers[provider_id] = provider

        if activate or self._active is None:
            self._active = provider_id

    def unregister(
        self,
        provider_id: str,
    ) -> None:
        """
        Remove a provider from the registry.

        If the removed provider was active, the registry selects another
        registered provider deterministically, if one exists.
        """
        provider_id = str(
            provider_id
        ).strip()

        self._providers.pop(
            provider_id,
            None,
        )

        if self._active == provider_id:
            self._active = (
                next(
                    iter(self._providers),
                    None,
                )
            )

    def get(
        self,
        provider_id: str,
    ) -> MarketDataProvider | None:
        """Return a registered provider by ID."""
        return self._providers.get(
            str(provider_id).strip()
        )

    def all(self) -> list[MarketDataProvider]:
        """Return all registered providers."""
        return list(
            self._providers.values()
        )

    def active(self) -> MarketDataProvider:
        """
        Return the currently active provider.

        Raises RuntimeError instead of silently selecting an unexpected
        provider when no provider is available.
        """
        if not self._active:
            raise RuntimeError(
                "No market data provider registered"
            )

        provider = self._providers.get(
            self._active
        )

        if provider is None:
            raise RuntimeError(
                "Active market data provider is unavailable"
            )

        return provider

    def active_id(self) -> str | None:
        """Return the active provider ID."""
        return self._active

    def set_active(
        self,
        provider_id: str,
    ) -> None:
        """
        Select an already registered provider as active.
        """
        provider_id = str(
            provider_id
        ).strip()

        if provider_id not in self._providers:
            raise KeyError(
                f"Market data provider not registered: {provider_id}"
            )

        self._active = provider_id

    def supports(
        self,
        capability: MarketDataCapability,
    ) -> bool:
        """Return whether the active provider supports a capability."""
        return self.active().supports(
            capability
        )

    def list_safe(self) -> list[dict]:
        """
        Return provider metadata safe for API/UI consumption.

        No credentials or runtime session information are exposed.
        """
        active_id = self._active

        return [
            {
                "provider_id": provider.provider_id,
                "display_name": provider.display_name,
                "version": provider.version,
                "category": provider.category,
                "capabilities": [
                    capability.value
                    for capability in provider.capabilities
                ],
                "active": (
                    provider.provider_id
                    == active_id
                ),
            }
            for provider in self._providers.values()
        ]


market_registry = MarketDataRegistry()

# Yahoo Finance is the currently available market-data provider.
# It is a data provider, NOT a broker.
market_registry.register(
    YahooFinanceProvider(),
    activate=True,
)


# ----------------------------------------------------------------------
# Default watchlist
# ----------------------------------------------------------------------

DEFAULT_WATCHLIST = [
    "SPY",
    "QQQ",
    "AAPL",
    "MSFT",
    "NVDA",
    "BTC-USD",
    "ETH-USD",
    "EURUSD=X",
]


async def get_watchlist_from(
    db,
) -> list[str]:
    """
    Load the user's persisted market watchlist.

    If no valid persisted watchlist exists, return the stable default.
    """
    doc = await db.settings_store.find_one(
        {
            "key": "market_watchlist"
        }
    )

    if (
        doc
        and isinstance(
            doc.get("value"),
            dict,
        )
    ):
        symbols = doc["value"].get(
            "symbols"
        )

        if (
            isinstance(symbols, list)
            and symbols
        ):
            cleaned = _normalize_symbols(
                symbols
            )

            if cleaned:
                return cleaned

    return list(DEFAULT_WATCHLIST)


# ----------------------------------------------------------------------
# Quote service
# ----------------------------------------------------------------------

async def get_quotes(
    symbols: list[str],
) -> list[Quote]:
    """
    Return normalized quotes from the active provider.
    """
    cleaned = _normalize_symbols(
        symbols
    )

    if not cleaned:
        return []

    provider = market_registry.active()

    if not provider.supports(
        MarketDataCapability.QUOTES
    ):
        raise RuntimeError(
            f"Active market data provider "
            f"'{provider.provider_id}' does not support quotes"
        )

    return await provider.quotes(
        cleaned
    )


# ----------------------------------------------------------------------
# Historical data service
# ----------------------------------------------------------------------

async def get_historical(
    symbol: str,
    *,
    start: datetime,
    end: datetime,
    interval: str,
) -> list[OHLCVBar]:
    """
    Return normalized historical/intraday OHLCV data.

    This is the application-facing entry point for future backtesting,
    strategy research and historical analysis.
    """
    cleaned = _normalize_symbols(
        [symbol]
    )

    if not cleaned:
        return []

    if start >= end:
        raise ValueError(
            "Historical data start must be earlier than end"
        )

    interval = str(
        interval
    ).strip().lower()

    if not interval:
        raise ValueError(
            "Historical data interval cannot be empty"
        )

    provider = market_registry.active()

    if not provider.supports(
        MarketDataCapability.HISTORICAL
    ):
        raise RuntimeError(
            f"Active market data provider "
            f"'{provider.provider_id}' does not support historical data"
        )

    return await provider.historical(
        cleaned[0],
        start=start,
        end=end,
        interval=interval,
    )


# ----------------------------------------------------------------------
# Provider health
# ----------------------------------------------------------------------

async def get_provider_health() -> MarketDataHealth:
    """
    Return normalized health information for the active provider.
    """
    return await market_registry.active().health()


# ----------------------------------------------------------------------
# Provider metadata
# ----------------------------------------------------------------------

def list_providers() -> list[dict]:
    """
    Return safe provider metadata for API/dashboard use.
    """
    return market_registry.list_safe()


def get_active_provider_id() -> str | None:
    """
    Return the active provider ID.
    """
    return market_registry.active_id()


def set_active_provider(
    provider_id: str,
) -> None:
    """
    Select a registered provider as active.

    This does not install, create, authenticate, or connect a provider.
    """
    market_registry.set_active(
        provider_id
    )


def provider_supports(
    capability: MarketDataCapability,
) -> bool:
    """
    Check whether the active provider supports a capability.
    """
    return market_registry.supports(
        capability
    )


# ----------------------------------------------------------------------
# Normalization helpers
# ----------------------------------------------------------------------

def _normalize_symbols(
    symbols: Iterable[object],
) -> list[str]:
    """
    Perform provider-independent symbol normalization.

    Empty values are discarded and duplicates are removed while
    preserving the original order.
    """
    result: list[str] = []
    seen: set[str] = set()

    for value in symbols:
        symbol = str(
            value
        ).strip().upper()

        if not symbol:
            continue

        if symbol in seen:
            continue

        seen.add(symbol)
        result.append(symbol)

    return result
