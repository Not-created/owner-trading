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
"""

from __future__ import annotations

from modules.broker_core.registry import broker_registry
from modules.broker_plugins.kotak_neo import KotakNeoBrokerPlugin


def bootstrap_broker_plugins() -> None:
    """
    Register enabled broker plugins.

    Registration is intentionally limited to brokers that are actually
    available and approved for the current deployment.

    BrokerRegistry is idempotent for repeated registration of the same
    adapter class, so application startup cannot create duplicate entries.
    """

    broker_registry.register(
        KotakNeoBrokerPlugin()
    )
