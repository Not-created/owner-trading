"""Owned strategy definitions and deterministic backtest execution."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from core.database import get_db
from core.error_handling import AppError
from core.logging_service import log_service
from modules.market_data.service import get_historical

VALID_TIMEFRAMES = {"1m", "5m", "15m", "30m", "1h", "1d", "1wk"}
VALID_STATUSES = {"DRAFT", "VALIDATED", "BACKTESTED", "READY", "ACTIVE", "PAUSED", "DISABLED"}
VALID_OPERATORS = {"GREATER_THAN", "LESS_THAN", "EQUAL", "CROSSOVER", "CROSSUNDER"}


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def validate_strategy(payload: dict[str, Any]) -> dict[str, Any]:
    name = str(payload.get("name", "")).strip()
    symbol = str(payload.get("symbol", "")).strip().upper()
    exchange = str(payload.get("exchange", "NSE")).strip().upper()
    timeframe = str(payload.get("timeframe", "")).strip().lower()
    if not name or len(name) > 120:
        raise AppError("VALIDATION", status=400, detail="Strategy name is required and must be <= 120 characters")
    if not symbol or len(symbol) > 64:
        raise AppError("VALIDATION", status=400, detail="Strategy symbol is required")
    if timeframe not in VALID_TIMEFRAMES:
        raise AppError("VALIDATION", status=400, detail="Unsupported strategy timeframe")
    indicators = payload.get("indicators") or []
    if not isinstance(indicators, list):
        raise AppError("VALIDATION", status=400, detail="indicators must be a list")
    for indicator in indicators:
        if not isinstance(indicator, dict) or indicator.get("type") not in {"SMA", "EMA"}:
            raise AppError("VALIDATION", status=400, detail="Only SMA and EMA indicators are supported")
        period = indicator.get("period")
        if not isinstance(period, int) or period < 2 or period > 1000:
            raise AppError("VALIDATION", status=400, detail="Indicator period must be between 2 and 1000")
    conditions = payload.get("entry_conditions") or []
    exits = payload.get("exit_conditions") or []
    for condition in [*conditions, *exits]:
        if not isinstance(condition, dict) or condition.get("operator") not in VALID_OPERATORS:
            raise AppError("VALIDATION", status=400, detail="Invalid strategy condition operator")
        if not condition.get("left") or not condition.get("right"):
            raise AppError("VALIDATION", status=400, detail="Strategy conditions require left and right operands")
    stop_loss = payload.get("stop_loss")
    target = payload.get("target")
    if stop_loss is not None and (not isinstance(stop_loss, (int, float)) or stop_loss <= 0 or stop_loss >= 100):
        raise AppError("VALIDATION", status=400, detail="stop_loss must be a percentage between 0 and 100")
    if target is not None and (not isinstance(target, (int, float)) or target <= 0 or target >= 1000):
        raise AppError("VALIDATION", status=400, detail="target must be a positive percentage below 1000")
    quantity = payload.get("quantity", 1)
    if not isinstance(quantity, int) or quantity <= 0:
        raise AppError("VALIDATION", status=400, detail="quantity must be a positive integer")
    max_positions = payload.get("max_positions", 1)
    if not isinstance(max_positions, int) or max_positions <= 0:
        raise AppError("VALIDATION", status=400, detail="max_positions must be a positive integer")
    return {
        "name": name,
        "description": str(payload.get("description", "")).strip()[:1000],
        "symbol": symbol,
        "exchange": exchange,
        "timeframe": timeframe,
        "indicators": indicators,
        "entry_conditions": conditions,
        "exit_conditions": exits,
        "stop_loss": stop_loss,
        "target": target,
        "trailing_stop": payload.get("trailing_stop"),
        "quantity": quantity,
        "max_positions": max_positions,
        "risk": payload.get("risk") if isinstance(payload.get("risk"), dict) else {},
    }


async def list_strategies(user_id: str) -> list[dict[str, Any]]:
    result = []
    async for strategy in get_db().strategies.find({"user_id": user_id}).sort("updated_at", -1):
        strategy.pop("_id", None)
        result.append(strategy)
    return result


async def create_strategy(user_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    definition = validate_strategy(payload)
    timestamp = now()
    document = {
        "strategy_id": uuid.uuid4().hex,
        "user_id": user_id,
        "version": 1,
        "status": "DRAFT",
        "created_at": timestamp,
        "updated_at": timestamp,
        **definition,
    }
    await get_db().strategies.insert_one(document)
    await log_service.info("strategy", f"Strategy created: {document['strategy_id']}", user_id=user_id)
    document.pop("_id", None)
    return document


async def get_owned_strategy(user_id: str, strategy_id: str) -> dict[str, Any]:
    strategy = await get_db().strategies.find_one({"user_id": user_id, "strategy_id": strategy_id})
    if not strategy:
        raise AppError("NOT_FOUND", status=404, detail="Strategy not found")
    return strategy


async def update_strategy(user_id: str, strategy_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    strategy = await get_owned_strategy(user_id, strategy_id)
    definition = validate_strategy(payload)
    update = {**definition, "version": int(strategy.get("version", 1)) + 1, "status": "DRAFT", "updated_at": now()}
    await get_db().strategies.update_one({"user_id": user_id, "strategy_id": strategy_id}, {"$set": update})
    result = await get_owned_strategy(user_id, strategy_id)
    result.pop("_id", None)
    return result


async def set_strategy_status(user_id: str, strategy_id: str, status: str) -> dict[str, Any]:
    strategy = await get_owned_strategy(user_id, strategy_id)
    status = status.upper()
    if status not in VALID_STATUSES:
        raise AppError("VALIDATION", status=400, detail="Invalid strategy status")
    if status == "ACTIVE":
        raise AppError("VALIDATION", status=400, detail="Live strategy activation requires an explicit deployment workflow")
    if status == "READY" and strategy.get("status") not in {"BACKTESTED", "READY", "PAUSED"}:
        raise AppError("VALIDATION", status=400, detail="Strategy must be backtested before it is ready")
    await get_db().strategies.update_one({"user_id": user_id, "strategy_id": strategy_id}, {"$set": {"status": status, "updated_at": now()}})
    return await get_owned_strategy(user_id, strategy_id)


def _indicator_values(candles: list[Any], indicators: list[dict[str, Any]], index: int) -> dict[str, float]:
    values: dict[str, float] = {"PRICE": float(candles[index].close)}
    for indicator in indicators:
        period = indicator["period"]
        if index + 1 < period:
            continue
        closes = [float(candle.close) for candle in candles[index + 1 - period:index + 1]]
        values[f"{indicator['type']}_{period}"] = sum(closes) / period
    return values


def _operand(operand: Any, values: dict[str, float]) -> float | None:
    if isinstance(operand, (int, float)):
        return float(operand)
    if isinstance(operand, str):
        return values.get(operand.upper())
    return None


def evaluate_conditions(conditions: list[dict[str, Any]], values: dict[str, float], previous: dict[str, float] | None = None) -> bool:
    if not conditions:
        return False
    for condition in conditions:
        left = _operand(condition.get("left"), values)
        right = _operand(condition.get("right"), values)
        if left is None or right is None:
            return False
        operator = condition["operator"]
        if operator == "GREATER_THAN" and not left > right:
            return False
        if operator == "LESS_THAN" and not left < right:
            return False
        if operator == "EQUAL" and not left == right:
            return False
        if operator in {"CROSSOVER", "CROSSUNDER"}:
            if previous is None:
                return False
            previous_left = _operand(condition.get("left"), previous)
            previous_right = _operand(condition.get("right"), previous)
            if previous_left is None or previous_right is None:
                return False
            crossed = previous_left <= previous_right and left > right if operator == "CROSSOVER" else previous_left >= previous_right and left < right
            if not crossed:
                return False
    return True


async def run_backtest(user_id: str, strategy_id: str, request: dict[str, Any]) -> dict[str, Any]:
    strategy = await get_owned_strategy(user_id, strategy_id)
    try:
        start = datetime.fromisoformat(str(request.get("start")).replace("Z", "+00:00"))
        end = datetime.fromisoformat(str(request.get("end")).replace("Z", "+00:00"))
    except ValueError as exc:
        raise AppError("VALIDATION", status=400, detail="Backtest start and end must be valid ISO dates") from exc
    if start >= end:
        raise AppError("VALIDATION", status=400, detail="Backtest start must be before end")
    initial_capital = float(request.get("initial_capital", 0))
    if initial_capital <= 0:
        raise AppError("VALIDATION", status=400, detail="initial_capital must be positive")
    candles = await get_historical(strategy["symbol"], start=start, end=end, interval=strategy["timeframe"])
    if not candles:
        raise AppError("UNAVAILABLE", status=503, detail="Historical data is unavailable for this instrument and period")
    cash = initial_capital
    position = None
    trades = []
    equity_curve = []
    previous_values = None
    for index, candle in enumerate(candles):
        values = _indicator_values(candles, strategy["indicators"], index)
        close = float(candle.close)
        if position:
            change = (close - position["entry_price"]) / position["entry_price"] * 100
            should_exit = evaluate_conditions(strategy["exit_conditions"], values, previous_values)
            if strategy.get("stop_loss") and change <= -float(strategy["stop_loss"]):
                should_exit = True
            if strategy.get("target") and change >= float(strategy["target"]):
                should_exit = True
            if should_exit:
                proceeds = close * position["quantity"]
                pnl = proceeds - position["entry_price"] * position["quantity"]
                cash += proceeds
                trades.append({**position, "exit_time": candle.timestamp.isoformat(), "exit_price": close, "pnl": pnl})
                position = None
        elif evaluate_conditions(strategy["entry_conditions"], values, previous_values):
            cost = close * strategy["quantity"]
            if cost <= cash:
                cash -= cost
                position = {"entry_time": candle.timestamp.isoformat(), "entry_price": close, "quantity": strategy["quantity"]}
        equity = cash + (position["quantity"] * close if position else 0)
        equity_curve.append({"timestamp": candle.timestamp.isoformat(), "equity": equity})
        previous_values = values
    if position:
        close = float(candles[-1].close)
        proceeds = close * position["quantity"]
        cash += proceeds
        trades.append({**position, "exit_time": candles[-1].timestamp.isoformat(), "exit_price": close, "pnl": proceeds - position["entry_price"] * position["quantity"], "exit_reason": "end_of_period"})
        equity_curve[-1]["equity"] = cash
    pnl_values = [float(trade["pnl"]) for trade in trades]
    winners = [value for value in pnl_values if value > 0]
    losers = [value for value in pnl_values if value < 0]
    peak = initial_capital
    max_drawdown = 0.0
    for point in equity_curve:
        peak = max(peak, point["equity"])
        max_drawdown = max(max_drawdown, peak - point["equity"])
    result = {
        "backtest_id": uuid.uuid4().hex,
        "user_id": user_id,
        "strategy_id": strategy_id,
        "strategy_version": strategy["version"],
        "instrument": strategy["symbol"],
        "exchange": strategy["exchange"],
        "timeframe": strategy["timeframe"],
        "start": start.isoformat(),
        "end": end.isoformat(),
        "initial_capital": initial_capital,
        "final_capital": cash,
        "total_pnl": cash - initial_capital,
        "return_percent": (cash - initial_capital) / initial_capital * 100,
        "maximum_drawdown": max_drawdown,
        "trade_count": len(trades),
        "winning_trades": len(winners),
        "losing_trades": len(losers),
        "win_rate": len(winners) / len(trades) * 100 if trades else None,
        "profit_factor": sum(winners) / abs(sum(losers)) if losers else None,
        "equity_curve": equity_curve,
        "trades": trades,
        "assumptions": {"quantity": strategy["quantity"], "fees": "not applied", "slippage": "not applied"},
        "data_source": "active market-data provider",
        "result_type": "BACKTEST",
        "created_at": now(),
    }
    await get_db().backtests.insert_one(result)
    await get_db().strategies.update_one({"user_id": user_id, "strategy_id": strategy_id}, {"$set": {"status": "BACKTESTED", "updated_at": now()}})
    result.pop("_id", None)
    return result


async def list_backtests(user_id: str, strategy_id: str | None = None) -> list[dict[str, Any]]:
    query: dict[str, Any] = {"user_id": user_id}
    if strategy_id:
        query["strategy_id"] = strategy_id
    result = []
    async for item in get_db().backtests.find(query).sort("created_at", -1):
        item.pop("_id", None)
        result.append(item)
    return result
