"""
Broker Router — /api/brokers
"""
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from modules.auth.deps import get_current_user
from modules.broker_core import service as svc

router = APIRouter(prefix="/api/brokers", tags=["brokers"])


class AddAccountBody(BaseModel):
    plugin_id: str = Field(min_length=1)
    label: str = Field(min_length=1, max_length=64)
    credentials: dict


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
