"""
Universal Broker Plugin Registry.

The registry is the single canonical runtime collection of broker
adapters used by OWNER-TRADING.

Responsibilities:
- register broker plugins
- prevent invalid/duplicate registrations
- retrieve a plugin by stable plugin_id
- expose safe broker metadata
- provide capability-aware discovery

The registry itself must remain broker-neutral.

Broker-specific implementation belongs in broker_plugins/.
The registry must never contain broker API logic, credentials, tokens,
or trading logic.
"""

from __future__ import annotations

from typing import Any

from modules.broker_core.base import BrokerPluginBase


class BrokerRegistry:
    """
    Canonical registry for BrokerPluginBase implementations.

    One plugin_id represents exactly one broker adapter at runtime.

    Example:

        broker_registry.register(KotakNeoPlugin())

        plugin = broker_registry.get("kotak_neo")

    The registry does not decide which broker is primary. That belongs
    to the broker account service.

    The registry also does not establish broker connections. That belongs
    to the registered adapter/service layer.
    """

    def __init__(self) -> None:
        self._plugins: dict[str, BrokerPluginBase] = {}

    # ------------------------------------------------------------------
    # Registration
    # ------------------------------------------------------------------

    def register(self, plugin: BrokerPluginBase) -> None:
        """
        Register exactly one valid plugin for its plugin_id.

        Duplicate plugin IDs are rejected instead of silently replacing
        an existing implementation.

        This prevents accidental double registration during application
        startup and protects against two different adapters claiming the
        same broker ID.
        """

        if not isinstance(plugin, BrokerPluginBase):
            raise TypeError(
                "Broker plugin must inherit from BrokerPluginBase."
            )

        plugin_id = str(getattr(plugin, "plugin_id", "") or "").strip()

        if not plugin_id:
            raise ValueError(
                "Broker plugin must define a non-empty plugin_id."
            )

        if plugin_id in self._plugins:
            existing = self._plugins[plugin_id]

            # Idempotent startup is allowed when the exact same adapter
            # class is registered again.
            if type(existing) is type(plugin):
                return

            raise ValueError(
                f"Broker plugin_id '{plugin_id}' is already registered "
                "by a different plugin implementation."
            )

        self._plugins[plugin_id] = plugin

    def unregister(self, plugin_id: str) -> None:
        """
        Remove a plugin from the runtime registry.

        This does not delete broker accounts or credentials from the
        database. Account lifecycle belongs to BrokerService.
        """

        self._plugins.pop(str(plugin_id).strip(), None)

    # ------------------------------------------------------------------
    # Lookup
    # ------------------------------------------------------------------

    def get(self, plugin_id: str) -> BrokerPluginBase | None:
        """
        Return a registered plugin or None when it is unavailable.
        """

        return self._plugins.get(str(plugin_id).strip())

    def has(self, plugin_id: str) -> bool:
        """Return True when plugin_id is currently registered."""

        return str(plugin_id).strip() in self._plugins

    def all(self) -> list[BrokerPluginBase]:
        """
        Return all registered plugins.

        The returned list is a snapshot; callers cannot modify the
        registry by mutating this list.
        """

        return list(self._plugins.values())

    def count(self) -> int:
        """Return the number of registered broker plugins."""

        return len(self._plugins)

    # ------------------------------------------------------------------
    # Safe discovery
    # ------------------------------------------------------------------

    def list_safe(self) -> list[dict[str, Any]]:
        """
        Return safe metadata for the Broker Manager/UI.

        No credentials, tokens, passwords, secrets, or raw broker
        responses are returned.

        Metadata comes from BrokerPluginBase.metadata() so the registry
        does not duplicate the plugin metadata contract.
        """

        return [
            dict(plugin.metadata())
            for plugin in self._plugins.values()
        ]

    def get_safe(self, plugin_id: str) -> dict[str, Any] | None:
        """
        Return safe metadata for one registered broker.

        Returns None when the broker is not registered/configured.
        """

        plugin = self.get(plugin_id)

        if plugin is None:
            return None

        return dict(plugin.metadata())

    def list_by_category(self, category: str) -> list[dict[str, Any]]:
        """
        Return safe metadata for brokers in a category.

        Category matching is case-insensitive.
        """

        wanted = str(category).strip().lower()

        return [
            dict(plugin.metadata())
            for plugin in self._plugins.values()
            if str(getattr(plugin, "category", "")).strip().lower()
            == wanted
        ]

    # ------------------------------------------------------------------
    # Capability discovery
    # ------------------------------------------------------------------

    def supports(
        self,
        plugin_id: str,
        capability: str,
    ) -> bool:
        """
        Check whether a registered broker declares a capability.

        Unknown brokers/capabilities return False.

        This is only a capability declaration. It does not mean the
        broker account is currently connected.
        """

        plugin = self.get(plugin_id)

        if plugin is None:
            return False

        return plugin.supports(capability)

    def list_supporting(
        self,
        capability: str,
    ) -> list[dict[str, Any]]:
        """
        Return safe metadata for all registered brokers that declare
        the requested capability.
        """

        return [
            dict(plugin.metadata())
            for plugin in self._plugins.values()
            if plugin.supports(capability)
        ]


# ----------------------------------------------------------------------
# Canonical application-wide registry
# ----------------------------------------------------------------------

broker_registry = BrokerRegistry()
