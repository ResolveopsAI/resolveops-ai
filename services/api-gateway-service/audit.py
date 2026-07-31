"""
Tamper-Evident Append-Only Audit Logging Helper for ResolveOps AI.
"""
import hashlib
import json
import uuid
import datetime
from typing import Optional, Dict, Any
from pg_database import AuditLog, SessionLocal


def sanitize_dict(data: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if not data or not isinstance(data, dict):
        return {}
    sanitized = {}
    sensitive_keys = {
        "password", "secret", "token", "jwt", "key", "authorization",
        "access_key", "secret_key", "api_key", "smtp_password"
    }
    for k, v in data.items():
        if any(sk in k.lower() for sk in sensitive_keys):
            sanitized[k] = "[REDACTED]"
        elif isinstance(v, dict):
            sanitized[k] = sanitize_dict(v)
        else:
            sanitized[k] = v
    return sanitized


def compute_event_hash(
    timestamp_str: str,
    actor_email: str,
    action: str,
    target_name: str,
    previous_hash: str
) -> str:
    payload = f"{timestamp_str}:{actor_email}:{action}:{target_name}:{previous_hash}"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def log_audit_event(
    action: str,
    actor_user_id: Optional[str] = None,
    actor_email: Optional[str] = None,
    actor_role: Optional[str] = None,
    target_type: Optional[str] = None,
    target_name: Optional[str] = None,
    request_id: Optional[str] = None,
    correlation_id: Optional[str] = None,
    approval_id: Optional[str] = None,
    status: str = "success",
    reason: Optional[str] = None,
    sanitized_parameters: Optional[Dict[str, Any]] = None,
    previous_state: Optional[Dict[str, Any]] = None,
    resulting_state: Optional[Dict[str, Any]] = None,
    source_ip: Optional[str] = None,
    user_agent: Optional[str] = None,
    error_code: Optional[str] = None,
    error_message: Optional[str] = None
) -> Optional[str]:
    if not SessionLocal:
        return None

    db = SessionLocal()
    try:
        # Fetch latest audit log for previous event hash
        latest_log = db.query(AuditLog).order_by(AuditLog.timestamp.desc()).first()
        previous_hash = latest_log.event_hash if (latest_log and latest_log.event_hash) else "GENESIS_HASH_00000000000000000000000000000000"

        now = datetime.datetime.utcnow()
        timestamp_str = now.isoformat()
        clean_email = actor_email or "system@resolveops.ai"
        clean_target = target_name or "global"

        event_hash = compute_event_hash(
            timestamp_str=timestamp_str,
            actor_email=clean_email,
            action=action,
            target_name=clean_target,
            previous_hash=previous_hash
        )

        audit_entry = AuditLog(
            id=str(uuid.uuid4()),
            timestamp=now,
            actor_user_id=actor_user_id,
            actor_email=clean_email,
            actor_role=actor_role or "system",
            action=action,
            target_type=target_type or "system",
            target_name=clean_target,
            request_id=request_id or str(uuid.uuid4())[:8],
            correlation_id=correlation_id,
            approval_id=approval_id,
            status=status,
            reason=reason,
            sanitized_parameters=sanitize_dict(sanitized_parameters),
            previous_state=sanitize_dict(previous_state),
            resulting_state=sanitize_dict(resulting_state),
            source_ip=source_ip,
            user_agent=user_agent,
            error_code=error_code,
            error_message=error_message,
            event_hash=event_hash,
            previous_event_hash=previous_hash
        )

        db.add(audit_entry)
        db.commit()
        return audit_entry.id
    except Exception as e:
        db.rollback()
        print(f"Failed to record audit log: {e}")
        return None
    finally:
        db.close()
