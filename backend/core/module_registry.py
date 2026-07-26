"""
Module Registry — central control center backbone.

Every backend module registers a small metadata record here at import/startup.
Owner Control exposes this list so the operator (and future AI Developer) can
inspect the live module graph without touching individual files.

Adding a new module in the future is a one-line self-registration; no changes
to core code are required.
"""
from dataclasses import dataclass, field
from typing import Callable, Any


@dataclass
class ModuleMeta:
    module_id: str
    display_name: str
    version: str = "1.0.0"
    description: str = ""
    api_prefix: str = ""
    endpoints: list[str] = field(default_factory=list)
    capabilities: list[str] = field(default_factory=list)
    health_check: Callable[[], Any] | None = None
    enabled: bool = True


class ModuleRegistry:
    def __init__(self) -> None:
        self._modules: dict[str, ModuleMeta] = {}

    def register(self, meta: ModuleMeta) -> None:
        self._modules[meta.module_id] = meta

    def unregister(self, module_id: str) -> None:
        self._modules.pop(module_id, None)

    def get(self, module_id: str) -> ModuleMeta | None:
        return self._modules.get(module_id)

    def all(self) -> list[ModuleMeta]:
        return list(self._modules.values())

    def as_dicts(self) -> list[dict]:
        return [
            {
                "module_id": m.module_id,
                "display_name": m.display_name,
                "version": m.version,
                "description": m.description,
                "api_prefix": m.api_prefix,
                "endpoints": m.endpoints,
                "capabilities": m.capabilities,
                "enabled": m.enabled,
                "has_health": m.health_check is not None,
            }
            for m in self._modules.values()
        ]


module_registry = ModuleRegistry()
