"""
Market Data Provider Implementations — final provider layer.

This module contains provider-specific market-data implementations.

Architecture:
    MarketDataProvider (final contract)
            ↓
    Provider implementations
            ↓
    Market Data Service
            ↓
    Strategy / Backtest / Trading / Dashboard / AI

Rules:
- The rest of the application depends only on MarketDataProvider and the
  normalized models defined in market_data.base.
- Provider-specific SDK/API behavior stays inside this module.
- No broker credentials or order/trading logic belongs here.
- No fake, synthetic, or fallback market prices are generated.
- Provider failures are reported explicitly.
- Blocking third-party SDK calls must not block the async event loop.
"""

from __future__ import annotations

import asyncio
import time
from datetime import datetime, timezone
from typing import Any

import yfinance as yf

from modules.market_data.base import (
    MarketDataCapability,
    MarketDataHealth,
    MarketDataProvider,
    OHLCVBar,
    Quote,
)


class YahooFinanceProvider(MarketDataProvider):
    """
    Yahoo Finance market-data provider.

    Current responsibilities:
    - latest quotes
    - historical OHLCV data
    - provider health

    Yahoo Finance is a market-data source only. It is not treated as a
    broker and must never be used for order execution.
    """

    provider_id = "yahoo"
    display_name = "Yahoo Finance"
    version = "1.0.0"
    category = "market_data"

    capabilities = (
        MarketDataCapability.QUOTES,
        MarketDataCapability.HISTORICAL,
        MarketDataCapability.INTRADAY,
    )

    async def quotes(
        self,
        symbols: list[str],
    ) -> list[Quote]:
        """
        Fetch normalized latest quotes.

        yfinance is synchronous, therefore the blocking operation is
        executed in a worker thread.
        """
        normalized = self.validate_symbols(symbols)

        if not normalized:
            return []

        return await asyncio.to_thread(
            self._fetch_quotes,
            normalized,
        )

    async def historical(
        self,
        symbol: str,
        *,
        start: datetime,
        end: datetime,
        interval: str,
    ) -> list[OHLCVBar]:
        """
        Fetch normalized historical/intraday OHLCV candles.

        No data is fabricated if Yahoo returns no usable records.
        """
        normalized_symbols = self.validate_symbols([symbol])

        if not normalized_symbols:
            return []

        return await asyncio.to_thread(
            self._fetch_historical,
            normalized_symbols[0],
            start,
            end,
            interval,
        )

    async def health(self) -> MarketDataHealth:
        """
        Check whether Yahoo Finance can currently provide market data.
        """
        started = time.perf_counter()

        try:
            result = await asyncio.to_thread(
                self._fetch_quotes,
                ["AAPL"],
            )

            latency_ms = self._latency_ms(started)

            if result:
                return MarketDataHealth(
                    ok=True,
                    detail="Yahoo Finance market data available",
                    latency_ms=latency_ms,
                    provider_id=self.provider_id,
                )

            return MarketDataHealth(
                ok=False,
                detail="Yahoo Finance returned no usable quote",
                latency_ms=latency_ms,
                provider_id=self.provider_id,
            )

        except Exception as exc:
            return MarketDataHealth(
                ok=False,
                detail=self._safe_error(exc),
                latency_ms=self._latency_ms(started),
                provider_id=self.provider_id,
            )

    # ------------------------------------------------------------------
    # Quote implementation
    # ------------------------------------------------------------------

    @staticmethod
    def _fetch_quotes(
        symbols: list[str],
    ) -> list[Quote]:
        """
        Synchronous Yahoo quote retrieval.

        This method is intentionally private to the provider adapter.
        """
        if not symbols:
            return []

        try:
            tickers = yf.Tickers(
                " ".join(symbols)
            )
        except Exception:
            return []

        results: list[Quote] = []

        for symbol in symbols:
            try:
                ticker = tickers.tickers.get(symbol)

                if ticker is None:
                    continue

                fast_info = ticker.fast_info

                price = getattr(
                    fast_info,
                    "last_price",
                    None,
                )

                if price is None:
                    continue

                price = float(price)

                previous_close = (
                    getattr(
                        fast_info,
                        "previous_close",
                        None,
                    )
                    or getattr(
                        fast_info,
                        "regular_market_previous_close",
                        None,
                    )
                )

                previous = (
                    float(previous_close)
                    if previous_close is not None
                    else None
                )

                change = (
                    price - previous
                    if previous is not None
                    else 0.0
                )

                change_percent = (
                    (change / previous) * 100.0
                    if previous not in (None, 0.0)
                    else 0.0
                )

                currency = (
                    getattr(
                        fast_info,
                        "currency",
                        None,
                    )
                    or "USD"
                )

                exchange = getattr(
                    fast_info,
                    "exchange",
                    None,
                )

                results.append(
                    Quote(
                        symbol=symbol,
                        price=price,
                        change=float(change),
                        change_percent=float(
                            change_percent
                        ),
                        currency=str(currency),
                        name=None,
                        market=(
                            str(exchange)
                            if exchange is not None
                            else None
                        ),
                        bid=None,
                        ask=None,
                        volume=None,
                        timestamp=datetime.now(
                            timezone.utc
                        ),
                        provider=self.provider_id,
                    )
                )

            except Exception:
                # Do not fabricate a quote for an unavailable symbol.
                continue

        return results

    # ------------------------------------------------------------------
    # Historical data implementation
    # ------------------------------------------------------------------

    @staticmethod
    def _fetch_historical(
        symbol: str,
        start: datetime,
        end: datetime,
        interval: str,
    ) -> list[OHLCVBar]:
        """
        Synchronous Yahoo historical OHLCV retrieval.

        Yahoo's returned index is normalized into timezone-aware UTC
        timestamps where possible.
        """
        try:
            ticker = yf.Ticker(symbol)

            frame = ticker.history(
                start=start,
                end=end,
                interval=interval,
                auto_adjust=False,
                actions=False,
            )
        except Exception:
            return []

        if frame is None or frame.empty:
            return []

        results: list[OHLCVBar] = []

        for timestamp, row in frame.iterrows():
            try:
                normalized_timestamp = (
                    timestamp.to_pydatetime()
                    if hasattr(
                        timestamp,
                        "to_pydatetime",
                    )
                    else timestamp
                )

                if normalized_timestamp.tzinfo is None:
                    normalized_timestamp = (
                        normalized_timestamp.replace(
                            tzinfo=timezone.utc
                        )
                    )
                else:
                    normalized_timestamp = (
                        normalized_timestamp.astimezone(
                            timezone.utc
                        )
                    )

                open_price = float(row["Open"])
                high_price = float(row["High"])
                low_price = float(row["Low"])
                close_price = float(row["Close"])

                volume_value = row.get(
                    "Volume",
                    0,
                )

                volume = (
                    float(volume_value)
                    if volume_value is not None
                    else 0.0
                )

                # Invalid/non-finite values must not enter the
                # normalized market-data layer.
                values = (
                    open_price,
                    high_price,
                    low_price,
                    close_price,
                    volume,
                )

                if not all(
                    _is_finite(value)
                    for value in values
                ):
                    continue

                results.append(
                    OHLCVBar(
                        symbol=symbol,
                        timestamp=normalized_timestamp,
                        open=open_price,
                        high=high_price,
                        low=low_price,
                        close=close_price,
                        volume=volume,
                        interval=interval,
                        currency=None,
                        provider="yahoo",
                    )
                )

            except Exception:
                continue

        return results

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _latency_ms(
        started: float,
    ) -> int:
        return int(
            (time.perf_counter() - started) * 1000
        )

    @staticmethod
    def _safe_error(
        exc: Exception,
    ) -> str:
        """
        Convert provider exceptions into a short safe message.
        """
        message = str(exc).strip()

        if not message:
            return "Yahoo Finance request failed"

        return message[:200]


def _is_finite(value: float) -> bool:
    """
    Return True only for finite numeric values.

    Kept dependency-free so the provider does not need an additional
    numerical validation package just for this check.
    """
    return value == value and abs(value) != float("inf")
