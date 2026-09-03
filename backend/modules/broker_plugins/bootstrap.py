"""
Broker Plugin Bootstrap.

This module registers the broker adapters that are actually installed
and enabled for the current deployment.

IMPORTANT:
- Only brokers explicitly registered here are exposed by BrokerRegistry.
- Currently Kotak Neo is the only enabled broker implementation.
- Other approved project brokers are NOT registered until their adapters
  are intentionally enabled and validated.
- No fake/placeholder broker entries are created.
- Broker-specific API logic remains inside each adapter.
- Bootstrap is idempotent: an already-registered adapter instance is reused.
"""

from __future__ import annotations

from modules.broker_core.registry import broker_registry
from modules.broker_plugins.angel_one import AngelOneBrokerPlugin
from modules.broker_plugins.dhan import DhanBrokerPlugin
from modules.broker_plugins.groww import GrowwBrokerPlugin
from modules.broker_plugins.kotak_neo import KotakNeoBrokerPlugin
from modules.broker_plugins.mt4 import MT4BrokerPlugin
from modules.broker_plugins.mt5 import MT5BrokerPlugin
from modules.broker_plugins.shoonya import ShoonyaBrokerPlugin
from modules.broker_plugins.upstox import UpstoxBrokerPlugin


ENABLED_BROKER_CLASSES = (
    AngelOneBrokerPlugin,
    DhanBrokerPlugin,
    GrowwBrokerPlugin,
    KotakNeoBrokerPlugin,
    MT4BrokerPlugin,
    MT5BrokerPlugin,
    ShoonyaBrokerPlugin,
    UpstoxBrokerPlugin,
)


def bootstrap_broker_plugins() -> None:
    """Register the broker plugins enabled for this deployment."""
    for plugin_cls in ENABLED_BROKER_CLASSES:
        plugin_id = getattr(plugin_cls, "plugin_id", "")
        if plugin_id and broker_registry.get(plugin_id) is None:
            broker_registry.register(plugin_cls())
