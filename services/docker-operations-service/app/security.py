"""
Security token verification for inter-service communication.
"""
from fastapi import Header, HTTPException, status
from app.settings import INTERNAL_SERVICE_TOKEN


def verify_internal_token(x_internal_token: str = Header(..., alias="X-Internal-Token")):
    if x_internal_token != INTERNAL_SERVICE_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid or missing X-Internal-Token header."
        )
    return True
