from __future__ import annotations

from typing import Any
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from modules.auth.deps import get_current_user
from modules.strategy import (
    create_strategy,
    get_owned_strategy,
    list_backtests,
    list_strategies,
    run_backtest,
    set_strategy_status,
    update_strategy,
    validate_strategy,
)

router = APIRouter(prefix="/api/strategies", tags=["strategies"])


class StrategyBody(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    symbol: str = Field(min_length=1, max_length=64)
    exchange: str = Field(default="NSE", min_length=1, max_length=16)
    timeframe: str = Field(min_length=1, max_length=8)
    description: str = ""
    indicators: list[dict[str, Any]] = Field(default_factory=list)
    entry_conditions: list[dict[str, Any]] = Field(default_factory=list)
    exit_conditions: list[dict[str, Any]] = Field(default_factory=list)
    stop_loss: float | None = None
    target: float | None = None
    trailing_stop: float | None = None
    quantity: int = Field(default=1, gt=0)
    max_positions: int = Field(default=1, gt=0)
    risk: dict[str, Any] = Field(default_factory=dict)
@router.get("")
async def strategies(user: dict[str, Any] = Depends(get_current_user)):
    return {"strategies": await list_strategies(str(user["_id"]))}


@router.post("")
async def create(body: StrategyBody, user: dict[str, Any] = Depends(get_current_user)):
    return await create_strategy(str(user["_id"]), body.model_dump())


@router.post("/validate")
async def validate(body: StrategyBody, user: dict[str, Any] = Depends(get_current_user)):
    del user
    return {"ok": True, "strategy": validate_strategy(body.model_dump())}


@router.get("/{strategy_id}")
async def get(strategy_id: str, user: dict[str, Any] = Depends(get_current_user)):
    result = await get_owned_strategy(str(user["_id"]), strategy_id)
    result.pop("_id", None)
    return result


@router.put("/{strategy_id}")
async def update(strategy_id: str, body: StrategyBody, user: dict[str, Any] = Depends(get_current_user)):
    return await update_strategy(str(user["_id"]), strategy_id, body.model_dump())


@router.post("/{strategy_id}/status")
async def status(strategy_id: str, state: dict[str, str], user: dict[str, Any] = Depends(get_current_user)):
    return await set_strategy_status(str(user["_id"]), strategy_id, state.get("status", ""))


@router.post("/{strategy_id}/backtest")
async def backtest(strategy_id: str, request: dict[str, Any], user: dict[str, Any] = Depends(get_current_user)):
    return await run_backtest(str(user["_id"]), strategy_id, request)


@router.get("/{strategy_id}/backtests")
async def backtests(strategy_id: str, user: dict[str, Any] = Depends(get_current_user)):
    return {"backtests": await list_backtests(str(user["_id"]), strategy_id)}
