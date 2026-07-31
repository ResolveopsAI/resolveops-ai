"""
Docker Operations Service — FastAPI entrypoint.

Handles approved operational container restart actions with full verification,
protected service checks, requester vs approver governance, and audit record updates.
"""
import uuid
import datetime
import logging
from typing import List, Optional

from fastapi import FastAPI, HTTPException, Depends, status, Query
from app.settings import APPROVAL_REQUIRED, EXPIRY_MINUTES
from app.security import verify_internal_token
from app.policies import validate_restart_eligibility
from app.schemas import (
    RestartRequestCreate,
    RestartApprovalSubmit,
    RestartRejectionSubmit,
    ContainerActionResponse,
)
from app.docker_client import get_container_by_service_name, capture_container_state
from app.action_executor import execute_approved_restart
from app.audit_client import SessionLocal, ContainerActionModel

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("docker-operations-service")

app = FastAPI(title="docker-operations-service", version="1.0.0")


@app.get("/health")
def health_check():
    return {"status": "healthy", "service": "docker-operations-service"}


@app.post(
    "/api/v1/container-actions/restart-requests",
    response_model=ContainerActionResponse,
    dependencies=[Depends(verify_internal_token)]
)
def create_restart_request(req: RestartRequestCreate):
    # 1. Check restart eligibility & protected service policy
    service_name = validate_restart_eligibility(req.service_name)

    # 2. Check current container state
    container = get_container_by_service_name(service_name)
    before_state = capture_container_state(container)

    # 3. Create action record
    action_id = f"ACT-{uuid.uuid4().hex[:8].upper()}"
    now = datetime.datetime.utcnow()
    expires_at = now + datetime.timedelta(minutes=EXPIRY_MINUTES)

    action_record = {
        "action_id": action_id,
        "service_name": service_name,
        "reason": req.reason,
        "requested_by": req.requested_by,
        "requested_at": now.isoformat(),
        "status": "awaiting_approval",
        "expires_at": expires_at.isoformat(),
        "before_state": before_state,
        "verification_status": "pending",
    }

    if SessionLocal:
        db = SessionLocal()
        try:
            model = ContainerActionModel(
                action_id=action_id,
                service_name=service_name,
                reason=req.reason,
                requested_by=req.requested_by,
                requested_at=now.isoformat(),
                status="awaiting_approval",
                expires_at=expires_at.isoformat(),
                before_state=before_state,
                verification_status="pending",
            )
            db.add(model)
            db.commit()
        except Exception as e:
            logger.error(f"Failed to persist action request in DB: {e}")
            db.rollback()
        finally:
            db.close()

    return action_record


@app.get(
    "/api/v1/container-actions",
    response_model=List[ContainerActionResponse],
    dependencies=[Depends(verify_internal_token)]
)
def list_container_actions(service_name: Optional[str] = None):
    if not SessionLocal:
        return []
    db = SessionLocal()
    try:
        query = db.query(ContainerActionModel)
        if service_name:
            query = query.filter(ContainerActionModel.service_name == service_name.lower())
        items = query.order_by(ContainerActionModel.requested_at.desc()).limit(100).all()
        return [
            {
                "action_id": item.action_id,
                "service_name": item.service_name,
                "reason": item.reason,
                "requested_by": item.requested_by,
                "requested_at": item.requested_at,
                "status": item.status,
                "approved_by": item.approved_by,
                "approved_at": item.approved_at,
                "rejected_by": item.rejected_by,
                "rejected_at": item.rejected_at,
                "rejection_reason": item.rejection_reason,
                "expires_at": item.expires_at,
                "before_state": item.before_state,
                "after_state": item.after_state,
                "verification_status": item.verification_status,
                "error_message": item.error_message,
            }
            for item in items
        ]
    finally:
        db.close()


@app.get(
    "/api/v1/container-actions/{action_id}",
    response_model=ContainerActionResponse,
    dependencies=[Depends(verify_internal_token)]
)
def get_container_action(action_id: str):
    if not SessionLocal:
        raise HTTPException(status_code=404, detail="Database session unavailable.")
    db = SessionLocal()
    try:
        item = db.query(ContainerActionModel).filter(ContainerActionModel.action_id == action_id).first()
        if not item:
            raise HTTPException(status_code=404, detail=f"Action '{action_id}' not found.")
        return {
            "action_id": item.action_id,
            "service_name": item.service_name,
            "reason": item.reason,
            "requested_by": item.requested_by,
            "requested_at": item.requested_at,
            "status": item.status,
            "approved_by": item.approved_by,
            "approved_at": item.approved_at,
            "rejected_by": item.rejected_by,
            "rejected_at": item.rejected_at,
            "rejection_reason": item.rejection_reason,
            "expires_at": item.expires_at,
            "before_state": item.before_state,
            "after_state": item.after_state,
            "verification_status": item.verification_status,
            "error_message": item.error_message,
        }
    finally:
        db.close()


@app.post(
    "/api/v1/container-actions/{action_id}/approve",
    response_model=ContainerActionResponse,
    dependencies=[Depends(verify_internal_token)]
)
def approve_and_execute_restart(action_id: str, body: RestartApprovalSubmit):
    if not SessionLocal:
        raise HTTPException(status_code=500, detail="Database connection unavailable.")

    db = SessionLocal()
    try:
        item = db.query(ContainerActionModel).filter(ContainerActionModel.action_id == action_id).first()
        if not item:
            raise HTTPException(status_code=404, detail=f"Action '{action_id}' not found.")

        if item.status != "awaiting_approval":
            raise HTTPException(status_code=400, detail=f"Action '{action_id}' is in status '{item.status}' and cannot be approved.")

        # Check expiration
        now = datetime.datetime.utcnow()
        if item.expires_at:
            exp = datetime.datetime.fromisoformat(item.expires_at)
            if now > exp:
                item.status = "expired"
                db.commit()
                raise HTTPException(status_code=400, detail=f"Action '{action_id}' has expired.")

        # Enforcement: Requester cannot approve their own restart request unless Admin
        if item.requested_by == body.approved_by and body.approver_role.lower() not in ("admin", "administrator"):
            raise HTTPException(
                status_code=403,
                detail="Requesters cannot approve their own restart request. An independent SRE or Admin approval is required."
            )

        # Update status to approved and executing
        item.status = "executing"
        item.approved_by = body.approved_by
        item.approved_at = now.isoformat()
        item.execution_started_at = now.isoformat()
        db.commit()

        # Re-validate service eligibility & execute
        service_name = validate_restart_eligibility(item.service_name)
        success, before_state, after_state, verification_msg = execute_approved_restart(service_name)

        now_end = datetime.datetime.utcnow()
        item.execution_completed_at = now_end.isoformat()
        item.before_state = before_state
        item.after_state = after_state

        if success:
            item.status = "completed"
            item.verification_status = "passed"
            item.error_message = verification_msg
        else:
            item.status = "failed"
            item.verification_status = "failed"
            item.error_message = verification_msg

        db.commit()

        return {
            "action_id": item.action_id,
            "service_name": item.service_name,
            "reason": item.reason,
            "requested_by": item.requested_by,
            "requested_at": item.requested_at,
            "status": item.status,
            "approved_by": item.approved_by,
            "approved_at": item.approved_at,
            "expires_at": item.expires_at,
            "before_state": item.before_state,
            "after_state": item.after_state,
            "verification_status": item.verification_status,
            "error_message": item.error_message,
        }
    finally:
        db.close()


@app.post(
    "/api/v1/container-actions/{action_id}/reject",
    response_model=ContainerActionResponse,
    dependencies=[Depends(verify_internal_token)]
)
def reject_restart(action_id: str, body: RestartRejectionSubmit):
    if not SessionLocal:
        raise HTTPException(status_code=500, detail="Database connection unavailable.")

    db = SessionLocal()
    try:
        item = db.query(ContainerActionModel).filter(ContainerActionModel.action_id == action_id).first()
        if not item:
            raise HTTPException(status_code=404, detail=f"Action '{action_id}' not found.")

        if item.status != "awaiting_approval":
            raise HTTPException(status_code=400, detail=f"Action '{action_id}' is in status '{item.status}' and cannot be rejected.")

        now = datetime.datetime.utcnow()
        item.status = "rejected"
        item.rejected_by = body.rejected_by
        item.rejected_at = now.isoformat()
        item.rejection_reason = body.reason
        db.commit()

        return {
            "action_id": item.action_id,
            "service_name": item.service_name,
            "reason": item.reason,
            "requested_by": item.requested_by,
            "requested_at": item.requested_at,
            "status": item.status,
            "rejected_by": item.rejected_by,
            "rejected_at": item.rejected_at,
            "rejection_reason": item.rejection_reason,
            "expires_at": item.expires_at,
            "before_state": item.before_state,
            "after_state": item.after_state,
            "verification_status": item.verification_status,
        }
    finally:
        db.close()
