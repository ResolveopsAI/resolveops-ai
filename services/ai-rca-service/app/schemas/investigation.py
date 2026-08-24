"""AI-RCA Service — Investigation request/response schemas."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class InvestigationRequest(BaseModel):
    """Accepted by POST /api/v1/rca/investigate."""
    incident_id: Optional[str] = Field(None, description="ResolveOps incident ID")
    service: Optional[str] = Field(None, description="Affected service name")
    question: Optional[str] = Field(None, description="Natural-language question or description")
    time_window_minutes: int = Field(60, ge=5, le=1440)
    session_id: Optional[str] = None
    tenant_id: Optional[str] = None
    tenant_email: Optional[str] = None


class ChatRequest(BaseModel):
    """Accepted by POST /api/v1/rca/chat."""
    message: str
    session_id: Optional[str] = None
    tenant_id: Optional[str] = None
    tenant_email: Optional[str] = None
    image_base64: Optional[str] = None
    previous_visual_spec: Optional[dict] = None  # For conversational visual editing
    history: Optional[List[Dict[str, Any]]] = None  # Previous conversation turns for multi-turn context



class EvidenceItem(BaseModel):
    source: str                          # e.g. "cloudwatch", "github", "docker"
    resource: Optional[str] = None
    evidence_type: str                   # e.g. "metric", "log", "event", "deployment"
    collection_timestamp: str
    summary: str
    is_live: bool = True
    citation: Optional[str] = None
    raw_preview: Optional[str] = None   # truncated, safe to display


class ToolCall(BaseModel):
    tool_name: str
    inputs: Dict[str, Any]
    duration_ms: int
    success: bool
    error_code: Optional[str] = None


class SuggestedFixProposal(BaseModel):
    action_type: str = "restart_service"  # "restart_service" | "config_change" | "code_change"
    target: str                           # service name
    reason: str                           # rationale
    evidence_ids: List[str] = []
    risk: str = "medium"                  # "low" | "medium" | "high"
    requires_approval: bool = True


class RCAResponse(BaseModel):
    request_id: str
    investigation_id: str
    status: str                            # "completed" | "insufficient_evidence" | "error"
    execution_path: str                    # e.g. "mcp_rca" | "legacy_analyze"

    # Populated on success
    incident_summary: Optional[str] = None
    probable_root_cause: Optional[str] = None
    confidence: Optional[str] = None      # "high" | "medium" | "low"
    impact: Optional[str] = None
    recommended_resolution: Optional[str] = None
    suggested_fix: Optional[SuggestedFixProposal] = None
    insufficient_evidence_warning: Optional[str] = None

    live_evidence: List[EvidenceItem] = []
    historical_evidence: List[EvidenceItem] = []
    tools_used: List[ToolCall] = []

    investigation_duration_seconds: Optional[float] = None
    answer: Optional[str] = None          # Plain-text fallback for legacy chat consumer


class ChatResponse(BaseModel):
    request_id: str
    session_id: Optional[str] = None
    answer: str
    execution_path: str                   # "ai_rca_chat" | "legacy_gateway_rag"
    provider: str
    model: str
