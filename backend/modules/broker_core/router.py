"""
Broker API Router — /api/brokers

This module is the HTTP/API boundary for the universal broker system.

Responsibilities:
- authenticated broker discovery
- authenticated broker-account management
- connection lifecycle
- primary-account selection
- safe account information retrieval

Broker-specific logic belongs to broker_plugins/.
Account lifecycle belongs to broker_core.service.
Trading execution, orders, positions, strategies, risk and backtesting
must NOT be implemented in this router.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field

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


router = APIRouter(
    prefix="/api/brokers",
    tags=["brokers"],
)


# ----------------------------------------------------------------------
# Request models
# ----------------------------------------------------------------------


class AddAccountBody(BaseModel):
    """
    Request body for creating a broker account.

    Credentials are accepted as a dictionary because every supported
    broker can have a different credential schema.

    The actual required fields are validated by the selected
    BrokerPluginBase implementation.
    """

    model_config = ConfigDict(extra="forbid")

    plugin_id: str = Field(
        min_length=1,
        max_length=64,
    )

    label: str = Field(
        min_length=1,
        max_length=64,
    )

    credentials: dict[str, Any] = Field(
        min_length=1,
    )


# ----------------------------------------------------------------------
# Internal helpers
# ----------------------------------------------------------------------


def _user_id(
    user: dict[str, Any],
) -> str:
    """
    Extract the authenticated user's stable ID.

    All broker service operations are explicitly scoped to this ID.
    """

    value = user.get("_id")

    if value is None:
        raise ValueError(
            "Authenticated user has no ID"
        )

    return str(value)


# ----------------------------------------------------------------------
# Broker plugin discovery
# ----------------------------------------------------------------------


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
async def plugins(
    user: dict[str, Any] = Depends(
        get_current_user
    ),
) -> dict[str, list[dict[str, Any]]]:
    """
    Return safe metadata for installed broker plugins.

    No broker credentials or secrets are returned.
    """

    _user_id(user)

    return {
        "plugins": await svc.list_plugins(),
    }


# ----------------------------------------------------------------------
# Broker accounts
# ----------------------------------------------------------------------


@router.get("/accounts")
async def accounts(
    user: dict[str, Any] = Depends(
        get_current_user
    ),
) -> dict[str, list[dict[str, Any]]]:
    """
    Return broker accounts belonging to the authenticated user.

    Stored credentials are never exposed.
    """

    return {
        "accounts": await svc.list_accounts(
            _user_id(user)
        ),
    }


@router.post("/accounts")
async def add_account(
    body: AddAccountBody,
    user: dict[str, Any] = Depends(
        get_current_user
    ),
) -> dict[str, Any]:
    """
    Create a broker account.

    Credentials are passed directly to the broker service where they
    are validated and encrypted before persistence.
    """

    return await svc.add_account(
        user_id=_user_id(user),
        plugin_id=body.plugin_id.strip(),
        label=body.label.strip(),
        credentials=body.credentials,
    )


@router.delete(
    "/accounts/{account_id}"
)
async def remove_account(
    account_id: str,
    user: dict[str, Any] = Depends(
        get_current_user
    ),
) -> dict[str, bool]:
    """
    Remove an authenticated user's broker account.

    Ownership validation is performed by Broker Core Service.
    """

    await svc.remove_account(
        _user_id(user),
        account_id,
    )

    return {
        "ok": True,
    }


# ----------------------------------------------------------------------
# Primary broker account
# ----------------------------------------------------------------------


@router.post(
    "/accounts/{account_id}/primary"
)
async def make_primary(
    account_id: str,
    user: dict[str, Any] = Depends(
        get_current_user
    ),
) -> dict[str, bool]:
    """
    Make one of the authenticated user's broker accounts primary.
    """

    await svc.set_primary(
        _user_id(user),
        account_id,
    )

    return {
        "ok": True,
    }


# ----------------------------------------------------------------------
# Connection lifecycle
# ----------------------------------------------------------------------


@router.post(
    "/accounts/{account_id}/connect"
)
async def connect(
    account_id: str,
    user: dict[str, Any] = Depends(
        get_current_user
    ),
) -> dict[str, Any]:
    """
    Connect a stored broker account through its registered adapter.
    """

    return await svc.connect_account(
        _user_id(user),
        account_id,
    )


@router.post(
    "/accounts/{account_id}/disconnect"
)
async def disconnect(
    account_id: str,
    user: dict[str, Any] = Depends(
        get_current_user
    ),
) -> dict[str, bool]:
    """Disconnect a stored broker account."""

    await svc.disconnect_account(
        _user_id(user),
        account_id,
    )

    return {
        "ok": True,
    }


@router.post(
    "/accounts/{account_id}/test"
)
async def test_connection(
    account_id: str,
    user: dict[str, Any] = Depends(
        get_current_user
    ),
) -> dict[str, Any]:
    """Test broker connectivity without changing account status."""

    return await svc.test_connection(
        _user_id(user),
        account_id,
    )


@router.get(
    "/accounts/{account_id}/info"
)
async def account_info(
    account_id: str,
    user: dict[str, Any] = Depends(
        get_current_user
    ),
) -> dict[str, Any]:
    """Return safe broker account information."""

    return await svc.get_account_info(
        _user_id(user),
        account_id,
    )


@router.post("/orders")
async def place_order(
    body: OrderCreateBody,
    user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    return await create_order(
        _user_id(user),
        body.account_id,
        body.model_dump(),
    )


@router.get("/orders")
async def list_orders(
    user: dict[str, Any] = Depends(get_current_user),
    account_id: str | None = None,
    status: str | None = None,
) -> dict[str, list[dict[str, Any]]]:
    return {
        "orders": await get_orders(
            _user_id(user),
            account_id=account_id,
            status=status,
        )
    }


@router.get("/orders/{order_id}")
async def fetch_order(
    order_id: str,
    user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    return await get_order(
        _user_id(user),
        order_id,
    )


@router.post("/orders/{order_id}/status")
async def order_status(
    order_id: str,
    account_id: str,
    user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    return await refresh_order_status(
        _user_id(user),
        account_id,
        order_id,
    )


@router.post("/orders/{order_id}/modify")
async def modify_order_route(
    order_id: str,
    account_id: str,
    payload: dict[str, Any],
    user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    return await modify_order(
        _user_id(user),
        account_id,
        order_id,
        payload,
    )


@router.post("/orders/{order_id}/cancel")
async def cancel_order_route(
    order_id: str,
    account_id: str,
    user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    return await cancel_order(
        _user_id(user),
        account_id,
        order_id,
    )


@router.get("/positions")
async def fetch_positions(
    user: dict[str, Any] = Depends(get_current_user),
    account_id: str | None = None,
) -> dict[str, list[dict[str, Any]]]:
    return {
        "positions": await get_positions(
            _user_id(user),
            account_id=account_id,
        )
    }


@router.get("/holdings")
async def fetch_holdings(
    user: dict[str, Any] = Depends(get_current_user),
    account_id: str | None = None,
) -> dict[str, list[dict[str, Any]]]:
    return {
        "holdings": await get_holdings(
            _user_id(user),
            account_id=account_id,
        )
    }


@router.get("/funds/{account_id}")
async def fetch_funds(
    account_id: str,
    user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    return await get_funds(
        _user_id(user),
        account_id,
    )


@router.get("/trade-history")
async def fetch_trade_history(
    user: dict[str, Any] = Depends(get_current_user),
    account_id: str | None = None,
) -> dict[str, list[dict[str, Any]]]:
    return {
        "trade_history": await get_trade_history(
            _user_id(user),
            account_id=account_id,
        )
    }
