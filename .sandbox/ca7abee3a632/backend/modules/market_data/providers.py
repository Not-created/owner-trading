"""
Yahoo Finance market data provider (via yfinance).
Real quotes for stocks, ETFs, indices, crypto, forex — no API key required.
"""
import asyncio
import yfinance as yf
from modules.market_data.base import MarketDataProvider, Quote


def _fetch(symbols: list[str]) -> list[Quote]:
    if not symbols:
        return []
    tickers = yf.Tickers(" ".join(symbols))
    out: list[Quote] = []
    for sym in symbols:
        try:
            t = tickers.tickers.get(sym) or tickers.tickers.get(sym.upper())
            if t is None:
                continue
            fi = t.fast_info
            price = getattr(fi, "last_price", None)
            prev = getattr(fi, "previous_close", None) or getattr(fi, "regular_market_previous_close", None)
            if price is None:
                continue
            change = (price - prev) if (prev is not None) else 0.0
            change_pct = (change / prev * 100.0) if (prev not in (None, 0)) else 0.0
            out.append(Quote(
                symbol=sym,
                price=float(price),
                change=float(change),
                change_percent=float(change_pct),
                currency=getattr(fi, "currency", "USD") or "USD",
                name=None,
                market=getattr(fi, "exchange", None),
            ))
        except Exception:
            continue
    return out


class YahooFinanceProvider(MarketDataProvider):
    provider_id = "yahoo"
    display_name = "Yahoo Finance"

    async def quotes(self, symbols: list[str]) -> list[Quote]:
        return await asyncio.to_thread(_fetch, symbols)
