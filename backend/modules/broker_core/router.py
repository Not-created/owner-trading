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
    """
    Disconnect a stored broker account.
    """

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
    """
    Test broker connectivity without changing the stored account
    connection status.
    """

    return await svc.test_connection(
        _user_id(user),
        account_id,
    )


# ----------------------------------------------------------------------
# Broker account information
# ----------------------------------------------------------------------


@router.get(
    "/accounts/{account_id}/info"
)
async def account_info(
    account_id: str,
    user: dict[str, Any] = Depends(
        get_current_user
    ),
) -> dict[str, Any]:
    """
    Return safe broker account information.

    Sensitive credential material is filtered by Broker Core Service.
    """

    return await svc.get_account_info(
        _user_id(user),
        account_id,
    )
