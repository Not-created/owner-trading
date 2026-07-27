"""
Role & Permission engine.
Roles: super_admin, admin, developer, user.
Permissions granted to each role are configurable via settings_store.
The platform runs single-user for now (owner is super_admin), but the
role/permission matrix is fully defined and exposed via /api/roles for
future multi-user extension.
"""
from typing import Iterable

ROLES = ("super_admin", "admin", "developer", "user")

DEFAULT_PERMISSIONS: dict[str, list[str]] = {
    "super_admin": ["*"],
    "admin": [
        "user:read", "user:write",
        "ai:read", "ai:write",
        "broker:read", "broker:write",
        "plugin:read", "plugin:write",
        "settings:read", "settings:write",
        "logs:read",
    ],
    "developer": [
        "ai:read", "ai:write",
        "broker:read",
        "plugin:read", "plugin:write",
        "logs:read",
    ],
    "user": [
        "ai:read",
        "broker:read",
        "settings:read",
    ],
}


def has_permission(role: str, permission: str) -> bool:
    perms = DEFAULT_PERMISSIONS.get(role, [])
    if "*" in perms:
        return True
    return permission in perms


def require(role: str, permission: str) -> None:
    from core.error_handling import AppError
    if not has_permission(role, permission):
        raise AppError("PERMISSION_DENIED", status=403)


def all_permissions() -> Iterable[str]:
    seen = set()
    for perms in DEFAULT_PERMISSIONS.values():
        for p in perms:
            if p != "*":
                seen.add(p)
    return sorted(seen)
