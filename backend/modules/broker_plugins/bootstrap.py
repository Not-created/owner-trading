"""
Broker plugin bootstrap — real broker plugins register themselves here.
Adding a new broker is: implement BrokerPluginBase, import class, register().
"""
from modules.broker_core.registry import broker_registry
from modules.broker_plugins.kotak_neo import KotakNeoBrokerPlugin
from modules.broker_plugins.shoonya import ShoonyaBrokerPlugin
from modules.broker_plugins.angel_one import AngelOneBrokerPlugin
from modules.broker_plugins.upstox import UpstoxBrokerPlugin
from modules.broker_plugins.groww import GrowwBrokerPlugin
from modules.broker_plugins.dhan import DhanBrokerPlugin
from modules.broker_plugins.mt5 import MT5BrokerPlugin
from modules.broker_plugins.mt4 import MT4BrokerPlugin


def bootstrap_broker_plugins() -> None:
    broker_registry.register(KotakNeoBrokerPlugin())
    broker_registry.register(ShoonyaBrokerPlugin())
    broker_registry.register(AngelOneBrokerPlugin())
    broker_registry.register(UpstoxBrokerPlugin())
    broker_registry.register(GrowwBrokerPlugin())
    broker_registry.register(DhanBrokerPlugin())
    broker_registry.register(MT5BrokerPlugin())
    broker_registry.register(MT4BrokerPlugin())
