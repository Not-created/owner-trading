"""
Market Data Router — /api/market

Application-facing HTTP API for normalized market data.

Rules:
- Router never talks directly to Yahoo/yfinance.
- All market-data access goes through market_data.service.
- No broker/order execution logic belongs here.
- No credentials are accepted or exposed.
- No fake market data is generated.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from modules.auth.deps import get_current_user
from modules.market_data import service as svc


router = APIRouter(
    prefix="/api/market",
    tags=["market-data"],
)


# ----------------------------------------------------------------------
# Response/request models
# ----------------------------------------------------------------------


class HistoricalQuery(BaseModel):
    """Validated historical market-data request."""

    symbol: str = Field(
        min_length=1,
        max_length=64,
    )
    start: datetime
    end: datetime
    interval: str = Field(
        min_length=1,
        max_length=32,
    )


# ----------------------------------------------------------------------
# Quotes
# ----------------------------------------------------------------------


@router.get("/quotes")
async def quotes(
    symbols: str = Query(
        ...,
        min_length=1,
        description="Comma-separated symbols",
    ),
    user=Depends(get_current_user),
) -> dict[str, Any]:
    """
    Return normalized latest quotes.

    Example:
        /api/market/quotes?symbols=AAPL,MSFT,NVDA
    """
    requested = [
        symbol.strip()
        for symbol in symbols.split(",")
        if symbol.strip()
    ]

    if not requested:
        raise HTTPException(
            status_code=400,
            detail="At least one symbol is required",
        )

    try:
        result = await svc.get_quotes(
            requested
        )
    except RuntimeError as exc:
        raise HTTPException(
            status_code=503,
            detail=str(exc),
        ) from exc

    return {
        "quotes": [
            _quote_to_dict(quote)
            for quote in result
        ]
    }


# ----------------------------------------------------------------------
# Historical data
# ----------------------------------------------------------------------


@router.get("/historical")
async def historical(
    symbol: str = Query(
        ...,
        min_length=1,
        max_length=64,
    ),
    start: datetime = Query(...),
    end: datetime = Query(...),
    interval: str = Query(
        ...,
        min_length=1,
        max_length=32,
    ),
    user=Depends(get_current_user),
) -> dict[str, Any]:
    """
    Return normalized OHLCV historical/intraday data.

    This endpoint is intended to become the common data source for
    strategy research and backtesting. Backtest execution itself does
    not belong to this router.
    """
    try:
        bars = await svc.get_historical(
            symbol,
            start=start,
            end=end,
            interval=interval,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        ) from exc

    except RuntimeError as exc:
        raise HTTPException(
            status_code=503,
            detail=str(exc),
        ) from exc

    return {
        "symbol": symbol.strip().upper(),
        "start": start,
        "end": end,
        "interval": interval.strip().lower(),
        "bars": [
            _bar_to_dict(bar)
            for bar in bars
        ],
        "count": len(bars),
    }


# ----------------------------------------------------------------------
# Provider information
# ----------------------------------------------------------------------


@router.get("/providers")
async def providers(
    user=Depends(get_current_user),
) -> dict[str, Any]:
    """
    Return safe metadata for registered market-data providers.

    No credentials, tokens, or provider sessions are exposed.
    """
    return {
        "providers": svc.list_providers(),
        "active_provider": svc.get_active_provider_id(),
    }


# ----------------------------------------------------------------------
# Provider health
# ----------------------------------------------------------------------


@router.get("/health")
async def health(
    user=Depends(get_current_user),
) -> dict[str, Any]:
    """
    Return health of the active market-data provider.
    """
    result = await svc.get_provider_health()

    return {
        "ok": result.ok,
        "detail": result.detail,
        "latency_ms": result.latency_ms,
        "provider_id": result.provider_id,
    }


# ----------------------------------------------------------------------
# Capability information
# ----------------------------------------------------------------------


@router.get("/capabilities")
async def capabilities(
    user=Depends(get_current_user),
) -> dict[str, Any]:
    """
    Return capabilities exposed by the active provider.

    Future modules can use this to determine whether a selected
    market-data source supports quotes, historical data, realtime data,
    etc., without depending on provider-specific code.
    """
    providers = svc.list_providers()

    active_id = svc.get_active_provider_id()

    active = next(
        (
            provider
            for provider in providers
            if provider["provider_id"] == active_id
        ),
        None,
    )

    return {
        "provider_id": active_id,
        "capabilities": (
            active.get("capabilities", [])
            if active
            else []
        ),
    }


# ----------------------------------------------------------------------
# Serialization helpers
# ----------------------------------------------------------------------


def _quote_to_dict(
    quote: Any,
) -> dict[str, Any]:
    """
    Serialize a normalized Quote without exposing provider internals.
    """
    return {
        "symbol": quote.symbol,
        "price": quote.price,
        "change": quote.change,
        "change_percent": quote.change_percent,
        "currency": quote.currency,
        "name": quote.name,
        "market": quote.market,
        "bid": quote.bid,
        "ask": quote.ask,
        "volume": quote.volume,
        "timestamp": quote.timestamp,
        "provider": quote.provider,
    }


def _bar_to_dict(
    bar: Any,
) -> dict[str, Any]:
    """
    Serialize a normalized OHLCVBar.
    """
    return {
        "symbol": bar.symbol,
        "timestamp": bar.timestamp,
        "open": bar.open,
        "high": bar.high,
        "low": bar.low,
        "close": bar.close,
        "volume": bar.volume,
        "interval": bar.interval,
        "currency": bar.currency,
        "provider": bar.provider,
    }
