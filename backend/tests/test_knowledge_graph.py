import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from modules.ai_developer.intelligence import knowledge_graph
from modules.ai_developer.inspector import (
    _resolve_app_root,
    _is_valid_project_root,
    _resolve,
    project_map,
    APP_ROOT,
    ALLOWED_ROOTS,
)


def test_knowledge_graph_discovers_structure():
    graph = knowledge_graph()

    assert isinstance(graph, dict)
    assert graph.get("nodes")
    assert graph.get("edges")

    node_types = {node["kind"] for node in graph["nodes"]}
    assert "module" in node_types
    assert "file" in node_types

    module_nodes = [node for node in graph["nodes"] if node["kind"] == "module"]
    assert any(node["name"] == "ai_developer" for node in module_nodes)

    edge_kinds = {edge["kind"] for edge in graph["edges"]}
    assert "import" in edge_kinds or "route" in edge_kinds


def test_app_root_resolution():
    root = _resolve_app_root()
    assert root.exists()
    assert (root / "backend" / "server.py").exists()
    assert (root / "frontend" / "package.json").exists()
    assert _is_valid_project_root(root) is True


def test_is_valid_project_root_rejects_invalid_dirs(tmp_path):
    assert _is_valid_project_root(tmp_path) is False
    (tmp_path / "backend").mkdir()
    assert _is_valid_project_root(tmp_path) is False


def test_resolve_security_boundaries():
    # Allowed file within backend
    server_path = _resolve("backend/server.py")
    assert server_path is not None
    assert server_path.exists()

    # Blocked files / patterns must return None
    assert _resolve(".env") is None
    assert _resolve(".env.local") is None
    assert _resolve("backend/.env") is None
    assert _resolve("node_modules/package.json") is None

    # Path traversal attempts must return None
    assert _resolve("../../etc/passwd") is None
    assert _resolve("../outside_workspace.py") is None


def test_project_map_structure():
    pm = project_map()
    assert isinstance(pm, dict)
    assert "root" in pm
    assert "tree" in pm
    assert "backend" in pm["tree"]


from modules.broker_core.base import BrokerPluginBase
from modules.broker_core.registry import broker_registry
from modules.broker_plugins.bootstrap import bootstrap_broker_plugins


def test_broker_registry_contains_all_eight_plugins():
    bootstrap_broker_plugins()
    expected = {"kotak_neo", "shoonya", "angel_one", "upstox", "groww", "dhan", "mt5", "mt4"}
    registered_ids = {p.plugin_id for p in broker_registry.all()}
    assert expected.issubset(registered_ids)
    assert len(registered_ids) >= 8


def test_all_registered_plugins_are_broker_plugin_base_instances():
    bootstrap_broker_plugins()
    for p in broker_registry.all():
        assert isinstance(p, BrokerPluginBase)
        assert p.plugin_id != ""
        assert p.display_name != ""
        assert p.version != ""
        assert isinstance(p.required_credentials, list)
        assert isinstance(p.credential_labels, dict)
        assert p.supports_trading is (p.plugin_id == "kotak_neo")


@pytest.mark.asyncio
async def test_unimplemented_trading_methods_raise_not_implemented():
    bootstrap_broker_plugins()
    for p in broker_registry.all():
        if p.plugin_id == "kotak_neo":
            continue
        with pytest.raises(NotImplementedError):
            await p.place_order({}, {"symbol": "INFY", "quantity": 1})

        with pytest.raises(NotImplementedError):
            await p.modify_order({}, "ord_1", {"quantity": 2})

        with pytest.raises(NotImplementedError):
            await p.cancel_order({}, "ord_1")

        with pytest.raises(NotImplementedError):
            await p.get_positions({})

        with pytest.raises(NotImplementedError):
            await p.get_orders({})


def test_validate_credentials_helper():
    bootstrap_broker_plugins()
    plugin = broker_registry.get("kotak_neo")
    assert plugin is not None
    missing = plugin.validate_credentials({})
    assert "consumer_key" in missing
    assert "mobileno" in missing
    assert "ucc" in missing
    assert "totp" in missing
    assert "mpin" in missing

    valid = plugin.validate_credentials({
        "consumer_key": "k",
        "mobileno": "9876543210",
        "ucc": "UCC123",
        "totp": "123456",
        "mpin": "1234",
    })
    assert len(valid) == 0


