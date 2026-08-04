import base64
import uuid
import logging
from fastapi import APIRouter, HTTPException, Body, Header
from typing import Optional

from models import (
    PEMUploadRequest, PEMUploadResponse,
    CredentialListItem, CredentialListResponse,
    TestConnectionRequest, TestConnectionResponse,
    InstanceMatchResult
)
from services.credential_vault import CredentialVault
from services.key_pair_matcher import KeyPairMatcher
from services.os_detector import OSDetector
from services.ssh_executor import SSHExecutor

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/credentials", tags=["SSH Credentials"])

# In-memory store for credentials metadata (in production, use PostgreSQL via API gateway)
# This service stores encrypted PEMs in blob storage and metadata here
credentials_store = {}  # credential_id -> metadata dict
encrypted_pems = {}     # credential_id -> encrypted PEM bytes


def _get_vault():
    return CredentialVault()


def _build_auth_kwargs(
    access_key_id: Optional[str] = None,
    secret_access_key: Optional[str] = None,
    session_token: Optional[str] = None,
    region: str = "us-east-1"
) -> dict:
    """Build boto3 auth kwargs from provided credentials."""
    kwargs = {'region_name': region}
    if access_key_id and secret_access_key:
        kwargs['aws_access_key_id'] = access_key_id
        kwargs['aws_secret_access_key'] = secret_access_key
        if session_token:
            kwargs['aws_session_token'] = session_token
    return kwargs


@router.post("/pem", response_model=PEMUploadResponse)
def upload_pem(
    payload: PEMUploadRequest = Body(...),
    x_tenant_id: str = Header(..., alias="X-Tenant-ID"),
    x_aws_access_key_id: Optional[str] = Header(None, alias="X-AWS-Access-Key-ID"),
    x_aws_secret_access_key: Optional[str] = Header(None, alias="X-AWS-Secret-Access-Key"),
    x_aws_session_token: Optional[str] = Header(None, alias="X-AWS-Session-Token"),
    x_aws_region: str = Header("us-east-1", alias="X-AWS-Region"),
):
    """
    Upload and encrypt a PEM file for an AWS account.
    
    After upload, the system automatically:
    1. Validates the PEM file
    2. Encrypts it with AES-256-GCM
    3. Matches it against AWS key pairs in the account
    4. Categorizes instances as matched/unmatched
    """
    # Decode PEM content from base64
    try:
        pem_content = base64.b64decode(payload.pem_content)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64-encoded PEM content")

    # Validate PEM
    vault = _get_vault()
    is_valid, error = vault.validate_pem(pem_content)
    if not is_valid:
        raise HTTPException(status_code=400, detail=error)

    # Get fingerprint
    try:
        fingerprint = vault.get_pem_fingerprint(pem_content)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Encrypt PEM
    encrypted = vault.encrypt_pem(pem_content, x_tenant_id)

    # Generate credential ID
    credential_id = str(uuid.uuid4())

    # Store encrypted PEM (in production, upload to Azure Blob Storage)
    blob_path = f"tenants/{x_tenant_id}/credentials/pem/{credential_id}.enc"
    encrypted_pems[credential_id] = encrypted

    # Match against AWS key pairs
    matched_key_name = None
    matched_instances = []
    unmatched_instances = []

    auth_kwargs = _build_auth_kwargs(
        x_aws_access_key_id, x_aws_secret_access_key,
        x_aws_session_token, x_aws_region
    )

    try:
        matcher = KeyPairMatcher(auth_kwargs)
        matched_instances, unmatched_instances, matched_key_name = \
            matcher.match_instances(pem_content, x_aws_region)
    except Exception as e:
        logger.warning(f"Key pair matching failed (non-fatal): {e}")

    # Store metadata
    credentials_store[credential_id] = {
        'id': credential_id,
        'tenant_id': x_tenant_id,
        'aws_account_id': payload.aws_account_id,
        'key_name': payload.key_name,
        'aws_key_pair_name': matched_key_name,
        'fingerprint': fingerprint,
        'blob_path': blob_path,
        'status': 'active',
        'matched_instance_count': len(matched_instances)
    }

    return PEMUploadResponse(
        credential_id=credential_id,
        key_name=payload.key_name,
        aws_account_id=payload.aws_account_id,
        fingerprint=fingerprint,
        aws_key_pair_name=matched_key_name,
        matched_instances=matched_instances,
        unmatched_instances=unmatched_instances,
        message=(
            f"PEM uploaded and encrypted. "
            f"Matched {len(matched_instances)} instance(s), "
            f"{len(unmatched_instances)} instance(s) use a different key pair."
        )
    )


@router.get("/pem", response_model=CredentialListResponse)
def list_credentials(
    x_tenant_id: str = Header(..., alias="X-Tenant-ID"),
):
    """List all stored PEM credentials for the tenant."""
    tenant_creds = [
        CredentialListItem(**cred)
        for cred in credentials_store.values()
        if cred['tenant_id'] == x_tenant_id
    ]
    return CredentialListResponse(
        credentials=tenant_creds,
        total=len(tenant_creds)
    )


@router.delete("/pem/{key_id}")
def delete_credential(
    key_id: str,
    x_tenant_id: str = Header(..., alias="X-Tenant-ID"),
):
    """Delete a stored PEM credential."""
    if key_id not in credentials_store:
        raise HTTPException(status_code=404, detail="Credential not found")

    cred = credentials_store[key_id]
    if cred['tenant_id'] != x_tenant_id:
        raise HTTPException(status_code=403, detail="Access denied")

    # Remove encrypted PEM and metadata
    encrypted_pems.pop(key_id, None)
    del credentials_store[key_id]

    return {"message": f"Credential '{cred['key_name']}' deleted successfully"}


@router.post("/pem/{key_id}/match-instances", response_model=InstanceMatchResult)
def match_instances(
    key_id: str,
    x_tenant_id: str = Header(..., alias="X-Tenant-ID"),
    x_aws_access_key_id: Optional[str] = Header(None, alias="X-AWS-Access-Key-ID"),
    x_aws_secret_access_key: Optional[str] = Header(None, alias="X-AWS-Secret-Access-Key"),
    x_aws_session_token: Optional[str] = Header(None, alias="X-AWS-Session-Token"),
    x_aws_region: str = Header("us-east-1", alias="X-AWS-Region"),
):
    """Re-check which EC2 instances match this PEM key pair."""
    if key_id not in credentials_store or key_id not in encrypted_pems:
        raise HTTPException(status_code=404, detail="Credential not found")

    cred = credentials_store[key_id]
    if cred['tenant_id'] != x_tenant_id:
        raise HTTPException(status_code=403, detail="Access denied")

    # Decrypt PEM
    vault = _get_vault()
    pem_content = vault.decrypt_pem(encrypted_pems[key_id], x_tenant_id)

    auth_kwargs = _build_auth_kwargs(
        x_aws_access_key_id, x_aws_secret_access_key,
        x_aws_session_token, x_aws_region
    )

    matcher = KeyPairMatcher(auth_kwargs)
    matched, unmatched, matched_key_name = matcher.match_instances(pem_content, x_aws_region)

    # Update stored metadata
    cred['aws_key_pair_name'] = matched_key_name
    cred['matched_instance_count'] = len(matched)

    total = len(matched) + len(unmatched)
    return InstanceMatchResult(
        matched_instances=matched,
        unmatched_instances=unmatched,
        total_instances=total,
        matched_count=len(matched),
        unmatched_count=len(unmatched)
    )


@router.post("/pem/{key_id}/test-connection", response_model=TestConnectionResponse)
def test_connection(
    key_id: str,
    payload: TestConnectionRequest = Body(...),
    x_tenant_id: str = Header(..., alias="X-Tenant-ID"),
    x_aws_access_key_id: Optional[str] = Header(None, alias="X-AWS-Access-Key-ID"),
    x_aws_secret_access_key: Optional[str] = Header(None, alias="X-AWS-Secret-Access-Key"),
    x_aws_session_token: Optional[str] = Header(None, alias="X-AWS-Session-Token"),
    x_aws_region: str = Header("us-east-1", alias="X-AWS-Region"),
):
    """Test SSH connectivity to a specific instance using the stored PEM."""
    if key_id not in credentials_store or key_id not in encrypted_pems:
        raise HTTPException(status_code=404, detail="Credential not found")

    cred = credentials_store[key_id]
    if cred['tenant_id'] != x_tenant_id:
        raise HTTPException(status_code=403, detail="Access denied")

    # Decrypt PEM
    vault = _get_vault()
    pem_content = vault.decrypt_pem(encrypted_pems[key_id], x_tenant_id)

    # Detect OS and SSH user
    auth_kwargs = _build_auth_kwargs(
        x_aws_access_key_id, x_aws_secret_access_key,
        x_aws_session_token, x_aws_region
    )

    detector = OSDetector(auth_kwargs)
    os_info = detector.detect(payload.instance_id, payload.region)

    if os_info.get('is_windows'):
        return TestConnectionResponse(
            instance_id=payload.instance_id,
            status='unsupported',
            ssh_user='',
            detected_os='windows',
            message='Windows instances do not support SSH-based self-healing.'
        )

    ssh_user = os_info['ssh_user']

    # Get instance IP
    import boto3
    ec2 = boto3.client('ec2', **auth_kwargs)
    try:
        resp = ec2.describe_instances(InstanceIds=[payload.instance_id])
        instance = resp['Reservations'][0]['Instances'][0]
        host = instance.get('PublicIpAddress') or instance.get('PrivateIpAddress')
        if not host:
            return TestConnectionResponse(
                instance_id=payload.instance_id,
                status='failed',
                ssh_user=ssh_user,
                detected_os=os_info['detected_os'],
                message='Instance has no IP address available.'
            )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to get instance details: {e}")

    # Test SSH connection
    executor = SSHExecutor()
    result = executor.test_connection(host, pem_content, ssh_user)

    return TestConnectionResponse(
        instance_id=payload.instance_id,
        status=result['status'],
        ssh_user=ssh_user,
        detected_os=os_info['detected_os'],
        message=result['message']
    )
