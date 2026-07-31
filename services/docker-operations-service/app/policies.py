"""
Validation policies for protected services and restart allow-lists.
"""
from fastapi import HTTPException, status
from app.settings import RESTARTABLE_SERVICES, PROTECTED_SERVICES


def validate_restart_eligibility(service_name: str):
    name = service_name.strip().lower()

    if name in PROTECTED_SERVICES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Service '{service_name}' is a PROTECTED infrastructure service and cannot be restarted via API. Follow manual runbook."
        )

    if name not in RESTARTABLE_SERVICES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Service '{service_name}' is not in the list of allowed restartable services."
        )

    return name
