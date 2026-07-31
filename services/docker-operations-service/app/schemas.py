"""
Pydantic schemas for restart requests, approvals, and action details.
"""
from typing import Optional, Dict, Any
from pydantic import BaseModel, Field


class RestartRequestCreate(BaseModel):
    service_name: str = Field(..., description="Compose service name to restart")
    reason: str = Field(..., min_length=5, description="Operational reason for restart request")
    requested_by: str = Field(..., description="User email requesting the restart")


class RestartApprovalSubmit(BaseModel):
    approved_by: str = Field(..., description="User email approving the action")
    approver_role: str = Field(..., description="Role of user approving the action")


class RestartRejectionSubmit(BaseModel):
    rejected_by: str = Field(..., description="User email rejecting the action")
    reason: str = Field(..., description="Rejection reason")


class ContainerActionResponse(BaseModel):
    action_id: str
    service_name: str
    reason: str
    requested_by: str
    requested_at: str
    status: str
    approved_by: Optional[str] = None
    approved_at: Optional[str] = None
    rejected_by: Optional[str] = None
    rejected_at: Optional[str] = None
    rejection_reason: Optional[str] = None
    expires_at: Optional[str] = None
    before_state: Optional[Dict[str, Any]] = None
    after_state: Optional[Dict[str, Any]] = None
    verification_status: Optional[str] = None
    error_message: Optional[str] = None
