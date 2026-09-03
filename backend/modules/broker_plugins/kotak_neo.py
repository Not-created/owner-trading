"""
Kotak Neo broker adapter — current official Neo Python SDK integration.

Official SDK:
    kotakneoapi

Current authentication:
    Consumer Key
        -> TOTP Login
        -> MPIN Validation
        -> Trade Session

This adapter is the single Kotak-specific integration boundary.
The rest of the application depends only on BrokerPluginBase.

IMPORTANT:
- No legacy api_key/api_secret/password authentication.
- No direct legacy session/create HTTP implementation.
- Credentials and authentication tokens are never returned or logged.
- Kotak-specific SDK/API details remain inside this adapter.
- Runtime authentication state is kept only in memory.
"""

from __future__ import annotations

import asyncio
import time
from typing import Any

from modules.broker_core.base import (
    BrokerCapabilities,
    BrokerHealth,
    BrokerPluginBase,
)


class KotakNeoBrokerPlugin(BrokerPluginBase):
    """
    Current Kotak Neo broker implementation.

    Authentication uses the official NeoAPI SDK:

        NeoAPI(consumer_key=..., environment="prod")
        -> totp_login(...)
        -> totp_validate(...)

    After successful MPIN validation, the official SDK owns the
    authenticated trade session.
    """

    plugin_id = "kotak_neo"
    display_name = "Kotak Neo"
    version = "3.0.1"
    category = "indian"

    required_credentials = [
        "consumer_key",
        "mobileno",
        "ucc",
        "totp",
        "mpin",
    ]

    credential_labels = {
        "consumer_key": "Consumer Key",
        "mobileno": "Mobile Number",
        "ucc": "UCC / Client Code",
        "totp": "TOTP",
        "mpin": "MPIN",
    }
    supports_trading = True
    capabilities = BrokerCapabilities(
        account_info=True,
        funds=True,
        order_place=True,
        order_modify=True,
        order_cancel=True,
        order_status=True,
        positions=True,
        holdings=True,
        trade_history=True,
    )

    SDK_PACKAGE = "kotakneoapi"

    def __init__(self) -> None:
        # The SDK client and authenticated session are runtime-only.
        # Credentials are never stored by this adapter.
        self._client: Any | None = None
        self._session: dict[str, Any] = {}
        self._session_lock = asyncio.Lock()

    async def connect(
        self,
        credentials: dict[str, Any],
    ) -> BrokerHealth:
        """Authenticate using the official Kotak Neo TOTP + MPIN flow."""
        missing = self.validate_credentials(credentials)
        if missing:
            return BrokerHealth(
                ok=False,
                detail="Missing credentials: " + ", ".join(missing),
                latency_ms=0,
            )

        started = time.perf_counter()

        async with self._session_lock:
            try:
                client = await self._create_client(credentials["consumer_key"])

                login_response = await asyncio.to_thread(
                    client.totp_login,
                    mobile_number=str(credentials["mobileno"]).strip(),
                    ucc=str(credentials["ucc"]).strip(),
                    totp=str(credentials["totp"]).strip(),
                )
                if self._response_failed(login_response):
                    return BrokerHealth(
                        ok=False,
                        detail=self._response_error(login_response, "Kotak Neo TOTP login failed"),
                        latency_ms=self._latency_ms(started),
                    )

                validate_response = await asyncio.to_thread(
                    client.totp_validate,
                    mpin=str(credentials["mpin"]).strip(),
                )
                if self._response_failed(validate_response):
                    return BrokerHealth(
                        ok=False,
                        detail=self._response_error(validate_response, "Kotak Neo MPIN validation failed"),
                        latency_ms=self._latency_ms(started),
                    )

                session_data = self._extract_data(validate_response)
                if not session_data:
                    return BrokerHealth(
                        ok=False,
                        detail="Kotak Neo authentication returned an invalid session response",
                        latency_ms=self._latency_ms(started),
                    )

                status = str(session_data.get("status", "")).strip().lower()
                if status and status != "success":
                    return BrokerHealth(
                        ok=False,
                        detail=(session_data.get("message") or session_data.get("error") or "Kotak Neo session validation failed")[:200],
                        latency_ms=self._latency_ms(started),
                    )

                self._client = client
                self._session = {
                    "authenticated": True,
                    "sid": session_data.get("sid"),
                    "ucc": session_data.get("ucc"),
                    "greeting_name": session_data.get("greetingName"),
                    "base_url": session_data.get("baseUrl"),
                    "data_center": session_data.get("dataCenter"),
                    "k_type": session_data.get("kType"),
                    "client_type": session_data.get("clientType"),
                    "is_nri": session_data.get("isNRI"),
                    "dormancy_status": session_data.get("dormancyStatus"),
                }

                greeting_name = session_data.get("greetingName") or "Kotak Neo"
                return BrokerHealth(
                    ok=True,
                    detail=f"Connected · {greeting_name}",
                    latency_ms=self._latency_ms(started),
                )

            except ImportError:
                return BrokerHealth(
                    ok=False,
                    detail="Kotak Neo SDK is not installed. Install the official kotakneoapi package.",
                    latency_ms=self._latency_ms(started),
                )
            except Exception as exc:
                return BrokerHealth(
                    ok=False,
                    detail=self._safe_error(exc),
                    latency_ms=self._latency_ms(started),
                )

    async def disconnect(self, account_id: str) -> None:
        del account_id
        async with self._session_lock:
            client = self._client
            self._client = None
            self._session = {}
            if client is None:
                return
            try:
                logout = getattr(client, "logout", None)
                if callable(logout):
                    await asyncio.to_thread(logout)
            except Exception:
                pass

    async def health(self, account_id: str) -> BrokerHealth:
        del account_id
        if self._client is None or not self._session.get("authenticated"):
            return BrokerHealth(ok=False, detail="Kotak Neo session is not connected", latency_ms=0)
        return BrokerHealth(ok=True, detail="Kotak Neo session is active", latency_ms=0)

    async def account_info(self, credentials: dict[str, Any]) -> dict[str, Any]:
        missing = self.validate_credentials(credentials)
        if missing:
            return {"ok": False, "error": "Missing credentials: " + ", ".join(missing)}

        started = time.perf_counter()
        async with self._session_lock:
            try:
                client = await self._create_client(credentials["consumer_key"])
                login_response = await asyncio.to_thread(
                    client.totp_login,
                    mobile_number=str(credentials["mobileno"]).strip(),
                    ucc=str(credentials["ucc"]).strip(),
                    totp=str(credentials["totp"]).strip(),
                )
                if self._response_failed(login_response):
                    return {"ok": False, "error": self._response_error(login_response, "Kotak Neo TOTP login failed")}

                validate_response = await asyncio.to_thread(
                    client.totp_validate,
                    mpin=str(credentials["mpin"]).strip(),
                )
                if self._response_failed(validate_response):
                    return {"ok": False, "error": self._response_error(validate_response, "Kotak Neo MPIN validation failed")}

                data = self._extract_data(validate_response)
                if not data:
                    return {"ok": False, "error": "Kotak Neo returned an invalid session response"}

                return {
                    "ok": True,
                    "broker": self.display_name,
                    "authenticated": True,
                    "ucc": data.get("ucc"),
                    "greeting_name": data.get("greetingName"),
                    "data_center": data.get("dataCenter"),
                    "base_url": data.get("baseUrl"),
                    "client_type": data.get("clientType"),
                    "is_nri": data.get("isNRI"),
                    "dormancy_status": data.get("dormancyStatus"),
                    "account_type": data.get("kType"),
                    "is_trial_account": data.get("isTrialAccount"),
                    "is_user_pwd_expired": data.get("isUserPwdExpired"),
                    "latency_ms": self._latency_ms(started),
                }
            except ImportError:
                return {"ok": False, "error": "Kotak Neo SDK is not installed. Install the official kotakneoapi package."}
            except Exception as exc:
                return {"ok": False, "error": self._safe_error(exc)}

    async def test_connection(self, credentials: dict[str, Any]) -> BrokerHealth:
        """Authenticate through Kotak without changing persisted account state."""
        result = await self.account_info(credentials)
        return BrokerHealth(
            ok=bool(result.get("ok")),
            detail=result.get("error") or "Kotak Neo authentication succeeded",
            latency_ms=int(result.get("latency_ms") or 0),
        )

    def _require_client(self) -> Any:
        if self._client is None or not self._session.get("authenticated"):
            raise RuntimeError("Kotak Neo session is not connected")
        return self._client

    async def place_order(
        self,
        credentials: dict[str, Any],
        order_params: dict[str, Any],
    ) -> dict[str, Any]:
        del credentials
        client = self._require_client()
        exchange_segment = {
            "NSE": "nse_cm",
            "BSE": "bse_cm",
            "NFO": "nse_fo",
            "BFO": "bse_fo",
            "MCX": "mcx_fo",
        }.get(order_params["exchange"].upper(), order_params["exchange"].lower())
        order = await asyncio.to_thread(
            client.place_order,
            exchange_segment=exchange_segment,
            product=order_params["product"],
            price=str(order_params.get("price") or "0"),
            order_type={"MARKET": "MKT", "LIMIT": "L", "STOPLOSS": "SL"}[order_params["order_type"]],
            quantity=str(order_params["quantity"]),
            validity=order_params["validity"],
            trading_symbol=order_params["symbol"],
            transaction_type={"BUY": "B", "SELL": "S"}[order_params["side"]],
            trigger_price=str(order_params.get("trigger_price") or "0"),
        )
        return self._normalize_order_response(order, order_params.get("client_order_id"))

    async def get_order_status(
        self,
        credentials: dict[str, Any],
        order_id: str,
    ) -> dict[str, Any]:
        del credentials
        client = self._require_client()
        response = await asyncio.to_thread(client.order_report, order_id=order_id)
        return self._normalize_order_response(response, order_id)

    async def modify_order(
        self,
        credentials: dict[str, Any],
        order_id: str,
        modify_params: dict[str, Any],
    ) -> dict[str, Any]:
        del credentials
        client = self._require_client()
        order_type = modify_params.get("order_type", "LIMIT")
        response = await asyncio.to_thread(
            client.modify_order,
            order_id=order_id,
            price=str(modify_params.get("price") or "0"),
            order_type={"MARKET": "MKT", "LIMIT": "L", "STOPLOSS": "SL"}[order_type],
            quantity=str(modify_params["quantity"]),
            validity=modify_params.get("validity", "DAY"),
            trigger_price=str(modify_params.get("trigger_price") or "0"),
        )
        return self._normalize_order_response(response, order_id)

    async def cancel_order(
        self,
        credentials: dict[str, Any],
        order_id: str,
    ) -> dict[str, Any]:
        del credentials
        client = self._require_client()
        response = await asyncio.to_thread(client.cancel_order, order_id=order_id)
        result = self._normalize_order_response(response, order_id)
        result.setdefault("status", "CANCELLED")
        return result

    async def get_orders(
        self,
        credentials: dict[str, Any],
        status: str | None = None,
    ) -> list[dict[str, Any]]:
        del credentials
        client = self._require_client()
        response = await asyncio.to_thread(client.order_report)
        rows = self._response_rows(response)
        if status:
            wanted = status.upper()
            rows = [row for row in rows if str(row.get("status", "")).upper() == wanted]
        return rows

    async def get_positions(self, credentials: dict[str, Any]) -> list[dict[str, Any]]:
        del credentials
        return self._response_rows(await asyncio.to_thread(self._require_client().positions))

    async def get_holdings(self, credentials: dict[str, Any]) -> list[dict[str, Any]]:
        del credentials
        return self._response_rows(await asyncio.to_thread(self._require_client().holdings))

    async def get_funds(self, credentials: dict[str, Any]) -> dict[str, Any]:
        del credentials
        response = await asyncio.to_thread(self._require_client().limits)
        return response if isinstance(response, dict) else {"data": response}

    async def get_trade_history(self, credentials: dict[str, Any]) -> list[dict[str, Any]]:
        del credentials
        return self._response_rows(await asyncio.to_thread(self._require_client().trade_report))

    @staticmethod
    def _response_rows(response: Any) -> list[dict[str, Any]]:
        if isinstance(response, list):
            return [item for item in response if isinstance(item, dict)]
        if not isinstance(response, dict):
            return []
        for key in ("data", "orders", "positions", "holdings", "trades"):
            value = response.get(key)
            if isinstance(value, list):
                return [item for item in value if isinstance(item, dict)]
        return [response] if not response.get("Error") and not response.get("Error Message") else []

    @classmethod
    def _normalize_order_response(cls, response: Any, fallback_id: str | None) -> dict[str, Any]:
        if isinstance(response, dict):
            if response.get("Error") or response.get("Error Message"):
                raise RuntimeError(cls._response_error(response, "Kotak Neo order request failed"))
            rows = cls._response_rows(response)
            source = rows[0] if rows else response
            order_id = source.get("orderId") or source.get("order_id") or source.get("nOrdNo") or fallback_id
            status = source.get("status") or source.get("ordSt") or source.get("orderStatus") or "PENDING"
            return {"order_id": order_id, "status": str(status).upper(), "raw": response}
        raise RuntimeError("Kotak Neo returned an invalid order response")

    @staticmethod
    async def _create_client(consumer_key: str) -> Any:
        """Import and construct the official Kotak Neo SDK client."""
        try:
            from neo_api_client import NeoAPI
        except ImportError:
            try:
                from kotakneoapi import NeoAPI
            except ImportError as exc:
                raise ImportError("The official Kotak Neo SDK is not installed. Install kotakneoapi.") from exc

        return await asyncio.to_thread(
            NeoAPI,
            consumer_key=str(consumer_key).strip(),
            environment="prod",
        )

    @staticmethod
    def _extract_data(response: Any) -> dict[str, Any]:
        if not isinstance(response, dict):
            return {}
        data = response.get("data")
        return data if isinstance(data, dict) else {}

    @classmethod
    def _response_failed(cls, response: Any) -> bool:
        if response is None:
            return True
        if not isinstance(response, dict):
            return False

        stat = str(response.get("stat", "")).strip().lower()
        if stat in {"not_ok", "failed", "failure", "error"}:
            return True
        if response.get("error"):
            return True

        data = cls._extract_data(response)
        if data:
            status = str(data.get("status", "")).strip().lower()
            if status in {"failed", "failure", "error"}:
                return True
        return False

    @classmethod
    def _response_error(cls, response: Any, fallback: str) -> str:
        if not isinstance(response, dict):
            return fallback

        error = response.get("error")
        if isinstance(error, list):
            for item in error:
                if isinstance(item, dict):
                    message = item.get("message") or item.get("msg") or item.get("description")
                    if message:
                        return str(message)[:200]
        if isinstance(error, str):
            return error[:200]

        for key in ("message", "msg", "description", "error_message"):
            value = response.get(key)
            if value:
                return str(value)[:200]

        data = cls._extract_data(response)
        for key in ("message", "msg", "description", "error_message"):
            value = data.get(key)
            if value:
                return str(value)[:200]

        return fallback

    @staticmethod
    def _latency_ms(started: float) -> int:
        return int((time.perf_counter() - started) * 1000)

    @staticmethod
    def _safe_error(exc: Exception) -> str:
        message = str(exc)
        lowered = message.lower()
        for term in (
            "consumer_key",
            "api_key",
            "api_secret",
            "password",
            "mpin",
            "totp",
            "token",
            "authorization",
            "secret",
            "cookie",
        ):
            if term in lowered:
                return "Kotak Neo request failed"
        return message[:200] or "Kotak Neo request failed"
