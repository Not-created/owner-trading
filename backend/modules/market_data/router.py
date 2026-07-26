"""
Market Data router — /api/market
Endpoints for watchlist management and live quotes for the top-bar ticker.
"""
from dataclasses import asdict
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field

from core.database import get_db
from modules.auth.deps import get_current_user
from modules.market_data.service import (
    get_quotes,
    get_watchlist_from,
    DEFAULT_WATCHLIST,
)

router = APIRouter(prefix="/api/market", tags=["market"])


class WatchlistBody(BaseModel):
    symbols: list[str] = Field(min_length=1, max_length=32)


@router.get("/watchlist")
async def get_watchlist(user=Depends(get_current_user)):
    db = get_db()
    return {"symbols": await get_watchlist_from(db), "default": DEFAULT_WATCHLIST}


@router.put("/watchlist")
async def set_watchlist(body: WatchlistBody, user=Depends(get_current_user)):
    db = get_db()
    cleaned = [s.strip().upper() for s in body.symbols if s.strip()]
    await db.settings_store.update_one(
        {"key": "market_watchlist"},
        {"$set": {"key": "market_watchlist", "value": {"symbols": cleaned}}},
        upsert=True,
    )
    return {"ok": True, "symbols": cleaned}


@router.get("/quotes")
async def quotes(
    user=Depends(get_current_user),
    symbols: str | None = Query(default=None, description="Comma-separated. Omit for watchlist."),
):
    db = get_db()
    syms = [s.strip().upper() for s in symbols.split(",")] if symbols else await get_watchlist_from(db)
    result = await get_quotes(syms)
    return {"quotes": [asdict(q) for q in result]}
