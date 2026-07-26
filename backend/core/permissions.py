"""
Owner-only permission engine.
Single-owner platform — no admin, developer, or user roles.
The sole role is "owner" with full access to every capability.
"""
from typing import Iterable

# Single-owner platform.
ROLES = ("owner",)

# The owner has access to every capability. Capabilities are kept as a
# public list so the Owner Control panel can enumerate them.
CAPABILITIES: list[str] = [
    "auth:manage",
    "user:manage",
    "ai:read", "ai:write",
    "broker:read", "broker:write",
    "plugin:read", "plugin:write",
    "settings:read", "settings:write",
    "logs:read",
    "owner-control:manage",
]

DEFAULT_PERMISSIONS: dict[str, list[str]] = {
    "owner": ["*"],
}


def has_permission(role: str, permission: str) -> bool:
    return role == "owner"  # owner has everything


def require(role: str, permission: str) -> None:
    from core.error_handling import AppError
    if not has_permission(role, permission):
        raise AppError("PERMISSION_DENIED", status=403)


def all_permissions() -> Iterable[str]:
    return list(CAPABILITIES)
