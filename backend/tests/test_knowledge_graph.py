import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from modules.ai_developer.intelligence import knowledge_graph


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
