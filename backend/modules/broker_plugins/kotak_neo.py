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
The rest of the application must depend only on BrokerPluginBase.

IMPORTANT:
- No legacy api_key/api_secret/password authentication.
- No direct legacy session/create HTTP implementation.
- Credentials are never returned or logged.
- Kotak-specific SDK/API details stay inside this file.
"""

from __future__ import annotations

import asyncio
import time
from typing import Any

from modules.broker_core.base import BrokerHealth, BrokerPluginBase


class KotakNeoBrokerPlugin(BrokerPluginBase):
    """
    Current Kotak Neo broker implementation.

    The adapter uses the official maintained `kotakneoapi` SDK.
    """

    plugin_id = "kotak_neo"
    display_name = "Kotak Neo"
    version = "3.0.1"
    category = "indian"

    # Current Kotak Neo authentication contract.
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

    SDK_PACKAGE = "kotakneoapi"

    def __init__(self) -> None:
        # The official NeoAPI client keeps the authenticated session
        # internally after totp_validate().
        #
        # Only runtime session objects are kept here.
        # Credentials are never persisted by this adapter.
        self._client: Any | None = None
        self._session: dict[str, Any] = {}
        self._session_lock = asyncio.Lock()

    # ------------------------------------------------------------------
    # BrokerPluginBase contract
    # ------------------------------------------------------------------

    async def connect(
        self,
        credentials: dict[str, Any],
    ) -> BrokerHealth:
        """
        Authenticate with the current Kotak Neo TOTP + MPIN flow.

        Flow:
            NeoAPI(consumer_key=...)
            -> totp_login(...)
            -> totp_validate(mpin=...)

        A successful validation creates the trade session inside
        the official SDK.
        """
        missing = self.validate_credentials(credentials)

        if missing:
            return BrokerHealth(
                ok=False,
                detail=(
                    "Missing credentials: "
                    + ", ".join(missing)
                ),
                latency_ms=0,
            )

        started = time.perf_counter()

        async with self._session_lock:
            try:
                client = await self._create_client(
                    credentials["consumer_key"]
                )

                login_response = await asyncio.to_thread(
                    client.totp_login,
                    mobile_number=str(
                        credentials["mobileno"]
                    ).strip(),
                    ucc=str(
                        credentials["ucc"]
                    ).strip(),
                    totp=str(
                        credentials["totp"]
                    ).strip(),
                )

                if self._response_failed(login_response):
                    return BrokerHealth(
                        ok=False,
                        detail=self._response_error(
                            login_response,
                            "Kotak Neo TOTP login failed",
                        ),
                        latency_ms=self._latency_ms(started),
                    )

                validate_response = await asyncio.to_thread(
                    client.totp_validate,
                    mpin=str(
                        credentials["mpin"]
                    ).strip(),
                )

                if self._response_failed(validate_response):
                    return BrokerHealth(
                        ok=False,
                        detail=self._response_error(
                            validate_response,
                            "Kotak Neo MPIN validation failed",
                        ),
                        latency_ms=self._latency_ms(started),
                    )

                session_data = self._extract_data(
                    validate_response
                )

                if not session_data:
                    return BrokerHealth(
                        ok=False,
                        detail=(
                            "Kotak Neo authentication returned "
                            "an invalid session response"
                        ),
                        latency_ms=self._latency_ms(started),
                    )

                status = str(
                    session_data.get("status", "")
                ).lower()

                if status and status != "success":
                    return BrokerHealth(
                        ok=False,
                        detail=(
                            session_data.get("message")
                            or session_data.get("error")
                            or "Kotak Neo session validation failed"
                        )[:200],
                        latency_ms=self._latency_ms(started),
                    )

                # The SDK owns the authenticated trade session.
                self._client = client

                self._session = {
                    "authenticated": True,
                    "base_url": session_data.get("baseUrl"),
                    "sid": session_data.get("sid"),
                    "ucc": session_data.get("ucc"),
                    "greeting_name": session_data.get(
                        "greetingName"
                    ),
                    "data_center": session_data.get(
                        "dataCenter"
                    ),
                    "k_type": session_data.get(
                        "kType"
                    ),
                }

                greeting_name = (
                    session_data.get("greetingName")
                    or "Kotak Neo"
                )

                return BrokerHealth(
                    ok=True,
                    detail=(
                        f"Connected · {greeting_name}"
                    ),
                    latency_ms=self._latency_ms(started),
                )

            except ImportError:
                return BrokerHealth(
                    ok=False,
                    detail=(
                        "Kotak Neo SDK is not installed. "
                        "Install the official kotakneoapi package."
                    ),
                    latency_ms=self._latency_ms(started),
                )

            except Exception as exc:
                return BrokerHealth(
                    ok=False,
                    detail=self._safe_error(exc),
                    latency_ms=self._latency_ms(started),
                )

    async def disconnect(
        self,
        account_id: str,
    ) -> None:
        """
        End the current Kotak Neo trading session.

        The current universal broker contract supplies account_id only
        to disconnect/health methods, while connect() receives credentials.
        The adapter therefore maintains the authenticated SDK client as
        the runtime session for the currently configured Kotak account.
        """
        async with self._session_lock:
            client = self._client

            self._client = None
            self._session = {}

            if client is None:
                return

            try:
                logout = getattr(
                    client,
                    "logout",
                    None,
                )

                if logout is not None:
                    await asyncio.to_thread(logout)

            except Exception:
                # Disconnect is intentionally idempotent.
                pass

    async def health(
        self,
        account_id: str,
    ) -> BrokerHealth:
        """
        Return local authenticated-session health.

        This does not place an order or perform a trading operation.
        """
        if (
            self._client is None
            or not self._session.get("authenticated")
        ):
            return BrokerHealth(
                ok=False,
                detail="Kotak Neo session is not connected",
                latency_ms=0,
            )

        return BrokerHealth(
            ok=True,
            detail="Kotak Neo session is active",
            latency_ms=0,
        )

    async def account_info(
        self,
        credentials: dict[str, Any],
    ) -> dict[str, Any]:
        """
        Authenticate and return safe account/session information.

        Sensitive credentials and authentication tokens are removed.
        """
        missing = self.validate_credentials(credentials)

        if missing:
            return {
                "ok": False,
                "error": (
                    "Missing credentials: "
                    + ", ".join(missing)
                ),
            }

        started = time.perf_counter()

        async with self._session_lock:
            try:
                client = await self._create_client(
                    credentials["consumer_key"]
                )

                login_response = await asyncio.to_thread(
                    client.totp_login,
                    mobile_number=str(
                        credentials["mobileno"]
                    ).strip(),
                    ucc=str(
                        credentials["ucc"]
                    ).strip(),
                    totp=str(
                        credentials["totp"]
                    ).strip(),
                )

                if self._response_failed(login_response):
                    return {
                        "ok": False,
                        "error": self._response_error(
                            login_response,
                            "Kotak Neo TOTP login failed",
                        ),
                    }

                validate_response = await asyncio.to_thread(
                    client.totp_validate,
                    mpin=str(
                        credentials["mpin"]
                    ).strip(),
                )

                if self._response_failed(validate_response):
                    return {
                        "ok": False,
                        "error": self._response_error(
                            validate_response,
                            "Kotak Neo MPIN validation failed",
                        ),
                    }

                data = self._extract_data(
                    validate_response
                )

                if not data:
                    return {
                        "ok": False,
                        "error": (
                            "Kotak Neo returned an invalid "
                            "session response"
                        ),
                    }

                return {
                    "ok": True,
                    "broker": self.display_name,
                    "authenticated": True,
                    "ucc": data.get("ucc"),
                    "greeting_name": data.get(
                        "greetingName"
                    ),
                    "data_center": data.get(
                        "dataCenter"
                    ),
                    "base_url": data.get("baseUrl"),
                    "client_type": data.get(
                        "clientType"
                    ),
                    "is_nri": data.get("isNRI"),
                    "dormancy_status": data.get(
                        "dormancyStatus"
                    ),
                    "account_type": data.get("kType"),
                    "latency_ms": self._latency_ms(
                        started
                    ),
                }

            except ImportError:
                return {
                    "ok": False,
                    "error": (
                        "Kotak Neo SDK is not installed. "
                        "Install the official kotakneoapi package."
                    ),
                }

            except Exception as exc:
                return {
                    "ok": False,
                    "error": self._safe_error(exc),
                }

    # ------------------------------------------------------------------
    # Official SDK client
    # ------------------------------------------------------------------

    @staticmethod
    async def _create_client(
        consumer_key: str,
    ) -> Any:
        """
        Lazily import and construct the current official SDK client.

        Lazy import keeps application startup independent from the
        optional broker SDK until Kotak is actually used.
        """
        try:
            from neo_api_client import NeoAPI
        except ImportError as exc:
            raise ImportError(
                "The official kotakneoapi package is required."
            ) from exc

        return await asyncio.to_thread(
            NeoAPI,
            consumer_key=str(consumer_key).strip(),
            environment="prod",
        )

    # ------------------------------------------------------------------
    # Response helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _extract_data(
        response: Any,
    ) -> dict[str, Any]:
        """
        Extract the standard Kotak response data object.
        """
        if not isinstance(response, dict):
            return {}

        data = response.get("data")

        if isinstance(data, dict):
            return data

        return {}

    @classmethod
    def _response_failed(
        cls,
        response: Any,
    ) -> bool:
        """
        Detect the current Kotak SDK/API failure response shape.
        """
        if response is None:
            return True

        if not isinstance(response, dict):
            return False

        stat = str(
            response.get("stat", "")
        ).lower()

        if stat in {
            "not_ok",
            "failed",
            "failure",
            "error",
        }:
            return True

        if response.get("error"):
            return True

        data = cls._extract_data(response)

        if data:
            status = str(
                data.get("status", "")
            ).lower()

            if status in {
                "failed",
                "failure",
                "error",
            }:
                return True

        return False

    @classmethod
    def _response_error(
        cls,
        response: Any,
        fallback: str,
    ) -> str:
        """
        Convert a Kotak response into a safe short error message.
        """
        if isinstance(response, dict):
            error = response.get("error")

            if isinstance(error, list):
                for item in error:
                    if isinstance(item, dict):
                        message = (
                            item.get("message")
                            or item.get("msg")
                            or item.get("description")
                        )

                        if message:
                            return str(message)[:200]

            if isinstance(error, str):
                return error[:200]

            for key in (
                "message",
                "msg",
                "description",
                "error_message",
            ):
                value = response.get(key)

                if value:
                    return str(value)[:200]

            data = cls._extract_data(response)

            for key in (
                "message",
                "msg",
                "description",
                "error_message",
            ):
                value = data.get(key)

                if value:
                    return str(value)[:200]

        return fallback

    @staticmethod
    def _latency_ms(
        started: float,
    ) -> int:
        return int(
            (time.perf_counter() - started) * 1000
        )

    @staticmethod
    def _safe_error(
        exc: Exception,
    ) -> str:
        """
        Do not expose credentials/tokens in application errors.
        """
        message = str(exc)

        sensitive_terms = (
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
        )

        lowered = message.lower()

        if any(
            term in lowered
            for term in sensitive_terms
        ):
            return "Kotak Neo request failed"

        return (
            message[:200]
            or "Kotak Neo request failed"
            )
