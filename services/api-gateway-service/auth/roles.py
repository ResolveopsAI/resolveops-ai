"""
Role definitions and permission assignments for ResolveOps AI.
"""
from enum import Enum
from typing import Set


class Role(str, Enum):
    ADMIN = "admin"
    SRE = "sre"
    DEVELOPER = "developer"
    AUDITOR = "auditor"


# Mapping from role string to allowed permission strings
ROLE_PERMISSIONS: dict[str, Set[str]] = {
    Role.ADMIN.value: {
        "containers:read",
        "containers:logs",
        "containers:restart_request",
        "containers:restart_approve",
        "audit:read",
        "integrations:manage",
        "alerts:manage",
        "incidents:read",
        "incidents:manage",
    },
    Role.SRE.value: {
        "containers:read",
        "containers:logs",
        "containers:restart_request",
        "containers:restart_approve",
        "audit:read",
        "integrations:manage",
        "alerts:manage",
        "incidents:read",
        "incidents:manage",
    },
    Role.DEVELOPER.value: {
        "containers:read",
        "containers:logs",
        "containers:restart_request",
        "incidents:read",
    },
    Role.AUDITOR.value: {
        "containers:read",
        "incidents:read",
        "audit:read",
    },
}


def get_role_permissions(role: str) -> Set[str]:
    normalized_role = (role or "").strip().lower()
    if normalized_role in ("administrator", "admin"):
        normalized_role = Role.ADMIN.value
    return ROLE_PERMISSIONS.get(normalized_role, set())
