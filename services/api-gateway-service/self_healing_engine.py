"""
Self-Healing Engine — ResolveOps AI
====================================
Evaluates predictions from PredictiveEngine and dispatches the appropriate
remediation action: Kubernetes rollout restart, AWS EC2 start, SQS purge,
or a safe 'simulated' mode when cloud credentials are unavailable.

Safety design:
  - Only non-destructive actions (restart / start / purge DLQ).
  - Per-service cooldown window (default 10 min) to prevent flapping.
  - Confidence gate: only acts when confidence_score >= threshold.
  - Full result returned for audit storage by the caller.
"""

from __future__ import annotations

import os
import logging
import datetime
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)

# ── Configuration ─────────────────────────────────────────────────────────────
HEAL_CONFIDENCE_THRESHOLD: int = int(os.getenv("HEAL_CONFIDENCE_THRESHOLD", "85"))
SELF_HEALING_ENABLED: bool = os.getenv("SELF_HEALING_ENABLED", "true").lower() == "true"
HEAL_COOLDOWN_SECONDS: int = int(os.getenv("HEAL_COOLDOWN_SECONDS", "600"))  # 10 minutes

# In-process cooldown store: {service: last_healed_datetime}
_cooldown: Dict[str, datetime.datetime] = {}


def _in_cooldown(service: str) -> bool:
    """Returns True if this service was healed recently (within cooldown window)."""
    last = _cooldown.get(service)
    if not last:
        return False
    age = (datetime.datetime.utcnow() - last).total_seconds()
    return age < HEAL_COOLDOWN_SECONDS


def _set_cooldown(service: str) -> None:
    _cooldown[service] = datetime.datetime.utcnow()


# ── Result helper ─────────────────────────────────────────────────────────────
def _result(action: str, target: str, status: str, message: str) -> Dict[str, Any]:
    return {
        "action_taken": action,
        "target_resource": target,
        "status": status,
        "result_message": message,
    }


# ── Kubernetes Remediation ────────────────────────────────────────────────────
def _k8s_rollout_restart(service: str, kubeconfig_yaml: str) -> Dict[str, Any]:
    """
    Performs kubectl rollout restart deployment/<service> via the Python
    kubernetes client using the kubeconfig fetched from kubernetes_helper.
    """
    try:
        import yaml as pyyaml
        from kubernetes import client as k8s_client, config as k8s_config

        kubeconfig_dict = pyyaml.safe_load(kubeconfig_yaml)
        api_client = k8s_config.new_client_from_config_dict(kubeconfig_dict)
        apps_v1 = k8s_client.AppsV1Api(api_client)

        deps = apps_v1.list_deployment_for_all_namespaces(timeout_seconds=10)
        matched = None
        for d in deps.items:
            if service.lower() in d.metadata.name.lower():
                matched = d
                break

        if not matched:
            return _result(
                "k8s_rollout_restart",
                service,
                "failed",
                f"No deployment matching '{service}' found in any namespace."
            )

        namespace = matched.metadata.namespace
        dep_name = matched.metadata.name
        now_ts = datetime.datetime.utcnow().isoformat()
        patch_body = {
            "spec": {
                "template": {
                    "metadata": {
                        "annotations": {
                            "kubectl.kubernetes.io/restartedAt": now_ts
                        }
                    }
                }
            }
        }
        apps_v1.patch_namespaced_deployment(
            name=dep_name,
            namespace=namespace,
            body=patch_body
        )
        return _result(
            "k8s_rollout_restart",
            f"deployment/{dep_name} (ns={namespace})",
            "success",
            f"Rollout restart applied to deployment '{dep_name}' in namespace '{namespace}' at {now_ts}."
        )

    except ImportError:
        return _result("k8s_rollout_restart", service, "failed", "kubernetes Python client not installed.")
    except Exception as exc:
        return _result("k8s_rollout_restart", service, "failed", f"K8s restart failed: {type(exc).__name__}: {exc}")


# ── AWS EC2 Remediation ───────────────────────────────────────────────────────
def _aws_ec2_start(service: str, aws_creds: Dict[str, Any]) -> Dict[str, Any]:
    """
    Finds stopped EC2 instances tagged with auto-heal=true and starts them.
    """
    try:
        import boto3

        region = aws_creds.get("region", "us-east-1")
        session = boto3.Session(
            aws_access_key_id=aws_creds.get("access_key_id"),
            aws_secret_access_key=aws_creds.get("secret_access_key"),
            aws_session_token=aws_creds.get("session_token"),
            region_name=region,
        )
        ec2 = session.client("ec2")

        resp = ec2.describe_instances(
            Filters=[
                {"Name": "instance-state-name", "Values": ["stopped"]},
                {"Name": "tag:auto-heal", "Values": ["true"]},
            ]
        )
        instance_ids = [
            i["InstanceId"]
            for r in resp.get("Reservations", [])
            for i in r.get("Instances", [])
        ]

        if not instance_ids:
            return _result(
                "ec2_start",
                service,
                "simulated",
                "No stopped EC2 instances with tag 'auto-heal=true' found. No action taken."
            )

        ec2.start_instances(InstanceIds=instance_ids)
        return _result(
            "ec2_start",
            ", ".join(instance_ids),
            "success",
            f"Started {len(instance_ids)} EC2 instance(s): {', '.join(instance_ids)}"
        )

    except Exception as exc:
        return _result("ec2_start", service, "failed", f"EC2 start failed: {type(exc).__name__}: {exc}")


def _aws_sqs_purge_dlq(service: str, aws_creds: Dict[str, Any]) -> Dict[str, Any]:
    """
    Finds SQS Dead-Letter Queues whose name contains the service and purges them.
    """
    try:
        import boto3

        region = aws_creds.get("region", "us-east-1")
        session = boto3.Session(
            aws_access_key_id=aws_creds.get("access_key_id"),
            aws_secret_access_key=aws_creds.get("secret_access_key"),
            aws_session_token=aws_creds.get("session_token"),
            region_name=region,
        )
        sqs = session.client("sqs")

        resp = sqs.list_queues(QueueNamePrefix="")
        queue_urls = resp.get("QueueUrls", [])
        dlq_urls = [u for u in queue_urls if "dlq" in u.lower() or "dead" in u.lower()]
        svc_key = service.lower().replace("-", "").replace("_", "")
        service_dlqs = [u for u in dlq_urls if svc_key in u.lower().replace("-", "").replace("_", "")]

        if not service_dlqs:
            return _result(
                "sqs_purge_dlq",
                service,
                "simulated",
                "No matching DLQ found for this service. No purge performed."
            )

        for url in service_dlqs:
            sqs.purge_queue(QueueUrl=url)

        return _result(
            "sqs_purge_dlq",
            ", ".join(service_dlqs),
            "success",
            f"Purged {len(service_dlqs)} DLQ(s) for service '{service}'."
        )

    except Exception as exc:
        return _result("sqs_purge_dlq", service, "failed", f"SQS purge failed: {type(exc).__name__}: {exc}")


# ── Simulated Mode ────────────────────────────────────────────────────────────
def _simulate(service: str, failure_type: str, action: str) -> Dict[str, Any]:
    return _result(
        action,
        service,
        "simulated",
        (
            f"Self-healing triggered for service '{service}' "
            f"(failure_type='{failure_type}'). "
            "No cloud credentials available — action was SIMULATED and recorded for audit. "
            "Connect AWS or Azure in Integrations to enable real remediation."
        )
    )


# ── Main Entry Point ──────────────────────────────────────────────────────────
def execute(
    prediction_details: Dict[str, Any],
    tenant_email: str,
    tenant_id: str,
    kubeconfig_yaml: Optional[str] = None,
    aws_creds: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    """
    Evaluate prediction and attempt remediation.

    Returns:
        Dict with action_taken, target_resource, status, result_message
        OR None if healing is disabled / confidence below threshold / cooldown active.
    """
    if not SELF_HEALING_ENABLED:
        logger.info("[SelfHealing] Disabled via SELF_HEALING_ENABLED env var.")
        return None

    confidence = prediction_details.get("confidence_score", 0)
    risk = prediction_details.get("risk_score", 0)
    service = prediction_details.get("service", "unknown")
    failure_type = prediction_details.get("failure_type", "Unknown")

    if confidence < HEAL_CONFIDENCE_THRESHOLD:
        logger.info(
            f"[SelfHealing] Skipping — confidence {confidence} < threshold {HEAL_CONFIDENCE_THRESHOLD}"
        )
        return None

    if _in_cooldown(service):
        logger.info(
            f"[SelfHealing] Skipping '{service}' — still in cooldown window ({HEAL_COOLDOWN_SECONDS}s)"
        )
        return None

    logger.warning(
        f"[SelfHealing] TRIGGERING for service='{service}' "
        f"failure_type='{failure_type}' risk={risk} confidence={confidence}"
    )

    # ── Select remediation strategy based on failure type ─────────────────────
    result: Dict[str, Any]

    if "OOM" in failure_type or "Memory" in failure_type or "CrashLoop" in failure_type:
        if kubeconfig_yaml:
            result = _k8s_rollout_restart(service, kubeconfig_yaml)
        elif aws_creds:
            result = _aws_ec2_start(service, aws_creds)
        else:
            result = _simulate(service, failure_type, "k8s_rollout_restart")

    elif "Disk" in failure_type or "Saturation" in failure_type:
        if aws_creds:
            result = _aws_sqs_purge_dlq(service, aws_creds)
        elif kubeconfig_yaml:
            result = _k8s_rollout_restart(service, kubeconfig_yaml)
        else:
            result = _simulate(service, failure_type, "sqs_purge_dlq")

    elif "Latency" in failure_type or "Connection Pool" in failure_type:
        if kubeconfig_yaml:
            result = _k8s_rollout_restart(service, kubeconfig_yaml)
        elif aws_creds:
            result = _aws_ec2_start(service, aws_creds)
        else:
            result = _simulate(service, failure_type, "k8s_rollout_restart")

    elif "Warning" in failure_type or "Cascading" in failure_type:
        if kubeconfig_yaml:
            result = _k8s_rollout_restart(service, kubeconfig_yaml)
        else:
            result = _simulate(service, failure_type, "k8s_rollout_restart")

    else:
        if kubeconfig_yaml:
            result = _k8s_rollout_restart(service, kubeconfig_yaml)
        elif aws_creds:
            result = _aws_ec2_start(service, aws_creds)
        else:
            result = _simulate(service, failure_type, "k8s_rollout_restart")

    _set_cooldown(service)

    logger.warning(
        f"[SelfHealing] Completed: service='{service}' "
        f"action='{result['action_taken']}' status='{result['status']}'"
    )
    return result
