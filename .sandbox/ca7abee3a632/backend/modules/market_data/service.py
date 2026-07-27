"""
Market Data registry + service.
"""
from modules.market_data.base import MarketDataProvider, Quote
from modules.market_data.providers import YahooFinanceProvider


class MarketDataRegistry:
    def __init__(self) -> None:
        self._providers: dict[str, MarketDataProvider] = {}
        self._active: str | None = None

    def register(self, p: MarketDataProvider, activate: bool = False) -> None:
        self._providers[p.provider_id] = p
        if activate or self._active is None:
            self._active = p.provider_id

    def active(self) -> MarketDataProvider:
        if not self._active:
            raise RuntimeError("No market data provider registered")
        return self._providers[self._active]


market_registry = MarketDataRegistry()
market_registry.register(YahooFinanceProvider(), activate=True)


DEFAULT_WATCHLIST = ["SPY", "QQQ", "AAPL", "MSFT", "NVDA", "BTC-USD", "ETH-USD", "EURUSD=X"]


async def get_watchlist_from(db) -> list[str]:
    doc = await db.settings_store.find_one({"key": "market_watchlist"})
    if doc and isinstance(doc.get("value"), dict):
        symbols = doc["value"].get("symbols")
        if isinstance(symbols, list) and symbols:
            return [str(s).strip().upper() for s in symbols if str(s).strip()]
    return DEFAULT_WATCHLIST


async def get_quotes(symbols: list[str]) -> list[Quote]:
    return await market_registry.active().quotes(symbols)
