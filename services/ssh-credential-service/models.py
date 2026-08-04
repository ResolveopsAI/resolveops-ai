from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime


# --- Credential Models ---

class PEMUploadRequest(BaseModel):
    """Request model for uploading a PEM file."""
    key_name: str = Field(..., description="Friendly name for this PEM key")
    aws_account_id: str = Field(..., description="AWS Account ID this PEM belongs to")
    pem_content: str = Field(..., description="PEM file content (base64 encoded)")


class PEMUploadResponse(BaseModel):
    """Response after successfully uploading and encrypting a PEM file."""
    credential_id: str
    key_name: str
    aws_account_id: str
    fingerprint: str
    aws_key_pair_name: Optional[str] = None
    matched_instances: List[Dict[str, Any]] = []
    unmatched_instances: List[Dict[str, Any]] = []
    message: str


class CredentialListItem(BaseModel):
    """Single credential in a list response."""
    id: str
    key_name: str
    aws_account_id: str
    aws_key_pair_name: Optional[str] = None
    fingerprint: str
    status: str
    created_at: Optional[str] = None
    last_used_at: Optional[str] = None
    matched_instance_count: int = 0


class CredentialListResponse(BaseModel):
    """Response for listing all credentials for a tenant."""
    credentials: List[CredentialListItem]
    total: int


class TestConnectionRequest(BaseModel):
    """Request to test SSH connectivity to an instance."""
    instance_id: str
    region: str = "us-east-1"
    # AWS auth passed via headers or session


class TestConnectionResponse(BaseModel):
    """Response for SSH connectivity test."""
    instance_id: str
    status: str  # 'success', 'failed', 'pem_mismatch', 'unreachable'
    ssh_user: str
    detected_os: str
    message: str


# --- Instance Matching Models ---

class InstanceMatchResult(BaseModel):
    """Result of matching PEM against EC2 instances."""
    matched_instances: List[Dict[str, Any]]
    unmatched_instances: List[Dict[str, Any]]
    total_instances: int
    matched_count: int
    unmatched_count: int


# --- Self-Healing Models ---

class CommandEntry(BaseModel):
    """A single command in a remediation plan."""
    step: int
    command: str
    description: str
    risk_level: str = "none"  # none, low, medium, high, critical
    reversible: bool = True
    causes_downtime: bool = False
    rollback_command: Optional[str] = None
    action_type: str = "diagnostic"  # diagnostic, remediation, verification


class SelfHealProposalRequest(BaseModel):
    """Request to create a self-healing proposal."""
    instance_id: str
    region: str = "us-east-1"
    problem_summary: str
    trigger_source: str = "manual"  # 'rca', 'predictive', 'manual'
    proposed_commands: List[CommandEntry]
    incident_id: Optional[str] = None


class SelfHealProposalResponse(BaseModel):
    """Response after creating a self-healing proposal."""
    action_id: str
    instance_id: str
    detected_os: str
    ssh_user: str
    problem_summary: str
    proposed_commands: List[CommandEntry]
    status: str  # 'pending'
    message: str


class SelfHealApproveRequest(BaseModel):
    """Request to approve and execute specific commands from a proposal."""
    approved_step_numbers: List[int] = Field(
        ..., description="List of step numbers the user approves for execution"
    )


class CommandResult(BaseModel):
    """Result of executing a single command."""
    step: int
    command: str
    stdout: str
    stderr: str
    exit_code: int
    status: str  # 'success', 'failed', 'error'


class SelfHealExecutionResponse(BaseModel):
    """Response after executing approved self-healing commands."""
    action_id: str
    instance_id: str
    status: str  # 'success', 'partial_success', 'failed'
    results: List[CommandResult]
    message: str


class SelfHealHistoryItem(BaseModel):
    """Single item in self-healing action history."""
    id: str
    instance_id: str
    detected_os: Optional[str] = None
    ssh_user: Optional[str] = None
    trigger_source: Optional[str] = None
    problem_summary: str
    proposed_commands: List[Dict[str, Any]]
    approved_commands: Optional[List[Dict[str, Any]]] = None
    command_results: Optional[List[Dict[str, Any]]] = None
    status: str
    incident_id: Optional[str] = None
    created_at: Optional[str] = None
    approved_at: Optional[str] = None
    completed_at: Optional[str] = None


class SelfHealHistoryResponse(BaseModel):
    """Response for self-healing action history."""
    actions: List[SelfHealHistoryItem]
    total: int
