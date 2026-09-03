"""Canonical broker order and account data service.

This is the single order-trading layer for broker plugins. It validates the
authenticated user/account ownership, delegates to the selected broker plugin,
and persists normalized state to the broker collections used by the platform.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from core.database import get_db
from core.error_handling import AppError
from core.logging_service import log_service
from modules.broker_core.registry import broker_registry


def _canonical_side(value: str | None) -> str:
    side = (value or "").upper().strip()
    if side in {"BUY", "B"}:
        return "BUY"
    if side in {"SELL", "S"}:
        return "SELL"
    raise AppError("VALIDATION", status=400, detail="Invalid side. Use BUY or SELL.")


def _canonical_order_type(value: str | None) -> str:
    order_type = (value or "").upper().strip()
    if order_type in {"MARKET", "MKT"}:
        return "MARKET"
    if order_type in {"LIMIT", "LMT"}:
        return "LIMIT"
    if order_type in {"STOPLOSS", "SL"}:
        return "STOPLOSS"
    raise AppError("VALIDATION", status=400, detail="Unsupported order type for the current broker contract.")


async def _get_account_for_user(user_id: str, account_id: str) -> dict:
    db = get_db()
    acc = await db.broker_accounts.find_one({"user_id": user_id, "account_id": account_id})
    if not acc:
        raise AppError("NOT_FOUND", status=404, detail="Broker account not found for this user")
    return acc


async def _get_plugin_for_account(account: dict) -> Any:
    plugin = broker_registry.get(account["plugin_id"])
    if not plugin:
        raise AppError("NOT_FOUND", status=404, detail="Broker plugin not registered")
    return plugin


async def _get_owned_order(user_id: str, account_id: str, order_id: str) -> dict:
    order = await get_db().orders.find_one({
        "user_id": user_id,
        "account_id": account_id,
        "order_id": order_id,
    })
    if not order:
        raise AppError("NOT_FOUND", status=404, detail="Order not found for this broker account")
    return order


def _validate_payload(payload: dict[str, Any]) -> dict[str, Any]:
    if not payload:
        raise AppError("VALIDATION", status=400, detail="Order payload is required")

    symbol = (payload.get("symbol") or "").strip()
    exchange = (payload.get("exchange") or "").strip().upper()
    quantity = payload.get("quantity")
    side = payload.get("side")
    order_type = payload.get("order_type")
    product = (payload.get("product") or "CNC").strip().upper()

    if not symbol:
        raise AppError("VALIDATION", status=400, detail="symbol is required")
    if not exchange:
        raise AppError("VALIDATION", status=400, detail="exchange is required")
    if quantity is None or int(quantity) <= 0:
        raise AppError("VALIDATION", status=400, detail="quantity must be a positive integer")

    side_value = _canonical_side(side)
    order_type_value = _canonical_order_type(order_type)
    if product not in {"CNC", "INTRADAY", "MIS", "NRML"}:
        raise AppError("VALIDATION", status=400, detail="Unsupported product. Use CNC, MIS, NRML, or INTRADAY.")

    canonical = {
        "symbol": symbol,
        "exchange": exchange,
        "side": side_value,
        "quantity": int(quantity),
        "order_type": order_type_value,
        "product": product,
        "price": payload.get("price"),
        "trigger_price": payload.get("trigger_price"),
        "validity": (payload.get("validity") or "DAY").upper(),
        "client_order_id": payload.get("client_order_id") or str(uuid.uuid4()),
    }
    return canonical


async def create_order(user_id: str, account_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    acc = await _get_account_for_user(user_id, account_id)
    plugin = await _get_plugin_for_account(acc)

    if acc.get("status") != "connected":
        raise AppError("VALIDATION", status=400, detail="Broker account is not connected")
    if not getattr(plugin, "supports_trading", False):
        raise AppError("VALIDATION", status=400, detail="Broker does not support live order placement")

    canonical = _validate_payload(payload)
    creds = {
        k: v for k, v in (acc.get("credentials_encrypted") or {}).items()
    }
    enc = __import__("core.security", fromlist=["get_encryption"]).get_encryption()
    decrypted = {key: enc.decrypt(value) for key, value in creds.items()}

    db = get_db()
    existing = await db.orders.find_one({"account_id": account_id, "client_order_id": canonical["client_order_id"]})
    if existing:
        raise AppError("VALIDATION", status=409, detail="Duplicate client_order_id")

    broker_result = await plugin.place_order(decrypted, canonical)
    order_id = broker_result.get("order_id") or canonical["client_order_id"]
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "order_id": order_id,
        "account_id": account_id,
        "user_id": user_id,
        "plugin_id": acc["plugin_id"],
        "client_order_id": canonical["client_order_id"],
        "symbol": canonical["symbol"],
        "exchange": canonical["exchange"],
        "side": canonical["side"],
        "quantity": canonical["quantity"],
        "order_type": canonical["order_type"],
        "product": canonical["product"],
        "status": (broker_result.get("status") or "PENDING").upper(),
        "raw": broker_result,
        "created_at": now,
        "updated_at": now,
    }
    await db.orders.insert_one(doc)
    await log_service.info("broker_order", f"Order placed: {order_id}", user_id=user_id, meta={"account_id": account_id})
    return {"ok": True, "order": doc}


async def get_orders(user_id: str, account_id: str | None = None, status: str | None = None) -> list[dict]:
    if account_id:
        acc = await _get_account_for_user(user_id, account_id)
        plugin = await _get_plugin_for_account(acc)
        if acc.get("status") != "connected":
            raise AppError("VALIDATION", status=400, detail="Broker account is not connected")
        enc = __import__("core.security", fromlist=["get_encryption"]).get_encryption()
        creds = {key: enc.decrypt(value) for key, value in (acc.get("credentials_encrypted") or {}).items()}
        return await plugin.get_orders(creds, status=status)
    db = get_db()
    query: dict[str, Any] = {"user_id": user_id}
    if account_id:
        query["account_id"] = account_id
    if status:
        query["status"] = status.upper()
    cursor = db.orders.find(query).sort("created_at", -1)
    out = []
    async for item in cursor:
        out.append(item)
    return out


async def get_order(user_id: str, order_id: str) -> dict:
    db = get_db()
    doc = await db.orders.find_one({"user_id": user_id, "order_id": order_id})
    if not doc:
        raise AppError("NOT_FOUND", status=404, detail="Order not found")
    return doc


async def refresh_order_status(user_id: str, account_id: str, order_id: str) -> dict:
    await _get_owned_order(user_id, account_id, order_id)
    acc = await _get_account_for_user(user_id, account_id)
    plugin = await _get_plugin_for_account(acc)
    if acc.get("status") != "connected":
        raise AppError("VALIDATION", status=400, detail="Broker account is not connected")
    enc = __import__("core.security", fromlist=["get_encryption"]).get_encryption()
    creds = {key: enc.decrypt(value) for key, value in (acc.get("credentials_encrypted") or {}).items()}
    if hasattr(plugin, "get_order_status"):
        data = await plugin.get_order_status(creds, order_id)
    else:
        raise AppError("VALIDATION", status=400, detail="Order status is not supported by this broker plugin")
    db = get_db()
    await db.orders.update_one({"user_id": user_id, "account_id": account_id, "order_id": order_id}, {"$set": {"status": (data.get("status") or "PENDING").upper(), "raw": data, "updated_at": datetime.now(timezone.utc).isoformat()}})
    return {"ok": True, "status": (data.get("status") or "PENDING").upper(), "data": data}


async def modify_order(user_id: str, account_id: str, order_id: str, changes: dict[str, Any]) -> dict[str, Any]:
    await _get_owned_order(user_id, account_id, order_id)
    acc = await _get_account_for_user(user_id, account_id)
    plugin = await _get_plugin_for_account(acc)
    if acc.get("status") != "connected":
        raise AppError("VALIDATION", status=400, detail="Broker account is not connected")
    if not hasattr(plugin, "modify_order"):
        raise AppError("VALIDATION", status=400, detail="Broker does not support order modification")
    enc = __import__("core.security", fromlist=["get_encryption"]).get_encryption()
    creds = {key: enc.decrypt(value) for key, value in (acc.get("credentials_encrypted") or {}).items()}
    result = await plugin.modify_order(creds, order_id, changes)
    db = get_db()
    await db.orders.update_one({"user_id": user_id, "account_id": account_id, "order_id": order_id}, {"$set": {"status": (result.get("status") or "PENDING").upper(), "raw": result, "updated_at": datetime.now(timezone.utc).isoformat()}})
    return {"ok": True, "result": result}


async def cancel_order(user_id: str, account_id: str, order_id: str) -> dict[str, Any]:
    await _get_owned_order(user_id, account_id, order_id)
    acc = await _get_account_for_user(user_id, account_id)
    plugin = await _get_plugin_for_account(acc)
    if acc.get("status") != "connected":
        raise AppError("VALIDATION", status=400, detail="Broker account is not connected")
    if not hasattr(plugin, "cancel_order"):
        raise AppError("VALIDATION", status=400, detail="Broker does not support order cancellation")
    enc = __import__("core.security", fromlist=["get_encryption"]).get_encryption()
    creds = {key: enc.decrypt(value) for key, value in (acc.get("credentials_encrypted") or {}).items()}
    result = await plugin.cancel_order(creds, order_id)
    db = get_db()
    await db.orders.update_one({"user_id": user_id, "account_id": account_id, "order_id": order_id}, {"$set": {"status": (result.get("status") or "CANCELLED").upper(), "raw": result, "updated_at": datetime.now(timezone.utc).isoformat()}})
    return {"ok": True, "result": result}


async def get_positions(user_id: str, account_id: str | None = None) -> list[dict[str, Any]]:
    acc = await _get_account_for_user(user_id, account_id or "")
    plugin = await _get_plugin_for_account(acc)
    if acc.get("status") != "connected":
        raise AppError("VALIDATION", status=400, detail="Broker account is not connected")
    enc = __import__("core.security", fromlist=["get_encryption"]).get_encryption()
    creds = {key: enc.decrypt(value) for key, value in (acc.get("credentials_encrypted") or {}).items()}
    return await plugin.get_positions(creds)


async def get_holdings(user_id: str, account_id: str | None = None) -> list[dict[str, Any]]:
    acc = await _get_account_for_user(user_id, account_id or "")
    plugin = await _get_plugin_for_account(acc)
    if acc.get("status") != "connected":
        raise AppError("VALIDATION", status=400, detail="Broker account is not connected")
    enc = __import__("core.security", fromlist=["get_encryption"]).get_encryption()
    creds = {key: enc.decrypt(value) for key, value in (acc.get("credentials_encrypted") or {}).items()}
    return await plugin.get_holdings(creds)


async def get_funds(user_id: str, account_id: str) -> dict[str, Any]:
    acc = await _get_account_for_user(user_id, account_id)
    plugin = await _get_plugin_for_account(acc)
    if acc.get("status") != "connected":
        raise AppError("VALIDATION", status=400, detail="Broker account is not connected")
    if not plugin.supports("funds"):
        raise AppError("VALIDATION", status=400, detail="Funds are not supported by this broker plugin")
    enc = __import__("core.security", fromlist=["get_encryption"]).get_encryption()
    creds = {key: enc.decrypt(value) for key, value in (acc.get("credentials_encrypted") or {}).items()}
    return await plugin.get_funds(creds)


async def get_trade_history(user_id: str, account_id: str | None = None) -> list[dict[str, Any]]:
    acc = await _get_account_for_user(user_id, account_id or "")
    plugin = await _get_plugin_for_account(acc)
    if acc.get("status") != "connected":
        raise AppError("VALIDATION", status=400, detail="Broker account is not connected")
    enc = __import__("core.security", fromlist=["get_encryption"]).get_encryption()
    creds = {key: enc.decrypt(value) for key, value in (acc.get("credentials_encrypted") or {}).items()}
    return await plugin.get_trade_history(creds)


async def get_market_quotes(user_id: str, account_id: str, symbols: list[str], exchange: str = "NSE") -> list[dict[str, Any]]:
    acc = await _get_account_for_user(user_id, account_id)
    plugin = await _get_plugin_for_account(acc)
    if acc.get("status") != "connected":
        raise AppError("VALIDATION", status=400, detail="Broker account is not connected")
    if not hasattr(plugin, "get_market_quotes"):
        raise AppError("VALIDATION", status=400, detail="Broker market data is not supported")
    enc = __import__("core.security", fromlist=["get_encryption"]).get_encryption()
    creds = {key: enc.decrypt(value) for key, value in (acc.get("credentials_encrypted") or {}).items()}
    return await plugin.get_market_quotes(creds, symbols, exchange)
