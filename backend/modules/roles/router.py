"""
Roles & Permissions — /api/roles
"""
from fastapi import APIRouter, Depends
from core.permissions import DEFAULT_PERMISSIONS, ROLES, all_permissions
from modules.auth.deps import get_current_user

router = APIRouter(prefix="/api/roles", tags=["roles"])


@router.get("")
async def list_roles(user=Depends(get_current_user)):
    matrix = []
    for perm in all_permissions():
        row = {"permission": perm}
        for role in ROLES:
            perms = DEFAULT_PERMISSIONS.get(role, [])
            row[role] = ("*" in perms) or (perm in perms)
        matrix.append(row)
    return {"roles": list(ROLES), "matrix": matrix}
