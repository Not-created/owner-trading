"""
Broker Core Service — canonical broker account lifecycle.

Responsibilities:
- broker plugin discovery
- encrypted broker credential storage
- broker account creation/removal
- broker connection testing
- broker connect/disconnect lifecycle
- primary broker-account selection
- safe account information retrieval
- broker health persistence
- audit logging

This service is broker-neutral.

Broker-specific API/trading logic MUST remain inside broker plugins.
Order execution, positions, strategies, risk management and backtesting
belong to their own modules and must not be implemented here.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from core.database import get_db
from core.error_handling import AppError
from core.logging_service import log_service
from core.security import get_encryption
from modules.broker_core.registry import broker_registry


# ----------------------------------------------------------------------
# Internal helpers
# ----------------------------------------------------------------------


def _utc_now() -> str:
    """Return a consistent UTC ISO-8601 timestamp."""

    return datetime.now(timezone.utc).isoformat()


def _require_plugin(plugin_id: str):
    """
    Resolve a registered broker plugin.

    The service never contains a hard-coded broker list.
    """

    plugin_id = str(plugin_id or "").strip()

    if not plugin_id:
        raise AppError(
            "VALIDATION",
            status=400,
            detail="Broker plugin_id is required",
        )

    plugin = broker_registry.get(plugin_id)

    if plugin is None:
        raise AppError(
            "NOT_FOUND",
            status=404,
            detail="Broker plugin not registered",
        )

    return plugin


def _safe_account_document(account: dict[str, Any]) -> dict[str, Any]:
    """
    Convert a MongoDB broker-account document into a frontend-safe object.

    Encrypted credentials are NEVER returned.
    """

    return {
        "account_id": account.get("account_id"),
        "plugin_id": account.get("plugin_id"),
        "label": account.get("label"),
        "status": account.get("status", "disconnected"),
        "is_primary": bool(account.get("is_primary", False)),
        "created_at": account.get("created_at"),
        "updated_at": account.get("updated_at"),
        "last_health": account.get("last_health"),
    }


def _decrypt_credentials(account: dict[str, Any]) -> dict[str, str]:
    """
    Decrypt credentials only at the point where the broker adapter needs them.

    Credentials must never be returned to API callers or written to logs.
    """

    encrypted = account.get("credentials_encrypted") or {}

    if not isinstance(encrypted, dict):
        raise AppError(
            "BROKER_CREDENTIALS_INVALID",
            status=500,
            detail="Stored broker credentials are invalid",
        )

    try:
        encryption = get_encryption()

        return {
            key: encryption.decrypt(value)
            for key, value in encrypted.items()
        }
    except Exception as exc:
        # Do not expose encryption internals or credential material.
        raise AppError(
            "BROKER_CREDENTIALS_ERROR",
            status=500,
            detail="Unable to decrypt broker credentials",
        ) from exc


async def _get_owned_account(
    user_id: str,
    account_id: str,
) -> dict[str, Any]:
    """
    Fetch an account belonging to the requesting user.

    Ownership is always checked at the database query boundary.
    """

    account_id = str(account_id or "").strip()

    if not account_id:
        raise AppError(
            "VALIDATION",
            status=400,
            detail="Account ID is required",
        )

    db = get_db()

    account = await db.broker_accounts.find_one(
        {
            "user_id": user_id,
            "account_id": account_id,
        }
    )

    if not account:
        raise AppError(
            "NOT_FOUND",
            status=404,
            detail="Broker account not found",
        )

    return account


# ----------------------------------------------------------------------
# Plugin discovery
# ----------------------------------------------------------------------


async def list_plugins() -> list[dict[str, Any]]:
    """
    Return safe metadata for currently registered broker plugins.

    Registration is controlled by broker_plugins/bootstrap.py.
    This service does not add or remove broker implementations.
    """

    return broker_registry.list_safe()


# ----------------------------------------------------------------------
# Account listing
# ----------------------------------------------------------------------


async def list_accounts(user_id: str) -> list[dict[str, Any]]:
    """
    List broker accounts belonging only to the current user.

    Credential material is never returned.
    """

    db = get_db()

    cursor = db.broker_accounts.find(
        {"user_id": user_id},
        {
            "_id": 0,
            "credentials_encrypted": 0,
        },
    )

    accounts: list[dict[str, Any]] = []

    async for account in cursor:
        accounts.append(_safe_account_document(account))

    return accounts


# ----------------------------------------------------------------------
# Account creation
# ----------------------------------------------------------------------


async def add_account(
    user_id: str,
    plugin_id: str,
    label: str,
    credentials: dict[str, Any],
) -> dict[str, Any]:
    """
    Create a broker account with encrypted credentials.

    The account starts disconnected.

    No broker connection is attempted automatically. The caller must
    explicitly use connect_account() or test_connection().
    """

    plugin = _require_plugin(plugin_id)

    if not isinstance(credentials, dict) or not credentials:
        raise AppError(
            "VALIDATION",
            status=400,
            detail="Broker credentials are required",
        )

    missing = plugin.validate_credentials(credentials)

    if missing:
        raise AppError(
            "VALIDATION",
            status=400,
            detail=f"Missing: {', '.join(missing)}",
        )

    clean_label = str(label or "").strip()

    if not clean_label:
        raise AppError(
            "VALIDATION",
            status=400,
            detail="Broker account label is required",
        )

    # Encrypt every supplied credential before persistence.
    encryption = get_encryption()

    try:
        encrypted_credentials = {
            key: encryption.encrypt(str(value))
            for key, value in credentials.items()
        }
    except Exception as exc:
        raise AppError(
            "BROKER_CREDENTIALS_ERROR",
            status=500,
            detail="Unable to encrypt broker credentials",
        ) from exc

    account_id = uuid.uuid4().hex
    now = _utc_now()

    db = get_db()

    await db.broker_accounts.insert_one(
        {
            "account_id": account_id,
            "user_id": user_id,
            "plugin_id": plugin.plugin_id,
            "label": clean_label,
            "credentials_encrypted": encrypted_credentials,
            "status": "disconnected",
            "is_primary": False,
            "created_at": now,
            "updated_at": now,
        }
    )

    await log_service.info(
        "broker",
        f"Broker account added: {plugin.plugin_id}/{clean_label}",
        user_id=user_id,
    )

    return {
        "account_id": account_id,
        "plugin_id": plugin.plugin_id,
        "label": clean_label,
        "status": "disconnected",
        "is_primary": False,
    }


# ----------------------------------------------------------------------
# Account removal
# ----------------------------------------------------------------------


async def remove_account(
    user_id: str,
    account_id: str,
) -> None:
    """
    Remove a broker account owned by the current user.

    If the account is connected, attempt a broker disconnect first.
    Database removal remains scoped to the owning user.
    """

    account = await _get_owned_account(user_id, account_id)

    plugin = broker_registry.get(account.get("plugin_id"))

    if account.get("status") == "connected" and plugin:
        try:
            await plugin.disconnect(account["account_id"])
        except Exception:
            # Disconnect failures must not expose broker credentials or
            # provider internals. The account can still be removed.
            pass

    db = get_db()

    result = await db.broker_accounts.delete_one(
        {
            "user_id": user_id,
            "account_id": account["account_id"],
        }
    )

    if result.deleted_count == 0:
        raise AppError(
            "NOT_FOUND",
            status=404,
            detail="Broker account not found",
        )

    await log_service.info(
        "broker",
        f"Broker account removed: {account.get('plugin_id')}/{account['account_id']}",
        user_id=user_id,
    )


# ----------------------------------------------------------------------
# Primary account
# ----------------------------------------------------------------------


async def set_primary(
    user_id: str,
    account_id: str,
) -> None:
    """
    Mark one broker account as the user's primary account.

    Primary selection is user-scoped; accounts belonging to another
    user can never be modified.
    """

    account = await _get_owned_account(user_id, account_id)

    db = get_db()

    # Clear the existing primary account for this user only.
    await db.broker_accounts.update_many(
        {"user_id": user_id},
        {"$set": {"is_primary": False}},
    )

    # Set the requested account as primary, again scoped to the owner.
    await db.broker_accounts.update_one(
        {
            "user_id": user_id,
            "account_id": account["account_id"],
        },
        {
            "$set": {
                "is_primary": True,
                "updated_at": _utc_now(),
            }
        },
    )

    await log_service.info(
        "broker",
        f"Primary broker account changed: {account.get('plugin_id')}/{account['account_id']}",
        user_id=user_id,
    )


# ----------------------------------------------------------------------
# Connect
# ----------------------------------------------------------------------


async def connect_account(
    user_id: str,
    account_id: str,
) -> dict[str, Any]:
    """
    Connect a stored broker account through its registered adapter.

    Credentials are decrypted only for the adapter call.
    """

    account = await _get_owned_account(user_id, account_id)
    plugin = _require_plugin(account.get("plugin_id"))

    credentials = _decrypt_credentials(account)

    try:
        health = await plugin.connect(credentials)
    except Exception as exc:
        db = get_db()

        await db.broker_accounts.update_one(
            {
                "user_id": user_id,
                "account_id": account["account_id"],
            },
            {
                "$set": {
                    "status": "error",
                    "last_health": {
                        "ok": False,
                        "detail": "Broker connection failed",
                        "latency_ms": 0,
                    },
                    "updated_at": _utc_now(),
                }
            },
        )

        await log_service.error(
            "broker",
            f"Broker connection failed: {account.get('plugin_id')}/{account['account_id']}",
            user_id=user_id,
        )

        raise AppError(
            "BROKER_CONNECTION_FAILED",
            status=502,
            detail="Broker connection failed",
        ) from exc

    status = "connected" if health.ok else "error"

    health_data = {
        "ok": bool(health.ok),
        "detail": str(health.detail or ""),
        "latency_ms": int(health.latency_ms or 0),
        "checked_at": _utc_now(),
    }

    db = get_db()

    await db.broker_accounts.update_one(
        {
            "user_id": user_id,
            "account_id": account["account_id"],
        },
        {
            "$set": {
                "status": status,
                "last_health": health_data,
                "updated_at": _utc_now(),
            }
        },
    )

    await log_service.info(
        "broker",
        f"Broker connection status: {account.get('plugin_id')}/{account['account_id']}={status}",
        user_id=user_id,
    )

    return {
        "ok": bool(health.ok),
        "detail": health.detail,
        "latency_ms": health.latency_ms,
        "status": status,
    }


# ----------------------------------------------------------------------
# Disconnect
# ----------------------------------------------------------------------


async def disconnect_account(
    user_id: str,
    account_id: str,
) -> None:
    """
    Disconnect a broker account and persist disconnected state.

    Provider disconnect failures are intentionally isolated so local
    account state can still be marked disconnected.
    """

    account = await _get_owned_account(user_id, account_id)
    plugin = broker_registry.get(account.get("plugin_id"))

    if plugin:
        try:
            await plugin.disconnect(account["account_id"])
        except Exception:
            await log_service.warning(
                "broker",
                f"Broker disconnect returned an error: "
                f"{account.get('plugin_id')}/{account['account_id']}",
                user_id=user_id,
            )

    db = get_db()

    await db.broker_accounts.update_one(
        {
            "user_id": user_id,
            "account_id": account["account_id"],
        },
        {
            "$set": {
                "status": "disconnected",
                "updated_at": _utc_now(),
            }
        },
    )

    await log_service.info(
        "broker",
        f"Broker account disconnected: {account.get('plugin_id')}/{account['account_id']}",
        user_id=user_id,
    )


# ----------------------------------------------------------------------
# Connection test
# ----------------------------------------------------------------------


async def test_connection(
    user_id: str,
    account_id: str,
) -> dict[str, Any]:
    """
    Test broker connectivity without changing the stored account's
    connection status.

    The adapter's connect() contract is used as the canonical test.
    """

    account = await _get_owned_account(user_id, account_id)
    plugin = _require_plugin(account.get("plugin_id"))

    credentials = _decrypt_credentials(account)

    try:
        health = await plugin.connect(credentials)
    except Exception as exc:
        await log_service.warning(
            "broker",
            f"Broker connection test failed: "
            f"{account.get('plugin_id')}/{account['account_id']}",
            user_id=user_id,
        )

        raise AppError(
            "BROKER_CONNECTION_FAILED",
            status=502,
            detail="Broker connection test failed",
        ) from exc

    return {
        "ok": bool(health.ok),
        "detail": health.detail,
        "latency_ms": health.latency_ms,
    }


# ----------------------------------------------------------------------
# Account information
# ----------------------------------------------------------------------


async def get_account_info(
    user_id: str,
    account_id: str,
) -> dict[str, Any]:
    """
    Return broker account information supplied by the adapter.

    Sensitive credential fields are filtered defensively before returning
    anything to the caller.
    """

    account = await _get_owned_account(user_id, account_id)
    plugin = _require_plugin(account.get("plugin_id"))

    credentials = _decrypt_credentials(account)

    try:
        info = await plugin.account_info(credentials)
    except Exception as exc:
        raise AppError(
            "BROKER_ACCOUNT_INFO_FAILED",
            status=502,
            detail="Unable to retrieve broker account information",
        ) from exc

    if not isinstance(info, dict):
        return {}

    blocked_keys = {
        "password",
        "secret",
        "token",
        "api_secret",
        "api_key",
        "access_token",
        "refresh_token",
        "authorization",
        "credentials",
        "credentials_encrypted",
    }

    return {
        key: value
        for key, value in info.items()
        if str(key).lower() not in blocked_keys
    }
