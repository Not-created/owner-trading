"""
Broker plugin bootstrap — real broker plugins register themselves here.
Adding a new broker is: implement BrokerPluginBase, import class, register().
"""
from modules.broker_core.registry import broker_registry
from modules.broker_plugins.alpaca import AlpacaBrokerPlugin


def bootstrap_broker_plugins() -> None:
    broker_registry.register(AlpacaBrokerPlugin())
