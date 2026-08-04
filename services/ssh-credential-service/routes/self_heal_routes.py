import uuid
import datetime
import logging
from fastapi import APIRouter, HTTPException, Body, Header
from typing import Optional

from models import (
    SelfHealProposalRequest, SelfHealProposalResponse,
    SelfHealApproveRequest, SelfHealExecutionResponse,
    SelfHealHistoryItem, SelfHealHistoryResponse,
    CommandResult
)
from services.credential_vault import CredentialVault
from services.os_detector import OSDetector
from services.ssh_executor import SSHExecutor

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/self-heal", tags=["Self-Healing"])

# In-memory store for self-healing actions (in production, PostgreSQL via API gateway)
actions_store = {}  # action_id -> action dict

# Import the credential stores from credential_routes
from routes.credential_routes import credentials_store, encrypted_pems, _build_auth_kwargs


@router.post("/propose", response_model=SelfHealProposalResponse)
def propose_remediation(
    payload: SelfHealProposalRequest = Body(...),
    x_tenant_id: str = Header(..., alias="X-Tenant-ID"),
    x_aws_access_key_id: Optional[str] = Header(None, alias="X-AWS-Access-Key-ID"),
    x_aws_secret_access_key: Optional[str] = Header(None, alias="X-AWS-Secret-Access-Key"),
    x_aws_session_token: Optional[str] = Header(None, alias="X-AWS-Session-Token"),
    x_aws_region: str = Header("us-east-1", alias="X-AWS-Region"),
):
    """
    Create a self-healing proposal for an EC2 instance.
    
    This does NOT execute anything — it creates a pending action
    that the user must explicitly approve before execution.
    
    The AI generates the commands; this endpoint records the proposal.
    """
    auth_kwargs = _build_auth_kwargs(
        x_aws_access_key_id, x_aws_secret_access_key,
        x_aws_session_token, x_aws_region
    )

    # Detect OS and SSH user for the target instance
    detector = OSDetector(auth_kwargs)
    os_info = detector.detect(payload.instance_id, payload.region)

    if os_info.get('is_windows'):
        raise HTTPException(
            status_code=400,
            detail="Windows instances do not support SSH-based self-healing."
        )

    # Find the matching credential for this instance
    credential_id = _find_credential_for_instance(
        x_tenant_id, payload.instance_id, auth_kwargs, payload.region
    )
    if not credential_id:
        raise HTTPException(
            status_code=400,
            detail=(
                f"No matching PEM credential found for instance {payload.instance_id}. "
                f"Please upload the correct PEM key in the Credentials page."
            )
        )

    # Create the proposal (status = pending)
    action_id = str(uuid.uuid4())
    action = {
        'id': action_id,
        'tenant_id': x_tenant_id,
        'credential_id': credential_id,
        'instance_id': payload.instance_id,
        'region': payload.region,
        'detected_os': os_info['detected_os'],
        'ssh_user': os_info['ssh_user'],
        'trigger_source': payload.trigger_source,
        'problem_summary': payload.problem_summary,
        'proposed_commands': [cmd.model_dump() for cmd in payload.proposed_commands],
        'approved_commands': None,
        'command_results': None,
        'status': 'pending',
        'incident_id': payload.incident_id,
        'created_at': datetime.datetime.utcnow().isoformat(),
        'approved_at': None,
        'completed_at': None
    }
    actions_store[action_id] = action

    logger.info(
        f"Self-healing proposal created: {action_id} for instance {payload.instance_id} "
        f"(trigger: {payload.trigger_source})"
    )

    return SelfHealProposalResponse(
        action_id=action_id,
        instance_id=payload.instance_id,
        detected_os=os_info['detected_os'],
        ssh_user=os_info['ssh_user'],
        problem_summary=payload.problem_summary,
        proposed_commands=payload.proposed_commands,
        status='pending',
        message=(
            f"Remediation proposal created. "
            f"Awaiting user approval before execution. "
            f"OS detected: {os_info['detected_os']} (SSH user: {os_info['ssh_user']})"
        )
    )


@router.post("/{action_id}/approve", response_model=SelfHealExecutionResponse)
def approve_and_execute(
    action_id: str,
    payload: SelfHealApproveRequest = Body(...),
    x_tenant_id: str = Header(..., alias="X-Tenant-ID"),
    x_aws_access_key_id: Optional[str] = Header(None, alias="X-AWS-Access-Key-ID"),
    x_aws_secret_access_key: Optional[str] = Header(None, alias="X-AWS-Secret-Access-Key"),
    x_aws_session_token: Optional[str] = Header(None, alias="X-AWS-Session-Token"),
    x_aws_region: str = Header("us-east-1", alias="X-AWS-Region"),
):
    """
    Approve specific commands from a proposal and execute them.
    
    The user selects which step numbers to approve. Only those commands
    are executed. The rest are skipped.
    """
    if action_id not in actions_store:
        raise HTTPException(status_code=404, detail="Action not found")

    action = actions_store[action_id]
    if action['tenant_id'] != x_tenant_id:
        raise HTTPException(status_code=403, detail="Access denied")

    if action['status'] != 'pending':
        raise HTTPException(
            status_code=400,
            detail=f"Action is in '{action['status']}' state. Only 'pending' actions can be approved."
        )

    # Get the credential
    credential_id = action['credential_id']
    if credential_id not in encrypted_pems:
        raise HTTPException(status_code=400, detail="PEM credential no longer available")

    # Filter approved commands
    approved_commands = [
        cmd for cmd in action['proposed_commands']
        if cmd['step'] in payload.approved_step_numbers
    ]

    if not approved_commands:
        raise HTTPException(status_code=400, detail="No valid commands selected for approval")

    # Update action status
    action['status'] = 'approved'
    action['approved_commands'] = approved_commands
    action['approved_at'] = datetime.datetime.utcnow().isoformat()

    # Decrypt PEM
    vault = CredentialVault()
    pem_content = vault.decrypt_pem(encrypted_pems[credential_id], x_tenant_id)

    # Get instance IP
    auth_kwargs = _build_auth_kwargs(
        x_aws_access_key_id, x_aws_secret_access_key,
        x_aws_session_token, x_aws_region
    )

    import boto3
    ec2 = boto3.client('ec2', **auth_kwargs)
    try:
        region = action.get('region', x_aws_region)
        if region != x_aws_region:
            ec2 = boto3.client('ec2', region_name=region, **{
                k: v for k, v in auth_kwargs.items() if k != 'region_name'
            })
        resp = ec2.describe_instances(InstanceIds=[action['instance_id']])
        instance = resp['Reservations'][0]['Instances'][0]
        host = instance.get('PublicIpAddress') or instance.get('PrivateIpAddress')
        if not host:
            action['status'] = 'failed'
            raise HTTPException(
                status_code=400,
                detail="Instance has no IP address available for SSH connection."
            )
    except HTTPException:
        raise
    except Exception as e:
        action['status'] = 'failed'
        raise HTTPException(status_code=400, detail=f"Failed to get instance details: {e}")

    # Execute approved commands
    action['status'] = 'executing'
    logger.info(
        f"Executing self-healing action {action_id}: "
        f"{len(approved_commands)} commands on {action['instance_id']}"
    )

    executor = SSHExecutor()
    results = executor.execute(
        host=host,
        pem_content=pem_content,
        ssh_user=action['ssh_user'],
        commands=approved_commands,
        stop_on_failure=True
    )

    # Update action with results
    action['command_results'] = results
    action['completed_at'] = datetime.datetime.utcnow().isoformat()

    # Determine overall status
    if not results:
        action['status'] = 'failed'
        overall_status = 'failed'
    elif all(r['status'] == 'success' for r in results):
        action['status'] = 'success'
        overall_status = 'success'
    elif any(r['status'] == 'success' for r in results):
        action['status'] = 'partial_success'
        overall_status = 'partial_success'
    else:
        action['status'] = 'failed'
        overall_status = 'failed'

    # Update credential last_used_at
    if credential_id in credentials_store:
        credentials_store[credential_id]['last_used_at'] = \
            datetime.datetime.utcnow().isoformat()

    logger.info(f"Self-healing action {action_id} completed: {overall_status}")

    return SelfHealExecutionResponse(
        action_id=action_id,
        instance_id=action['instance_id'],
        status=overall_status,
        results=[CommandResult(**r) for r in results],
        message=f"Execution completed: {overall_status}. "
                f"{sum(1 for r in results if r['status'] == 'success')}/{len(results)} "
                f"commands succeeded."
    )


@router.post("/{action_id}/reject")
def reject_remediation(
    action_id: str,
    x_tenant_id: str = Header(..., alias="X-Tenant-ID"),
):
    """Reject a proposed remediation. No commands will be executed."""
    if action_id not in actions_store:
        raise HTTPException(status_code=404, detail="Action not found")

    action = actions_store[action_id]
    if action['tenant_id'] != x_tenant_id:
        raise HTTPException(status_code=403, detail="Access denied")

    if action['status'] != 'pending':
        raise HTTPException(
            status_code=400,
            detail=f"Action is in '{action['status']}' state. Only 'pending' actions can be rejected."
        )

    action['status'] = 'rejected'
    action['completed_at'] = datetime.datetime.utcnow().isoformat()

    logger.info(f"Self-healing action {action_id} rejected by user")

    return {
        "action_id": action_id,
        "status": "rejected",
        "message": "Remediation proposal rejected. No commands were executed."
    }


@router.get("/pending")
def get_pending_actions(
    x_tenant_id: str = Header(..., alias="X-Tenant-ID"),
):
    """Get all pending self-healing proposals awaiting user approval."""
    pending = [
        SelfHealHistoryItem(**{k: v for k, v in action.items()
                               if k not in ('tenant_id', 'credential_id', 'region')})
        for action in actions_store.values()
        if action['tenant_id'] == x_tenant_id and action['status'] == 'pending'
    ]
    return {"actions": pending, "total": len(pending)}


@router.get("/history", response_model=SelfHealHistoryResponse)
def get_action_history(
    x_tenant_id: str = Header(..., alias="X-Tenant-ID"),
    limit: int = 50,
):
    """Get the full audit trail of self-healing actions."""
    tenant_actions = [
        SelfHealHistoryItem(**{k: v for k, v in action.items()
                               if k not in ('tenant_id', 'credential_id', 'region')})
        for action in sorted(
            actions_store.values(),
            key=lambda a: a.get('created_at', ''),
            reverse=True
        )
        if action['tenant_id'] == x_tenant_id
    ][:limit]

    return SelfHealHistoryResponse(
        actions=tenant_actions,
        total=len(tenant_actions)
    )


def _find_credential_for_instance(
    tenant_id: str, instance_id: str, auth_kwargs: dict, region: str
) -> Optional[str]:
    """
    Find a stored PEM credential that matches the key pair of the given instance.
    Returns the credential_id or None.
    """
    import boto3

    # Get the instance's key pair name
    try:
        ec2 = boto3.client('ec2', **{**auth_kwargs, 'region_name': region})
        resp = ec2.describe_instances(InstanceIds=[instance_id])
        instance = resp['Reservations'][0]['Instances'][0]
        instance_key_name = instance.get('KeyName')
        if not instance_key_name:
            return None
    except Exception as e:
        logger.error(f"Failed to get instance key name: {e}")
        return None

    # Check if any stored credential matches
    for cred_id, cred in credentials_store.items():
        if (cred['tenant_id'] == tenant_id and
                cred.get('aws_key_pair_name') == instance_key_name):
            return cred_id

    return None
