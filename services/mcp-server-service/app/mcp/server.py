from fastapi import FastAPI

try:
    from mcp.server.fastmcp import FastMCP
except ImportError:
    try:
        from fastmcp import FastMCP
    except ImportError:
        try:
            from mcp.server.fastmcp.server import FastMCP
        except ImportError:
            FastMCP = None

# Import tools from domain modules
from app.mcp.domains.aws_tools import (
    aws_get_ec2_instance_health,
    aws_get_cloudwatch_log_evidence,
    aws_get_cloudwatch_metric_evidence,
    aws_get_cloudtrail_changes
)
from app.mcp.domains.kubernetes_tools import kubernetes_get_workloads
from app.mcp.domains.github_tools import (
    github_get_failed_workflow_evidence,
    github_get_recent_deployment_change
)
from app.mcp.domains.runtime_tools import docker_get_service_evidence
from app.mcp.domains.incident_tools import (
    resolveops_get_incident,
    resolveops_get_recent_incidents,
    resolveops_get_service_health
)

# Safely initialize FastMCP app if FastMCP class is available, else mock dummy ASGI app
if FastMCP is not None:
    try:
        mcp = FastMCP("operations")

        # 1. AWS Tool registrations
        mcp.tool(name="aws_get_ec2_instance_health")(aws_get_ec2_instance_health)
        mcp.tool(name="aws_get_cloudwatch_log_evidence")(aws_get_cloudwatch_log_evidence)
        mcp.tool(name="aws_get_cloudwatch_metric_evidence")(aws_get_cloudwatch_metric_evidence)
        mcp.tool(name="aws_get_cloudtrail_changes")(aws_get_cloudtrail_changes)

        # 2. Kubernetes Tool registrations
        mcp.tool(name="kubernetes_get_workloads")(kubernetes_get_workloads)

        # 3. GitHub Tool registrations
        mcp.tool(name="github_get_failed_workflow_evidence")(github_get_failed_workflow_evidence)
        mcp.tool(name="github_get_recent_deployment_change")(github_get_recent_deployment_change)

        # 4. Docker / Runtime Tool registrations
        mcp.tool(name="docker_get_service_evidence")(docker_get_service_evidence)

        # 5. Incident Tool registrations
        mcp.tool(name="resolveops_get_incident")(resolveops_get_incident)
        mcp.tool(name="resolveops_get_recent_incidents")(resolveops_get_recent_incidents)
        mcp.tool(name="resolveops_get_service_health")(resolveops_get_service_health)

        if hasattr(mcp, "streamable_http_app"):
            fastmcp_asgi_app = mcp.streamable_http_app()
        elif hasattr(mcp, "http_app"):
            fastmcp_asgi_app = mcp.http_app()
        else:
            fastmcp_asgi_app = FastAPI()
    except Exception:
        fastmcp_asgi_app = FastAPI()
else:
    fastmcp_asgi_app = FastAPI()
