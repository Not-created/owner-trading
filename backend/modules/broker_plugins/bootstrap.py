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
from modules.broker_plugins.kotak_neo import KotakNeoBrokerPlugin


KOTAK_NEO_PLUGIN_ID = "kotak_neo"


def bootstrap_broker_plugins() -> None:
    """
    Register the broker plugins enabled for this deployment.

    The function is safe to call repeatedly. If Kotak Neo is already
    registered, the existing plugin instance is preserved instead of
    creating and registering a duplicate instance.
    """

    if broker_registry.get(KOTAK_NEO_PLUGIN_ID) is None:
        broker_registry.register(KotakNeoBrokerPlugin())
