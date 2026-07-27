import os
import time
import logging
import httpx
from typing import Optional, Dict, Any
from app.mcp.policies import validate_repository, MAX_RECORD_COUNT
from app.mcp.audit import log_tool_call

logger = logging.getLogger(__name__)
GITHUB_SERVICE_URL = os.getenv("GITHUB_INTELLIGENCE_SERVICE_URL", "http://github-intelligence-service:8000")
TIMEOUT = 20

def get_evidence_item(source: str, resource: Optional[str], evidence_type: str, summary: str, raw_preview: Optional[str] = None) -> Dict[str, Any]:
    import datetime
    return {
        "source": source,
        "resource": resource,
        "evidence_type": evidence_type,
        "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
        "summary": summary,
        "is_live": True,
        "raw_preview": raw_preview,
    }

async def github_get_failed_workflow_evidence(repository: Optional[str] = None, workflow_run_id: Optional[str] = None) -> Dict[str, Any]:
    """Get failed workflow logs and job details as evidence.
    
    Args:
        repository: Optional name of the GitHub repository (e.g. owner/repo).
        workflow_run_id: Optional ID of the specific workflow run.
    """
    start_time = time.time()
    if repository:
        try:
            validate_repository(repository)
        except ValueError as e:
            log_tool_call("github_get_failed_workflow_evidence", {"repository": repository, "workflow_run_id": workflow_run_id}, False, (time.time() - start_time) * 1000, error=str(e))
            return {"evidence": [], "error": str(e)}

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            params = {}
            if repository:
                params["repository"] = repository
            if workflow_run_id:
                params["run_id"] = workflow_run_id

            resp = await client.get(f"{GITHUB_SERVICE_URL}/api/v1/github/runs", params=params)
            if resp.status_code != 200:
                err_msg = f"GitHub service returned {resp.status_code}"
                log_tool_call("github_get_failed_workflow_evidence", {"repository": repository, "workflow_run_id": workflow_run_id}, False, (time.time() - start_time) * 1000, error=err_msg)
                return {"evidence": [], "error": err_msg}

            runs = resp.json() if isinstance(resp.json(), list) else resp.json().get("runs", [])
            evidence = []
            for run in runs[:MAX_RECORD_COUNT]:
                if run.get("conclusion") == "failure":
                    evidence.append(get_evidence_item(
                        source="github",
                        resource=f"{run.get('repository', repository)}/{run.get('workflow_name')}",
                        evidence_type="pipeline_failure",
                        summary=(
                            f"Repo: {run.get('repository', repository)}\n"
                            f"Workflow: '{run.get('workflow_name')}' (Run #{run.get('run_number', 'unknown')})\n"
                            f"Branch: {run.get('branch', run.get('head_branch', 'unknown'))}\n"
                            f"Commit: '{run.get('commit_message', 'No message')}' by {run.get('commit_author', 'unknown')}\n"
                            f"Failed at: {run.get('updated_at', run.get('created_at', 'unknown'))}"
                        ),
                    ))
            log_tool_call("github_get_failed_workflow_evidence", {"repository": repository, "workflow_run_id": workflow_run_id}, True, (time.time() - start_time) * 1000)
            return {"evidence": evidence, "total_runs_checked": len(runs)}
    except Exception as exc:
        log_tool_call("github_get_failed_workflow_evidence", {"repository": repository, "workflow_run_id": workflow_run_id}, False, (time.time() - start_time) * 1000, error=str(exc))
        return {"evidence": [], "error": f"GitHub unavailable: {type(exc).__name__}"}

async def github_get_recent_deployment_change(repository: Optional[str] = None, time_window_minutes: int = 60) -> Dict[str, Any]:
    """Get recent deployment changes correlated with the incident window.
    
    Args:
        repository: Optional name of the GitHub repository.
        time_window_minutes: Time window in minutes.
    """
    start_time = time.time()
    if repository:
        try:
            validate_repository(repository)
        except ValueError as e:
            log_tool_call("github_get_recent_deployment_change", {"repository": repository, "time_window_minutes": time_window_minutes}, False, (time.time() - start_time) * 1000, error=str(e))
            return {"evidence": [], "error": str(e)}

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            params = {}
            if repository:
                params["repository"] = repository

            resp = await client.get(f"{GITHUB_SERVICE_URL}/api/v1/github/deployments", params=params)
            if resp.status_code != 200:
                err_msg = f"GitHub service returned {resp.status_code}"
                log_tool_call("github_get_recent_deployment_change", {"repository": repository, "time_window_minutes": time_window_minutes}, False, (time.time() - start_time) * 1000, error=err_msg)
                return {"evidence": [], "error": err_msg}

            deployments = resp.json() if isinstance(resp.json(), list) else []
            evidence = []
            for dep in deployments[:MAX_RECORD_COUNT]:
                evidence.append(get_evidence_item(
                    source="github",
                    resource=dep.get("repository"),
                    evidence_type="deployment",
                    summary=(
                        f"Deployment by {dep.get('author', 'unknown')}: "
                        f"'{dep.get('commit_msg', '')[:100]}' "
                        f"at {dep.get('timestamp', 'unknown')} "
                        f"(conclusion: {dep.get('conclusion', 'unknown')})"
                    ),
                ))
            log_tool_call("github_get_recent_deployment_change", {"repository": repository, "time_window_minutes": time_window_minutes}, True, (time.time() - start_time) * 1000)
            return {"evidence": evidence}
    except Exception as exc:
        log_tool_call("github_get_recent_deployment_change", {"repository": repository, "time_window_minutes": time_window_minutes}, False, (time.time() - start_time) * 1000, error=str(exc))
        return {"evidence": [], "error": f"GitHub unavailable: {type(exc).__name__}"}
