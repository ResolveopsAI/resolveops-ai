try:
    from mcp.server.fastmcp import FastMCP
except ImportError:
    from mcp.server import FastMCP

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

mcp = FastMCP("operations")

# 1. AWS Tool registrations
# Legacy names
mcp.tool(name="aws_get_ec2_instance_health")(aws_get_ec2_instance_health)
mcp.tool(name="aws_get_cloudwatch_log_evidence")(aws_get_cloudwatch_log_evidence)
mcp.tool(name="aws_get_cloudwatch_metric_evidence")(aws_get_cloudwatch_metric_evidence)
mcp.tool(name="aws_get_cloudtrail_changes")(aws_get_cloudtrail_changes)
# Domain structured names
mcp.tool(name="aws.ec2.get_instance_health")(aws_get_ec2_instance_health)
mcp.tool(name="aws.cloudwatch.get_log_evidence")(aws_get_cloudwatch_log_evidence)
mcp.tool(name="aws.cloudwatch.get_metric_evidence")(aws_get_cloudwatch_metric_evidence)
mcp.tool(name="aws.cloudtrail.get_changes")(aws_get_cloudtrail_changes)

# 2. Kubernetes Tool registrations
# Legacy names
mcp.tool(name="kubernetes_get_workloads")(kubernetes_get_workloads)
# Domain structured names
mcp.tool(name="kubernetes.get_workloads")(kubernetes_get_workloads)

# 3. GitHub Tool registrations
# Legacy names
mcp.tool(name="github_get_failed_workflow_evidence")(github_get_failed_workflow_evidence)
mcp.tool(name="github_get_recent_deployment_change")(github_get_recent_deployment_change)
# Domain structured names
mcp.tool(name="github.get_failed_workflow_evidence")(github_get_failed_workflow_evidence)
mcp.tool(name="github.get_recent_deployment_change")(github_get_recent_deployment_change)

# 4. Docker / Runtime Tool registrations
# Legacy names
mcp.tool(name="docker_get_service_evidence")(docker_get_service_evidence)
# Domain structured names
mcp.tool(name="runtime.get_service_evidence")(docker_get_service_evidence)

# 5. Incident Tool registrations
# Legacy names
mcp.tool(name="resolveops_get_incident")(resolveops_get_incident)
mcp.tool(name="resolveops_get_recent_incidents")(resolveops_get_recent_incidents)
mcp.tool(name="resolveops_get_service_health")(resolveops_get_service_health)
# Domain structured names
mcp.tool(name="incidents.get_incident")(resolveops_get_incident)
mcp.tool(name="incidents.get_recent_incidents")(resolveops_get_recent_incidents)
mcp.tool(name="incidents.get_service_health")(resolveops_get_service_health)

# Get ASGI application
fastmcp_asgi_app = mcp.streamable_http_app()
