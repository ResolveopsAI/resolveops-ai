from fastapi import FastAPI, HTTPException, Request, Header, BackgroundTasks
import requests
import datetime
import os
import zipfile
import io
import re
from typing import Optional, Dict, List
from pydantic import BaseModel
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="github-intelligence-service")

# --- Repository Abstraction ---
# In-memory storage for now, designed to be swapped with PostgreSQL/DynamoDB later.
class GitHubDataRepository:
    def __init__(self):
        # Maps token (or derived hash) to user data for isolation.
        # Structure: { "token": { "user": {}, "repos": [], "workflows": [], "runs": [], "last_synced_at": "" } }
        self.store = {}

    def _get_or_create(self, token: str):
        if token not in self.store:
            self.store[token] = {
                "user": {},
                "repos": [],
                "workflows": [],
                "runs": [],
                "last_synced_at": None,
                "warnings": []
            }
        return self.store[token]

    def save_sync_data(self, token: str, user: dict, repos: list, workflows: list, runs: list, warnings: list):
        data = self._get_or_create(token)
        data["user"] = user
        data["repos"] = repos
        data["workflows"] = workflows
        data["runs"] = runs
        data["warnings"] = warnings
        data["last_synced_at"] = datetime.datetime.utcnow().isoformat() + "Z"

    def get_data(self, token: str):
        return self.store.get(token, {})

db = GitHubDataRepository()
# ------------------------------

def get_github_headers(token: str):
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28"
    }

def fetch_paginated(url: str, token: str, max_pages: int = 10):
    headers = get_github_headers(token)
    results = []
    page = 1
    while url and page <= max_pages:
        try:
            res = requests.get(url, headers=headers, timeout=15)
            res.raise_for_status()
            data = res.json()
            if isinstance(data, list):
                results.extend(data)
            elif isinstance(data, dict):
                # Sometimes lists are wrapped (like workflows or workflow_runs)
                if "workflows" in data:
                    results.extend(data["workflows"])
                elif "workflow_runs" in data:
                    results.extend(data["workflow_runs"])
            
            # Check for next page via Link header
            if "next" in res.links:
                url = res.links["next"]["url"]
                page += 1
            else:
                break
        except requests.exceptions.RequestException as e:
            logger.error(f"Error fetching paginated data: {e}")
            break
    return results

def normalize_repo(repo: dict) -> dict:
    """Normalize a GitHub API repo object to the standard schema."""
    return {
        "id": str(repo.get("id", "")),
        "name": repo.get("name", ""),
        "full_name": repo.get("full_name", ""),
        "owner": (repo.get("owner") or {}).get("login", ""),
        "private": repo.get("private", False),
        "html_url": repo.get("html_url", ""),
        "default_branch": repo.get("default_branch", "main"),
        "updated_at": repo.get("updated_at", "")
    }

def normalize_workflow(wf: dict, repo_full_name: str) -> dict:
    """Normalize a GitHub API workflow object to the standard schema."""
    return {
        "id": str(wf.get("id", "")),
        "repository": repo_full_name,
        "name": wf.get("name", ""),
        "path": wf.get("path", ""),
        "state": wf.get("state", ""),
        "html_url": wf.get("html_url", "")
    }

def normalize_run(r: dict, repo_full_name: str, owner: str) -> dict:
    """Normalize a GitHub API workflow run object to the standard schema."""
    return {
        "id": str(r.get("id", "")),
        "repository": repo_full_name,
        "owner": owner,
        "workflow_name": r.get("name", ""),
        "workflow_id": str(r.get("workflow_id", "")),
        "branch": r.get("head_branch", ""),
        "status": r.get("status", ""),
        "conclusion": r.get("conclusion") or r.get("status", ""),
        "event": r.get("event", ""),
        "run_number": str(r.get("run_number", "")),
        "created_at": r.get("created_at", ""),
        "updated_at": r.get("updated_at", ""),
        "html_url": r.get("html_url", ""),
        "logs_available": True,
        "commit_message": r.get("head_commit", {}).get("message", "").split("\n")[0] if r.get("head_commit") else "",
        "commit_author": r.get("head_commit", {}).get("author", {}).get("name", "") if r.get("head_commit") else ""
    }

@app.get("/health")
def health_check():
    return {"status": "healthy", "service": "github-intelligence-service"}

@app.get("/api/v1/github/status")
def github_status(x_github_token: Optional[str] = Header(None)):
    if not x_github_token:
        raise HTTPException(status_code=401, detail="GitHub PAT is missing")
    
    logger.info(f"GitHub status check: token found = True")
    headers = get_github_headers(x_github_token)
    try:
        res = requests.get("https://api.github.com/user", headers=headers, timeout=10)
        if res.status_code == 401:
            raise HTTPException(status_code=401, detail="GitHub token is invalid or expired.")
        if res.status_code == 403:
            raise HTTPException(status_code=403, detail="GitHub token does not have required permissions or rate limit exceeded.")
        res.raise_for_status()
        user_data = res.json()
        
        username = user_data.get("login")
        logger.info(f"GitHub status: connected as {username}")
        
        return {
            "status": "connected",
            "username": username,
            "name": user_data.get("name"),
            "avatar_url": user_data.get("avatar_url")
        }
    except requests.exceptions.RequestException as e:
        logger.error(f"GitHub Status Error: {e}")
        if isinstance(e, requests.exceptions.HTTPError) and e.response.status_code in [401, 403]:
            raise
        raise HTTPException(status_code=500, detail="Error communicating with GitHub API")

class SyncRequest(BaseModel):
    scope: str = "owned"

@app.post("/api/v1/github/sync")
def sync_github(req: SyncRequest, x_github_token: Optional[str] = Header(None)):
    if not x_github_token:
        raise HTTPException(status_code=401, detail="GitHub PAT is missing")
    
    logger.info("GitHub sync: starting sync process, token found = True")
    headers = get_github_headers(x_github_token)
    warnings = []
    
    # 1. Validate & get user
    try:
        user_res = requests.get("https://api.github.com/user", headers=headers, timeout=10)
        if user_res.status_code == 401:
            raise HTTPException(status_code=401, detail="GitHub token is invalid or expired.")
        user_res.raise_for_status()
        user_data = user_res.json()
        username = user_data.get("login")
        logger.info(f"GitHub sync: authenticated as {username}")
    except requests.exceptions.HTTPError as e:
        raise HTTPException(status_code=e.response.status_code, detail="GitHub API error validating token.")

    # 2. Fetch Repositories
    url_scope_params = "visibility=all&affiliation=owner,collaborator,organization_member&sort=updated&direction=desc"

    raw_repos = fetch_paginated(
        f"https://api.github.com/user/repos?per_page=100&{url_scope_params}",
        x_github_token
    )
    
    filtered_repos = raw_repos
    excluded_count = 0
    if req.scope in ["owned", "public_owned"]:
        filtered_repos = [r for r in raw_repos if (r.get("owner") or {}).get("login", "").lower() == (username or "").lower()]
        if req.scope == "public_owned":
            filtered_repos = [r for r in filtered_repos if not r.get("private", True)]
        excluded_count = len(raw_repos) - len(filtered_repos)
        if len(filtered_repos) == 0 and len(raw_repos) > 0:
            sample_owners = list(set([r.get("owner", {}).get("login", "unknown") for r in raw_repos]))[:5]
            logger.info(f"GitHub sync: 0 owned_repos found. Sample owners from raw: {sample_owners}")
    
    logger.info(f"GitHub sync: username={username}")
    logger.info(f"GitHub sync: scope={req.scope}")
    logger.info(f"GitHub sync: raw_repos={len(raw_repos)}")
    if req.scope in ["owned", "public_owned"]:
        logger.info(f"GitHub sync: owned_repos={len(filtered_repos)}")
        logger.info(f"GitHub sync: excluded_repos={excluded_count}")
    logger.info(f"GitHub sync: final_repositories_count={len(filtered_repos)}")
    
    # Normalize repos
    repos_normalized = [normalize_repo(r) for r in filtered_repos]
    
    workflows_normalized = []
    runs_normalized = []
    
    # 3 & 4. Fetch Workflows and Runs per repo CONCURRENTLY
    import concurrent.futures

    def fetch_repo_data(repo):
        repo_full_name = repo.get("full_name")
        owner = (repo.get("owner") or {}).get("login")
        repo_name = repo.get("name")
        
        repo_wfs = []
        repo_runs = []
        repo_warnings = []
        
        # Fetch workflows
        try:
            raw_workflows = fetch_paginated(
                f"https://api.github.com/repos/{owner}/{repo_name}/actions/workflows?per_page=100",
                x_github_token
            )
            for wf in raw_workflows:
                repo_wfs.append(normalize_workflow(wf, repo_full_name))
        except Exception as e:
            logger.error(f"GitHub sync: error fetching workflows for {repo_full_name}: {e}")
            repo_warnings.append({"message": f"Could not fetch workflows for {repo_full_name}"})
        
        # Fetch runs (limit pages per repo to avoid rate limits)
        try:
            raw_runs = fetch_paginated(
                f"https://api.github.com/repos/{owner}/{repo_name}/actions/runs?per_page=50",
                x_github_token,
                max_pages=2
            )
            for r in raw_runs:
                repo_runs.append(normalize_run(r, repo_full_name, owner))
        except Exception as e:
            logger.error(f"GitHub sync: error fetching runs for {repo_full_name}: {e}")
            repo_warnings.append({"message": f"Could not fetch workflow runs for {repo_full_name}"})
            
        return repo_wfs, repo_runs, repo_warnings

    # Use a ThreadPool to fetch all repos in parallel (max 15 concurrent to avoid rate limits)
    with concurrent.futures.ThreadPoolExecutor(max_workers=15) as executor:
        futures = {executor.submit(fetch_repo_data, repo): repo for repo in filtered_repos}
        for future in concurrent.futures.as_completed(futures):
            try:
                repo_wfs, repo_runs, repo_warnings = future.result()
                workflows_normalized.extend(repo_wfs)
                runs_normalized.extend(repo_runs)
                warnings.extend(repo_warnings)
            except Exception as e:
                logger.error(f"GitHub sync parallel error: {e}")

    logger.info(f"GitHub sync: workflows fetched = {len(workflows_normalized)}")
    logger.info(f"GitHub sync: workflow runs fetched = {len(runs_normalized)}")

    # Save to "DB"
    # Overwrite the cache for this user so old accessible repos don't remain when switching to owned
    db.save_sync_data(x_github_token, user_data, repos_normalized, workflows_normalized, runs_normalized, warnings)
    db.store[x_github_token]["scope"] = req.scope
    
    failed_runs = sum(1 for r in runs_normalized if r["conclusion"] == "failure")
    success_runs = sum(1 for r in runs_normalized if r["conclusion"] == "success")
    in_progress = sum(1 for r in runs_normalized if r["status"] in ["in_progress", "queued", "pending"])
    
    # Determine status
    if not raw_repos:
        status_str = "connected_no_repositories"
        warnings.append({
            "message": "GitHub token is valid, but no repositories are accessible. Check fine-grained PAT repository access and Actions permissions."
        })
    elif not repos_normalized:
        status_str = "connected_no_repositories"
        warnings.append({
            "message": "No owned repositories matched the authenticated GitHub username. Check owner filtering logic."
        })
    elif not workflows_normalized:
        status_str = "partial_success"
        warnings.append({"message": "Repositories found, but no GitHub Actions workflows were detected."})
    elif not runs_normalized:
        status_str = "partial_success"
        warnings.append({"message": "Workflows found, but no recent workflow runs were found."})
    elif warnings:
        status_str = "partial_success"
    else:
        status_str = "success"

    logger.info(f"GitHub sync: complete. status={status_str}, warnings={len(warnings)}")

    return {
        "status": status_str,
        "connected": True,
        "username": username,
        "raw_repositories_count": len(raw_repos),
        "owned_repositories_count": len(filtered_repos),
        "repositories_count": len(repos_normalized),
        "workflows_count": len(workflows_normalized),
        "workflow_runs_count": len(runs_normalized),
        "failed_runs_count": failed_runs,
        "successful_runs_count": success_runs,
        "in_progress_runs_count": in_progress,
        "repositories": repos_normalized,
        "workflows": workflows_normalized,
        "runs": runs_normalized,
        "warnings": warnings,
        "scope": req.scope,
        "last_synced_at": datetime.datetime.utcnow().isoformat() + "Z"
    }

@app.get("/api/v1/github/repos")
def get_repos(x_github_token: Optional[str] = Header(None)):
    data = db.get_data(x_github_token)
    return {"repos": data.get("repos", [])}

@app.get("/api/v1/github/workflows")
def get_workflows(x_github_token: Optional[str] = Header(None)):
    data = db.get_data(x_github_token)
    return {"workflows": data.get("workflows", [])}

@app.get("/api/v1/github/runs")
def get_runs(x_github_token: Optional[str] = Header(None)):
    data = db.get_data(x_github_token)
    # Sort runs by created_at descending
    runs = data.get("runs", [])
    runs.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    
    # Compute counts
    failed_runs = sum(1 for r in runs if r.get("conclusion") == "failure")
    success_runs = sum(1 for r in runs if r.get("conclusion") == "success")
    in_progress = sum(1 for r in runs if r.get("status") in ["in_progress", "queued", "pending"])
    
    return {
        "runs": runs,
        "summary": {
            "total": len(runs),
            "failed": failed_runs,
            "success": success_runs,
            "in_progress": in_progress
        },
        "last_synced_at": data.get("last_synced_at")
    }

@app.get("/api/v1/github/runs/{owner}/{repo}/{run_id}/logs")
def get_workflow_logs(owner: str, repo: str, run_id: str, x_github_token: Optional[str] = Header(None)):
    if not x_github_token:
        raise HTTPException(status_code=401, detail="GitHub PAT is missing")
    
    headers = get_github_headers(x_github_token)
    logs_url = f"https://api.github.com/repos/{owner}/{repo}/actions/runs/{run_id}/logs"
    
    try:
        # Request logs. GitHub API returns a 302 redirect to a zip file.
        # Requests follows redirects by default.
        res = requests.get(logs_url, headers=headers, timeout=30)
        
        if res.status_code == 404:
            return {"status": "logs_unavailable", "message": "Logs have expired or were deleted."}
            
        res.raise_for_status()
        
        # The content should be a zip file. We extract the text.
        try:
            with zipfile.ZipFile(io.BytesIO(res.content)) as z:
                # Find the first log file, or combine them
                log_content = ""
                for filename in z.namelist():
                    if filename.endswith(".txt"):
                        log_content += f"\n--- {filename} ---\n"
                        log_content += z.read(filename).decode("utf-8", errors="replace")
                        
                # Truncate logs if too large (e.g. limit to last 20KB)
                if len(log_content) > 20000:
                    log_content = log_content[-20000:]
                    
                return {"status": "success", "logs": log_content}
        except zipfile.BadZipFile:
            # Maybe it returned plain text instead of zip?
            return {"status": "success", "logs": res.text[-20000:]}
            
    except Exception as e:
        logger.error(f"Error fetching logs for run {run_id}: {e}")
        return {"status": "logs_unavailable", "message": str(e)}
        return {"status": "logs_unavailable", "message": str(e)}

def redact_secrets(text: str) -> str:
    """Redacts various secret formats from logs."""
    if not text:
        return text
    # GitHub PAT
    text = re.sub(r'(ghp|gho|ghu|ghs|ghr)_[a-zA-Z0-9]{36}', '[REDACTED_SECRET]', text)
    # AWS Access Key
    text = re.sub(r'AKIA[0-9A-Z]{16}', '[REDACTED_SECRET]', text)
    # AWS Secret Key (heuristic for 40 char base64)
    text = re.sub(r'(?i)(secret|key)[^\n]{0,20}[:=]\s*[a-zA-Z0-9/+]{40}', r'\1=[REDACTED_SECRET]', text)
    # Azure Client Secret/UUIDs (tenant/client ids)
    text = re.sub(r'[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}', '[REDACTED_SECRET]', text)
    # JWT Tokens
    text = re.sub(r'ey[a-zA-Z0-9_-]+\.ey[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+', '[REDACTED_SECRET]', text)
    # Passwords in URLs
    text = re.sub(r'(https?|mongodb|postgres|mysql)://[^:]+:([^@]+)@', r'\1://[REDACTED_SECRET]@', text)
    return text

def generate_rule_based_rca(logs: str) -> dict:
    """Generates a heuristic RCA based on common log patterns."""
    logs_lower = logs.lower()
    
    # Check Azure Auth
    if any(x in logs_lower for x in ["azure/login", "service_principal", "aadsts", "invalid client", "insufficient privileges"]):
        return {
            "status": "fallback_generated",
            "provider": "rule_based",
            "summary": "Azure Authentication Failure",
            "probable_root_cause": "The workflow failed to authenticate with Azure, likely due to an invalid or missing Service Principal, Client ID, or Secret.",
            "evidence": [line for line in logs.split('\n') if any(x in line.lower() for x in ["azure/login", "service_principal", "aadsts", "error"])][:3],
            "recommended_fix": [
                "Verify AZURE_CLIENT_ID, AZURE_TENANT_ID, and AZURE_CLIENT_SECRET are configured correctly in GitHub Secrets.",
                "Ensure the Service Principal has the correct RBAC role (e.g., Contributor) on the target resource group.",
                "Check if the credentials have expired in Azure AD."
            ],
            "confidence": "high",
            "ai_provider_status": "unavailable"
        }
        
    # Check Kubernetes
    if any(x in logs_lower for x in ["imagepullbackoff", "crashloopbackoff", "errimagepull", "kubectl rollout failed"]):
        return {
            "status": "fallback_generated",
            "provider": "rule_based",
            "summary": "Kubernetes Deployment Failure",
            "probable_root_cause": "A Kubernetes pod failed to start, possibly due to a missing container image or an application crash loop.",
            "evidence": [line for line in logs.split('\n') if any(x in line.lower() for x in ["imagepull", "crashloop", "error"])][:3],
            "recommended_fix": [
                "Check if the Docker image was successfully pushed to the registry.",
                "Verify image pull secrets are configured in the cluster.",
                "Check pod logs using 'kubectl logs' to diagnose application crashes."
            ],
            "confidence": "high",
            "ai_provider_status": "unavailable"
        }

    # Check Docker
    if any(x in logs_lower for x in ["denied", "unauthorized", "manifest unknown", "failed to push image"]):
        return {
            "status": "fallback_generated",
            "provider": "rule_based",
            "summary": "Docker / Registry Authentication Failure",
            "probable_root_cause": "Docker failed to push or pull an image due to missing authentication or missing tags.",
            "evidence": [line for line in logs.split('\n') if any(x in line.lower() for x in ["denied", "unauthorized", "error", "fail"])][:3],
            "recommended_fix": [
                "Ensure 'docker login' was executed before pulling/pushing.",
                "Check if registry credentials (username/password) are correct.",
                "Verify the image tag exists or is correctly formatted."
            ],
            "confidence": "medium",
            "ai_provider_status": "unavailable"
        }

    # Check Terraform
    if any(x in logs_lower for x in ["error acquiring state lock", "provider authentication failed", "authorization failed", "resource already exists"]):
        return {
            "status": "fallback_generated",
            "provider": "rule_based",
            "summary": "Terraform Execution Failure",
            "probable_root_cause": "Terraform encountered an error with state locking, provider authentication, or conflicting resources.",
            "evidence": [line for line in logs.split('\n') if any(x in line.lower() for x in ["terraform", "error", "fail"])][:3],
            "recommended_fix": [
                "If state is locked, check for other running Terraform processes or force-unlock the state if safe.",
                "Verify cloud provider credentials are set correctly.",
                "Import existing resources into state before applying, if resource already exists."
            ],
            "confidence": "medium",
            "ai_provider_status": "unavailable"
        }

    # Fallback Generic
    return {
        "status": "fallback_generated",
        "provider": "rule_based",
        "summary": "General Workflow Execution Failure",
        "probable_root_cause": "A step in the GitHub Actions workflow returned a non-zero exit code.",
        "evidence": [line for line in logs.split('\n') if "error" in line.lower() or "fail" in line.lower()][:3],
        "recommended_fix": [
            "Review the specific workflow step logs to identify the exact command that failed.",
            "Check for missing secrets or environment variables.",
            "Ensure any required dependencies or runners are available."
        ],
        "confidence": "low",
        "ai_provider_status": "unavailable"
    }

class RCARequest(BaseModel):
    repository: str

@app.post("/api/v1/github/runs/{run_id}/rca")
def generate_rca(run_id: str, req: RCARequest, x_github_token: Optional[str] = Header(None)):
    """Fetches logs and forwards to AI RCA service."""
    if not x_github_token:
        raise HTTPException(status_code=401, detail="GitHub PAT is missing")
        
    parts = req.repository.split("/")
    if len(parts) != 2:
        raise HTTPException(status_code=400, detail="Invalid repository format. Expected owner/repo")
        
    owner, repo = parts[0], parts[1]
    
    # Get logs
    log_data = get_workflow_logs(owner, repo, run_id, x_github_token)
    raw_logs = log_data.get("logs", "Logs not available.")
    
    # Redact potential secrets from logs
    raw_logs = redact_secrets(raw_logs)
    if x_github_token in raw_logs:
        raw_logs = raw_logs.replace(x_github_token, "[REDACTED_SECRET]")
        
    # Forward to ai-rca-service
    ai_rca_url = os.getenv("AI_RCA_SERVICE_URL", "http://ai-rca-service:8000")
    
    fallback_diagnosis = generate_rule_based_rca(raw_logs)
    
    try:
        rca_res = requests.post(f"{ai_rca_url}/api/v1/rca/analyze", json={
            "source": "github_actions",
            "context": f"Workflow run {run_id} failed in {req.repository}.",
            "logs": raw_logs
        }, timeout=60)
        
        if rca_res.status_code != 200:
            return {"status": "success", "diagnosis": fallback_diagnosis, "raw_logs": raw_logs}
            
        rca_data = rca_res.json()
        
        # In case the AI service returns its own diagnosis schema
        diagnosis = rca_data.get("analysis")
        if isinstance(diagnosis, str):
            # Try to upgrade string to the new structure if possible, else wrap it
            diagnosis = {
                "status": "ai_generated",
                "provider": "ai",
                "summary": "AI Analysis",
                "probable_root_cause": diagnosis,
                "evidence": [],
                "recommended_fix": [],
                "ai_provider_status": "available"
            }
            
        return {"status": "success", "diagnosis": diagnosis, "raw_logs": raw_logs}
        
    except Exception as e:
        logger.error(f"RCA generation failed: {e}")
        return {"status": "success", "diagnosis": fallback_diagnosis, "raw_logs": raw_logs}

class DispatchRequest(BaseModel):
    ref: str = "main"

@app.post("/api/v1/github/workflows/{owner}/{repo}/{workflow_id}/dispatch")
def dispatch_workflow(owner: str, repo: str, workflow_id: str, req: DispatchRequest, x_github_token: Optional[str] = Header(None)):
    """Triggers a GitHub Actions workflow dispatch."""
    if not x_github_token:
        raise HTTPException(status_code=401, detail="GitHub PAT is missing")
    
    headers = get_github_headers(x_github_token)
    dispatch_url = f"https://api.github.com/repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches"
    
    try:
        res = requests.post(dispatch_url, json={"ref": req.ref}, headers=headers, timeout=15)
        
        if res.status_code == 204:
            logger.info(f"Workflow dispatch: triggered {workflow_id} on {owner}/{repo} ref={req.ref}")
            return {"status": "success", "message": f"Workflow {workflow_id} dispatched on branch {req.ref}"}
        elif res.status_code == 403:
            return {"status": "permission_required", "message": "Workflow dispatch permission is required. Ensure your PAT has the 'actions:write' or 'workflow' permission."}
        elif res.status_code == 404:
            return {"status": "not_found", "message": "Workflow not found or dispatch is not enabled for this workflow."}
        elif res.status_code == 422:
            return {"status": "error", "message": f"Unprocessable: {res.text}"}
        else:
            return {"status": "error", "message": f"GitHub API returned {res.status_code}: {res.text}"}
    except Exception as e:
        logger.error(f"Workflow dispatch error: {e}")
        raise HTTPException(status_code=500, detail=f"Workflow dispatch failed: {str(e)}")
