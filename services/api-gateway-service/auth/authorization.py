"""
FastAPI Dependencies & Authorization helpers for ResolveOps AI.
"""
from typing import Callable, Optional
from fastapi import Depends, HTTPException, status
from auth.roles import get_role_permissions, Role


def has_permission(user_role: str, permission: str) -> bool:
    permissions = get_role_permissions(user_role)
    return permission in permissions


def require_permission(required_permission: str) -> Callable:
    """
    FastAPI dependency factory that enforces permission requirements.
    Requires current_user dict from JWT/Auth dependency.
    """
    def permission_checker(current_user: dict):
        if not current_user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication credentials were not provided."
            )
        role = current_user.get("role", Role.DEVELOPER.value)
        if not has_permission(role, required_permission):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission '{required_permission}' denied for role '{role}'."
            )
        return current_user

    return permission_checker
