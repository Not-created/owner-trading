"""
Broker plugin registry.
Part 1B ships only the framework; specific brokers are added in Part 2 by
implementing BrokerPluginBase and registering here.
"""
from modules.broker_core.base import BrokerPluginBase


class BrokerRegistry:
    def __init__(self) -> None:
        self._plugins: dict[str, BrokerPluginBase] = {}

    def register(self, plugin: BrokerPluginBase) -> None:
        self._plugins[plugin.plugin_id] = plugin

    def unregister(self, plugin_id: str) -> None:
        self._plugins.pop(plugin_id, None)

    def get(self, plugin_id: str) -> BrokerPluginBase | None:
        return self._plugins.get(plugin_id)

    def all(self) -> list[BrokerPluginBase]:
        return list(self._plugins.values())


broker_registry = BrokerRegistry()
