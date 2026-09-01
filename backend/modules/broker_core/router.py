"""
Broker Router — /api/brokers
"""
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from modules.auth.deps import get_current_user
from modules.broker_core import service as svc
from modules.broker_core.orders import (
    cancel_order,
    create_order,
    get_funds,
    get_holdings,
    get_order,
    get_orders,
    get_positions,
    get_trade_history,
    modify_order,
    refresh_order_status,
)

router = APIRouter(prefix="/api/brokers", tags=["brokers"])


class AddAccountBody(BaseModel):
    plugin_id: str = Field(min_length=1)
    label: str = Field(min_length=1, max_length=64)
    credentials: dict


class OrderCreateBody(BaseModel):
    account_id: str = Field(min_length=1)
    symbol: str = Field(min_length=1)
    exchange: str = Field(min_length=1)
    side: str = Field(min_length=1)
    quantity: int = Field(gt=0)
    order_type: str = Field(min_length=1)
    product: str | None = None
    price: float | None = None
    trigger_price: float | None = None
    validity: str | None = None
    client_order_id: str | None = None


@router.get("/plugins")
async def plugins(user=Depends(get_current_user)):
    return {"plugins": await svc.list_plugins()}


@router.get("/accounts")
async def accounts(user=Depends(get_current_user)):
    return {"accounts": await svc.list_accounts(str(user["_id"]))}


@router.post("/accounts")
async def add_account(body: AddAccountBody, user=Depends(get_current_user)):
    return await svc.add_account(str(user["_id"]), body.plugin_id, body.label, body.credentials)


@router.delete("/accounts/{account_id}")
async def remove_account(account_id: str, user=Depends(get_current_user)):
    await svc.remove_account(str(user["_id"]), account_id)
    return {"ok": True}


@router.post("/accounts/{account_id}/primary")
async def make_primary(account_id: str, user=Depends(get_current_user)):
    await svc.set_primary(str(user["_id"]), account_id)
    return {"ok": True}


@router.post("/accounts/{account_id}/connect")
async def connect(account_id: str, user=Depends(get_current_user)):
    return await svc.connect_account(str(user["_id"]), account_id)


@router.post("/accounts/{account_id}/disconnect")
async def disconnect(account_id: str, user=Depends(get_current_user)):
    await svc.disconnect_account(str(user["_id"]), account_id)
    return {"ok": True}


@router.post("/accounts/{account_id}/test")
async def test_connection(account_id: str, user=Depends(get_current_user)):
    return await svc.test_connection(str(user["_id"]), account_id)


@router.get("/accounts/{account_id}/info")
async def account_info(account_id: str, user=Depends(get_current_user)):
    return await svc.get_account_info(str(user["_id"]), account_id)


@router.post("/orders")
async def place_order(body: OrderCreateBody, user=Depends(get_current_user)):
    return await create_order(str(user["_id"]), body.account_id, body.model_dump())


@router.get("/orders")
async def list_orders(user=Depends(get_current_user), account_id: str | None = None, status: str | None = None):
    return {"orders": await get_orders(str(user["_id"]), account_id=account_id, status=status)}


@router.get("/orders/{order_id}")
async def fetch_order(order_id: str, user=Depends(get_current_user)):
    return await get_order(str(user["_id"]), order_id)


@router.post("/orders/{order_id}/status")
async def order_status(order_id: str, account_id: str, user=Depends(get_current_user)):
    return await refresh_order_status(str(user["_id"]), account_id, order_id)


@router.post("/orders/{order_id}/modify")
async def modify_order_route(order_id: str, account_id: str, payload: dict, user=Depends(get_current_user)):
    return await modify_order(str(user["_id"]), account_id, order_id, payload)


@router.post("/orders/{order_id}/cancel")
async def cancel_order_route(order_id: str, account_id: str, user=Depends(get_current_user)):
    return await cancel_order(str(user["_id"]), account_id, order_id)


@router.get("/positions")
async def fetch_positions(user=Depends(get_current_user), account_id: str | None = None):
    return {"positions": await get_positions(str(user["_id"]), account_id=account_id)}


@router.get("/holdings")
async def fetch_holdings(user=Depends(get_current_user), account_id: str | None = None):
    return {"holdings": await get_holdings(str(user["_id"]), account_id=account_id)}


@router.get("/funds/{account_id}")
async def fetch_funds(account_id: str, user=Depends(get_current_user)):
    return await get_funds(str(user["_id"]), account_id)


@router.get("/trade-history")
async def fetch_trade_history(user=Depends(get_current_user), account_id: str | None = None):
    return {"trade_history": await get_trade_history(str(user["_id"]), account_id=account_id)}
