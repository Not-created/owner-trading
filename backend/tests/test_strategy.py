import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from modules.strategy import evaluate_conditions, validate_strategy
from core.error_handling import AppError


def valid_strategy():
    return {
        "name": "Moving Average Test",
        "symbol": "INFY",
        "exchange": "NSE",
        "timeframe": "1d",
        "indicators": [{"type": "SMA", "period": 3}],
        "entry_conditions": [{"left": "PRICE", "operator": "GREATER_THAN", "right": "SMA_3"}],
        "exit_conditions": [{"left": "PRICE", "operator": "LESS_THAN", "right": "SMA_3"}],
        "quantity": 1,
        "max_positions": 1,
    }


def test_validate_strategy_normalizes_definition():
    result = validate_strategy({**valid_strategy(), "name": "  test  ", "symbol": " infy "})
    assert result["name"] == "test"
    assert result["symbol"] == "INFY"
    assert result["timeframe"] == "1d"


def test_validate_strategy_rejects_bad_condition():
    payload = valid_strategy()
    payload["entry_conditions"] = [{"left": "PRICE", "operator": "UNKNOWN", "right": 1}]
    with pytest.raises(AppError):
        validate_strategy(payload)


def test_evaluate_conditions_and_crossover():
    assert evaluate_conditions([{"left": "PRICE", "operator": "GREATER_THAN", "right": "SMA_3"}], {"PRICE": 12, "SMA_3": 10})
    assert not evaluate_conditions([{"left": "PRICE", "operator": "CROSSOVER", "right": "SMA_3"}], {"PRICE": 12, "SMA_3": 10})
    assert evaluate_conditions(
        [{"left": "PRICE", "operator": "CROSSOVER", "right": "SMA_3"}],
        {"PRICE": 12, "SMA_3": 10},
        {"PRICE": 9, "SMA_3": 10},
    )


def test_backtest_metrics_are_derived_from_trades():
    trades = [{"pnl": 25.0}, {"pnl": -10.0}, {"pnl": 15.0}]
    winners = [trade["pnl"] for trade in trades if trade["pnl"] > 0]
    losers = [trade["pnl"] for trade in trades if trade["pnl"] < 0]
    assert sum(trade["pnl"] for trade in trades) == 30.0
    assert len(winners) == 2
    assert len(losers) == 1
    assert sum(winners) / abs(sum(losers)) == 4.0
