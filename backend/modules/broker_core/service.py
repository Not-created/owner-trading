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


def _safe_account_document(
    account: dict[str, Any],
) -> dict[str, Any]:
    """
    Convert a MongoDB broker-account document into a frontend-safe object.

    Encrypted credentials are NEVER returned.
    """

    return {
        "account_id": account.get("account_id"),
        "plugin_id": account.get("plugin_id"),
        "label": account.get("label"),
        "status": account.get(
            "status",
            "disconnected",
        ),
        "is_primary": bool(
            account.get(
                "is_primary",
                False,
            )
        ),
        "created_at": account.get(
            "created_at"
        ),
        "updated_at": account.get(
            "updated_at"
        ),
        "last_health": account.get(
            "last_health"
        ),
    }


def _decrypt_credentials(
    account: dict[str, Any],
) -> dict[str, str]:
    """
    Decrypt credentials only at the point where the broker adapter needs them.

    Credentials must never be returned to API callers or written to logs.
    """

    encrypted = (
        account.get(
            "credentials_encrypted"
        )
        or {}
    )

    if not isinstance(
        encrypted,
        dict,
    ):
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

    account_id = str(
        account_id or ""
    ).strip()

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


async def list_accounts(
    user_id: str,
) -> list[dict[str, Any]]:
    """
    List broker accounts belonging only to the current user.

    Credential material is never returned.
    """

    db = get_db()

    cursor = db.broker_accounts.find(
        {
            "user_id": user_id,
        },
        {
            "_id": 0,
            "credentials_encrypted": 0,
        },
    )

    accounts: list[dict[str, Any]] = []

    async for account in cursor:
        accounts.append(
            _safe_account_document(
                account
            )
        )

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

    plugin = _require_plugin(
        plugin_id
    )

    if (
        not isinstance(
            credentials,
            dict,
        )
        or not credentials
    ):
        raise AppError(
            "VALIDATION",
            status=400,
            detail="Broker credentials are required",
        )

    missing = plugin.validate_credentials(
        credentials
    )

    if missing:
        raise AppError(
            "VALIDATION",
            status=400,
            detail=(
                "Missing: "
                + ", ".join(missing)
            ),
        )

    clean_label = str(
        label or ""
    ).strip()

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
            key: encryption.encrypt(
                str(value)
            )
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
        (
            "Broker account added: "
            f"{plugin.plugin_id}/{clean_label}"
        ),
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

    account = await _get_owned_account(
        user_id,
        account_id,
    )

    plugin = broker_registry.get(
        account.get(
            "plugin_id"
        )
    )

    if (
        account.get("status")
        == "connected"
        and plugin
    ):
        try:
            await plugin.disconnect(
                account["account_id"]
            )
        except Exception:
            # Disconnect failures must not expose broker credentials or
            # provider internals. The account can still be removed.
            pass

    db = get_db()

    result = await db.broker_accounts.delete_one(
        {
            "user_id": user_id,
            "account_id": account[
                "account_id"
            ],
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
        (
            "Broker account removed: "
            f"{account.get('plugin_id')}/"
            f"{account['account_id']}"
        ),
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

    account = await _get_owned_account(
        user_id,
        account_id,
    )

    db = get_db()

    # Clear the existing primary account for this user only.
    await db.broker_accounts.update_many(
        {
            "user_id": user_id,
        },
        {
            "$set": {
                "is_primary": False,
            }
        },
    )

    # Set the requested account as primary, again scoped to the owner.
    await db.broker_accounts.update_one(
        {
            "user_id": user_id,
            "account_id": account[
                "account_id"
            ],
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
        (
            "Primary broker account changed: "
            f"{account.get('plugin_id')}/"
            f"{account['account_id']}"
        ),
        user_id=user_id,
    )
    # ----------------------------------------------------------------------
# Connection lifecycle
# ----------------------------------------------------------------------


async def _save_health(
    user_id: str,
    account_id: str,
    ok: bool,
    detail: str | None = None,
    latency_ms: float | int | None = None,
) -> None:
    """
    Persist the latest broker health result.

    Only non-sensitive operational information is stored.
    """

    db = get_db()

    health = {
        "ok": bool(ok),
        "detail": str(detail)
        if detail is not None
        else None,
        "checked_at": _utc_now(),
    }

    if latency_ms is not None:
        health["latency_ms"] = latency_ms

    await db.broker_accounts.update_one(
        {
            "user_id": user_id,
            "account_id": account_id,
        },
        {
            "$set": {
                "last_health": health,
                "updated_at": _utc_now(),
            }
        },
    )


async def test_connection(
    user_id: str,
    account_id: str,
) -> dict[str, Any]:
    """
    Test the broker connection without changing the intended account state.

    The plugin receives decrypted credentials internally.
    Credential values never leave this service.
    """

    account = await _get_owned_account(
        user_id,
        account_id,
    )

    plugin = _require_plugin(
        account.get("plugin_id")
    )

    credentials = _decrypt_credentials(
        account
    )

    started = datetime.now(
        timezone.utc
    )

    try:
        result = await plugin.test_connection(
            credentials
        )

        elapsed = (
            datetime.now(
                timezone.utc
            )
            - started
        ).total_seconds() * 1000

        latency_ms = round(
            elapsed,
            2,
        )

        result = (
            result
            if isinstance(
                result,
                dict,
            )
            else {
                "ok": bool(result),
            }
        )

        ok = bool(
            result.get(
                "ok",
                False,
            )
        )

        detail = result.get(
            "detail"
        )

        await _save_health(
            user_id=user_id,
            account_id=account_id,
            ok=ok,
            detail=detail,
            latency_ms=latency_ms,
        )

        if ok:
            await log_service.info(
                "broker",
                (
                    "Broker connection test passed: "
                    f"{account.get('plugin_id')}/"
                    f"{account_id}"
                ),
                user_id=user_id,
            )
        else:
            await log_service.warning(
                "broker",
                (
                    "Broker connection test failed: "
                    f"{account.get('plugin_id')}/"
                    f"{account_id}"
                ),
                user_id=user_id,
            )

        return {
            "ok": ok,
            "detail": detail,
            "latency_ms": latency_ms,
        }

    except Exception as exc:
        elapsed = (
            datetime.now(
                timezone.utc
            )
            - started
        ).total_seconds() * 1000

        latency_ms = round(
            elapsed,
            2,
        )

        await _save_health(
            user_id=user_id,
            account_id=account_id,
            ok=False,
            detail="Broker connection test failed",
            latency_ms=latency_ms,
        )

        await log_service.warning(
            "broker",
            (
                "Broker connection test failed: "
                f"{account.get('plugin_id')}/"
                f"{account_id}"
            ),
            user_id=user_id,
        )

        return {
            "ok": False,
            "detail": "Broker connection test failed",
            "latency_ms": latency_ms,
        }


async def connect_account(
    user_id: str,
    account_id: str,
) -> dict[str, Any]:
    """
    Establish a live broker session for an owned account.
    """

    account = await _get_owned_account(
        user_id,
        account_id,
    )

    plugin = _require_plugin(
        account.get("plugin_id")
    )

    if account.get("status") == "connected":
        return {
            "ok": True,
            "detail": "Already connected",
            "latency_ms": 0,
        }

    db = get_db()

    await db.broker_accounts.update_one(
        {
            "user_id": user_id,
            "account_id": account_id,
        },
        {
            "$set": {
                "status": "connecting",
                "updated_at": _utc_now(),
            }
        },
    )

    credentials = _decrypt_credentials(
        account
    )

    started = datetime.now(
        timezone.utc
    )

    try:
        result = await plugin.connect(
            account_id=account_id,
            credentials=credentials,
        )

        elapsed = (
            datetime.now(
                timezone.utc
            )
            - started
        ).total_seconds() * 1000

        latency_ms = round(
            elapsed,
            2,
        )

        result = (
            result
            if isinstance(
                result,
                dict,
            )
            else {
                "ok": bool(result),
            }
        )

        ok = bool(
            result.get(
                "ok",
                False,
            )
        )

        detail = result.get(
            "detail"
        )

        if not ok:
            await db.broker_accounts.update_one(
                {
                    "user_id": user_id,
                    "account_id": account_id,
                },
                {
                    "$set": {
                        "status": "error",
                        "last_health": {
                            "ok": False,
                            "detail": detail
                            or "Broker connection failed",
                            "latency_ms": latency_ms,
                            "checked_at": _utc_now(),
                        },
                        "updated_at": _utc_now(),
                    }
                },
            )

            return {
                "ok": False,
                "detail": detail
                or "Broker connection failed",
                "latency_ms": latency_ms,
            }

        await db.broker_accounts.update_one(
            {
                "user_id": user_id,
                "account_id": account_id,
            },
            {
                "$set": {
                    "status": "connected",
                    "last_health": {
                        "ok": True,
                        "detail": detail
                        or "Connected",
                        "latency_ms": latency_ms,
                        "checked_at": _utc_now(),
                    },
                    "updated_at": _utc_now(),
                }
            },
        )

        await log_service.info(
            "broker",
            (
                "Broker connected: "
                f"{account.get('plugin_id')}/"
                f"{account_id}"
            ),
            user_id=user_id,
        )

        return {
            "ok": True,
            "detail": detail
            or "Connected",
            "latency_ms": latency_ms,
        }

    except Exception as exc:
        await db.broker_accounts.update_one(
            {
                "user_id": user_id,
                "account_id": account_id,
            },
            {
                "$set": {
                    "status": "error",
                    "last_health": {
                        "ok": False,
                        "detail": "Broker connection failed",
                        "checked_at": _utc_now(),
                    },
                    "updated_at": _utc_now(),
                }
            },
        )

        await log_service.warning(
            "broker",
            (
                "Broker connection failed: "
                f"{account.get('plugin_id')}/"
                f"{account_id}"
            ),
            user_id=user_id,
        )

        return {
            "ok": False,
            "detail": "Broker connection failed",
        }


async def disconnect_account(
    user_id: str,
    account_id: str,
) -> dict[str, Any]:
    """
    Close a live broker session for an owned account.
    """

    account = await _get_owned_account(
        user_id,
        account_id,
    )

    plugin = _require_plugin(
        account.get("plugin_id")
    )

    if account.get("status") != "connected":
        return {
            "ok": True,
            "detail": "Already disconnected",
        }

    try:
        result = await plugin.disconnect(
            account_id
        )

        result = (
            result
            if isinstance(
                result,
                dict,
            )
            else {
                "ok": bool(result),
            }
        )

        ok = bool(
            result.get(
                "ok",
                True,
            )
        )

        detail = result.get(
            "detail"
        )

        if not ok:
            raise RuntimeError(
                "Broker disconnect failed"
            )

    except Exception:
        await log_service.warning(
            "broker",
            (
                "Broker disconnect failed: "
                f"{account.get('plugin_id')}/"
                f"{account_id}"
            ),
            user_id=user_id,
        )

        raise AppError(
            "BROKER_DISCONNECT_FAILED",
            status=502,
            detail="Unable to disconnect broker",
        )

    db = get_db()

    await db.broker_accounts.update_one(
        {
            "user_id": user_id,
            "account_id": account_id,
        },
        {
            "$set": {
                "status": "disconnected",
                "last_health": {
                    "ok": True,
                    "detail": "Disconnected",
                    "checked_at": _utc_now(),
                },
                "updated_at": _utc_now(),
            }
        },
    )

    await log_service.info(
        "broker",
        (
            "Broker disconnected: "
            f"{account.get('plugin_id')}/"
            f"{account_id}"
        ),
        user_id=user_id,
    )

    return {
        "ok": True,
        "detail": detail
        or "Disconnected",
    }


# ----------------------------------------------------------------------
# Safe account information
# ----------------------------------------------------------------------


async def get_account_info(
    user_id: str,
    account_id: str,
) -> dict[str, Any]:
    """
    Fetch broker account information for the UI.

    The plugin may return operational/account information, but the service
    removes sensitive credential fields before returning the result.
    """

    account = await _get_owned_account(
        user_id,
        account_id,
    )

    plugin = _require_plugin(
        account.get("plugin_id")
    )

    credentials = _decrypt_credentials(
        account
    )

    try:
        result = await plugin.account_info(
            credentials
        )
    except Exception as exc:
        raise AppError(
            "BROKER_ACCOUNT_INFO_FAILED",
            status=502,
            detail="Unable to fetch broker account information",
        ) from exc

    if not isinstance(
        result,
        dict,
    ):
        result = {
            "data": result,
        }

    return redact_sensitive_payload(
        result
    )


def redact_sensitive_payload(
    value: Any,
) -> Any:
    """
    Recursive server-side redaction for broker/plugin responses.

    This is intentionally duplicated at the backend boundary even though
    the frontend also redacts defensively.
    """

    if isinstance(
        value,
        list,
    ):
        return [
            redact_sensitive_payload(
                item
            )
            for item in value
        ]

    if not isinstance(
        value,
        dict,
    ):
        return value

    sensitive_fragments = (
        "password",
        "secret",
        "token",
        "api_key",
        "apikey",
        "authorization",
        "credential",
        "mpin",
        "totp",
        "access_token",
        "refresh_token",
    )

    output = {}

    for key, item in value.items():
        normalized = str(
            key
        ).lower()

        if any(
            fragment in normalized
            for fragment in sensitive_fragments
        ):
            output[key] = "[REDACTED]"
        else:
            output[key] = redact_sensitive_payload(
                item
            )

    return output
