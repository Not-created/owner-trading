"""
Universal Broker Core — stable broker plugin contract.

This module defines the canonical broker interface used by the entire
OWNER-TRADING platform.

IMPORTANT:
- Broker-specific implementations belong in broker_plugins/.
- Core trading/strategy code must never depend directly on a broker SDK.
- Existing broker plugins may implement only the capabilities they support.
- Unsupported capabilities must return a safe, explicit result.
- Do not put credentials, tokens, passwords, TOTP secrets, or other
  sensitive values into BrokerHealth or operation results.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, ClassVar, Mapping


@dataclass(frozen=True)
class BrokerHealth:
    """
    Result of a broker connection/health check.

    `ok=True` means the requested health check succeeded.
    `detail` must contain only safe, non-secret information.
    `latency_ms` is the measured round-trip latency when available.
    """

    ok: bool
    detail: str = ""
    latency_ms: int = 0


@dataclass(frozen=True)
class BrokerOperationResult:
    """
    Standard result for broker operations that will be used by the
    future trading engine.

    This keeps broker-specific SDK response formats out of the rest
    of the application.

    No secret credentials, access tokens, refresh tokens, passwords,
    TOTP values, or raw broker responses should be placed in this object.
    """

    ok: bool
    status: str = ""
    message: str = ""
    data: Mapping[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class BrokerCapabilities:
    """
    Declares what a broker adapter supports.

    These flags are capability declarations, not claims that a broker
    is currently connected.

    A capability must only be marked True when the adapter implements
    that operation correctly.
    """

    account_info: bool = True
    funds: bool = False
    market_data: bool = False
    order_place: bool = False
    order_modify: bool = False
    order_cancel: bool = False
    order_status: bool = False
    positions: bool = False
    holdings: bool = False
    trade_history: bool = False


class BrokerPluginBase(ABC):
    """
    Canonical broker adapter interface.

    Every broker adapter is isolated behind this contract.

    Architecture:

        Strategy / Trading Engine
                  |
                  v
        Unified Broker Contract
                  |
                  v
            Broker Adapter
                  |
                  v
              Broker API

    The rest of the application must not import broker-specific SDKs
    directly.
    """

    # ------------------------------------------------------------------
    # Stable broker metadata
    # ------------------------------------------------------------------

    plugin_id: ClassVar[str] = ""
    display_name: ClassVar[str] = ""
    version: ClassVar[str] = "1.0.0"
    category: ClassVar[str] = ""

    # Credential names expected by the adapter.
    required_credentials: ClassVar[list[str]] = []

    # Human-readable labels for the credential UI.
    credential_labels: ClassVar[dict[str, str]] = {}

    # Capability declaration.
    capabilities: ClassVar[BrokerCapabilities] = BrokerCapabilities()

    # ------------------------------------------------------------------
    # Connection lifecycle
    # ------------------------------------------------------------------

    @abstractmethod
    async def connect(self, credentials: dict[str, Any]) -> BrokerHealth:
        """
        Establish/authenticate a broker connection.

        Implementations must:
        - validate credentials
        - authenticate using the broker's supported mechanism
        - return accurate connection status
        - never return success for a failed connection
        - never expose secrets in the returned detail
        """
        raise NotImplementedError

    @abstractmethod
    async def disconnect(self, account_id: str) -> None:
        """
        Disconnect/release resources for a broker account.

        Implementations should be idempotent where possible.
        """
        raise NotImplementedError

    @abstractmethod
    async def health(self, account_id: str) -> BrokerHealth:
        """
        Perform a safe health check for an already configured account.

        The result must contain no credentials or tokens.
        """
        raise NotImplementedError

    # ------------------------------------------------------------------
    # Account
    # ------------------------------------------------------------------

    async def account_info(
        self,
        credentials: dict[str, Any],
    ) -> dict[str, Any]:
        """
        Retrieve safe broker account information.

        Existing adapters may override this method.

        Returned data must be sanitized and must never contain:
        - passwords
        - API secrets
        - TOTP secrets
        - access tokens
        - refresh tokens
        - raw credential dictionaries
        """
        return {}

    # ------------------------------------------------------------------
    # Future unified trading contract
    #
    # These methods intentionally are NOT abstract yet.
    #
    # Existing adapters can continue working while later prompts add
    # broker-specific implementations capability by capability.
    # The Trading Engine will use `capabilities` before requesting an
    # operation.
    # ------------------------------------------------------------------

    async def get_funds(
        self,
        account_id: str,
    ) -> BrokerOperationResult:
        """Return available/usable account funds when supported."""
        return BrokerOperationResult(
            ok=False,
            status="unsupported",
            message="Funds capability is not implemented by this broker adapter.",
        )

    async def get_market_data(
        self,
        account_id: str,
        request: Mapping[str, Any],
    ) -> BrokerOperationResult:
        """Return broker market data when supported."""
        return BrokerOperationResult(
            ok=False,
            status="unsupported",
            message="Market-data capability is not implemented by this broker adapter.",
        )

    async def place_order(
        self,
        account_id: str,
        order: Mapping[str, Any],
    ) -> BrokerOperationResult:
        """Place an order when supported."""
        return BrokerOperationResult(
            ok=False,
            status="unsupported",
            message="Order placement is not implemented by this broker adapter.",
        )

    async def modify_order(
        self,
        account_id: str,
        order_id: str,
        changes: Mapping[str, Any],
    ) -> BrokerOperationResult:
        """Modify an existing order when supported."""
        return BrokerOperationResult(
            ok=False,
            status="unsupported",
            message="Order modification is not implemented by this broker adapter.",
        )

    async def cancel_order(
        self,
        account_id: str,
        order_id: str,
    ) -> BrokerOperationResult:
        """Cancel an existing order when supported."""
        return BrokerOperationResult(
            ok=False,
            status="unsupported",
            message="Order cancellation is not implemented by this broker adapter.",
        )

    async def get_order_status(
        self,
        account_id: str,
        order_id: str,
    ) -> BrokerOperationResult:
        """Retrieve order status when supported."""
        return BrokerOperationResult(
            ok=False,
            status="unsupported",
            message="Order-status capability is not implemented by this broker adapter.",
        )

    async def get_positions(
        self,
        account_id: str,
    ) -> BrokerOperationResult:
        """Retrieve open positions when supported."""
        return BrokerOperationResult(
            ok=False,
            status="unsupported",
            message="Position capability is not implemented by this broker adapter.",
        )

    async def get_holdings(
        self,
        account_id: str,
    ) -> BrokerOperationResult:
        """Retrieve holdings when supported."""
        return BrokerOperationResult(
            ok=False,
            status="unsupported",
            message="Holdings capability is not implemented by this broker adapter.",
        )

    async def get_trade_history(
        self,
        account_id: str,
        request: Mapping[str, Any] | None = None,
    ) -> BrokerOperationResult:
        """Retrieve trade history when supported."""
        return BrokerOperationResult(
            ok=False,
            status="unsupported",
            message="Trade-history capability is not implemented by this broker adapter.",
        )

    # ------------------------------------------------------------------
    # Credential validation
    # ------------------------------------------------------------------

    def validate_credentials(
        self,
        credentials: Mapping[str, Any] | None,
    ) -> list[str]:
        """
        Return required credential keys that are missing.

        This performs presence validation only.

        Broker-specific validation belongs inside the adapter.
        Secrets are never included in the returned list.
        """

        if not credentials:
            return list(self.required_credentials)

        return [
            key
            for key in self.required_credentials
            if not credentials.get(key)
        ]

    # ------------------------------------------------------------------
    # Capability helpers
    # ------------------------------------------------------------------

    @classmethod
    def supports(cls, capability: str) -> bool:
        """
        Safely check whether this adapter declares a capability.

        Unknown capability names return False rather than raising.
        """

        value = getattr(cls.capabilities, capability, False)
        return bool(value)

    @classmethod
    def metadata(cls) -> dict[str, Any]:
        """
        Return safe broker metadata for Broker Manager/UI/registry.

        No credentials or runtime secrets are returned.
        """

        return {
            "plugin_id": cls.plugin_id,
            "display_name": cls.display_name,
            "version": cls.version,
            "category": cls.category,
            "required_credentials": list(cls.required_credentials),
            "credential_labels": dict(cls.credential_labels),
            "capabilities": {
                "account_info": cls.capabilities.account_info,
                "funds": cls.capabilities.funds,
                "market_data": cls.capabilities.market_data,
                "order_place": cls.capabilities.order_place,
                "order_modify": cls.capabilities.order_modify,
                "order_cancel": cls.capabilities.order_cancel,
                "order_status": cls.capabilities.order_status,
                "positions": cls.capabilities.positions,
                "holdings": cls.capabilities.holdings,
                "trade_history": cls.capabilities.trade_history,
            },
        }
                  ok=False,
            status="unsupported",
            message="Holdings capability is not implemented by this broker adapter.",
        )

    async def get_trade_history(
        self,
        account_id: str,
        request: Mapping[str, Any] | None = None,
    ) -> BrokerOperationResult:
        """Retrieve trade history when supported."""
        return BrokerOperationResult(
            ok=False,
            status="unsupported",
            message="Trade-history capability is not implemented by this broker adapter.",
        )

    # ------------------------------------------------------------------
    # Credential validation
    # ------------------------------------------------------------------

    def validate_credentials(
        self,
        credentials: Mapping[str, Any] | None,
    ) -> list[str]:
        """
        Return required credential keys that are missing.

        This performs presence validation only.

        Broker-specific validation belongs inside the adapter.
        Secrets are never included in the returned list.
        """

        if not credentials:
            return list(self.required_credentials)

        return [
            key
            for key in self.required_credentials
            if not credentials.get(key)
        ]

    # ------------------------------------------------------------------
    # Capability helpers
    # ------------------------------------------------------------------

    @classmethod
    def supports(cls, capability: str) -> bool:
        """
        Safely check whether this adapter declares a capability.

        Unknown capability names return False rather than raising.
        """

        value = getattr(cls.capabilities, capability, False)
        return bool(value)

    @classmethod
    def metadata(cls) -> dict[str, Any]:
        """
        Return safe broker metadata for Broker Manager/UI/registry.

        No credentials or runtime secrets are returned.
        """

        return {
            "plugin_id": cls.plugin_id,
            "display_name": cls.display_name,
            "version": cls.version,
            "category": cls.category,
            "required_credentials": list(cls.required_credentials),
            "credential_labels": dict(cls.credential_labels),
            "capabilities": {
                "account_info": cls.capabilities.account_info,
                "funds": cls.capabilities.funds,
                "market_data": cls.capabilities.market_data,
                "order_place": cls.capabilities.order_place,
                "order_modify": cls.capabilities.order_modify,
                "order_cancel": cls.capabilities.order_cancel,
                "order_status": cls.capabilities.order_status,
                "positions": cls.capabilities.positions,
                "holdings": cls.capabilities.holdings,
                "trade_history": cls.capabilities.trade_history,
            },
}
