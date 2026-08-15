import boto3
import logging
import time
from typing import Dict, List, Any
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)

class AWSRuntimeService:
    def __init__(self, auth_kwargs: Dict):
        self.auth_kwargs = auth_kwargs

    def _get_client(self, service_name: str, region: str):
        kwargs = self.auth_kwargs.copy()
        if region:
            kwargs['region_name'] = region
        return boto3.client(service_name, **kwargs)

    def get_ec2_runtime(self, instance_id: str, region: str) -> Dict:
        """
        Attempts to fetch runtime info (containers, processes) from an EC2 instance via SSM.
        Returns a structured dictionary with partial_success pattern.
        """
        result = {
            "status": "unavailable",
            "message": "",
            "runtime": {
                "containers": [],
                "processes": []
            }
        }
        
        try:
            ssm = self._get_client('ssm', region)
            
            # 1. Check if SSM is available for this instance
            try:
                info = ssm.describe_instance_information(
                    InstanceInformationFilterList=[
                        {'key': 'InstanceIds', 'valueSet': [instance_id]}
                    ]
                )
                if not info.get("InstanceInformationList"):
                    result["status"] = "permission_required"
                    result["message"] = "Runtime discovery requires AWS Systems Manager or a ResolveOps agent."
                    return result
            except ClientError as e:
                result["status"] = "permission_required"
                result["message"] = f"Runtime discovery requires AWS Systems Manager or a ResolveOps agent. ({str(e)})"
                return result

            # 2. Try to run commands to get containers
            # Example command: docker ps --format '{{.ID}}|{{.Image}}|{{.Status}}|{{.Names}}'
            # Note: A real implementation would wait for the command invocation to complete.
            # Here we simulate the command request and return a mocked parsed response or error
            try:
                import json
                script = (
                    "if command -v docker &>/dev/null; then DOCKER_CMD=\"docker\"; "
                    "elif [ -x /snap/bin/docker ]; then DOCKER_CMD=\"/snap/bin/docker\"; "
                    "elif [ -x /usr/bin/docker ]; then DOCKER_CMD=\"/usr/bin/docker\"; "
                    "elif [ -x /usr/local/bin/docker ]; then DOCKER_CMD=\"/usr/local/bin/docker\"; "
                    "else DOCKER_CMD=\"\"; fi; "
                    "if [ -z \"$DOCKER_CMD\" ]; then echo 'DOCKER_MISSING'; "
                    "elif ! $DOCKER_CMD ps > /dev/null 2>&1; then echo 'DOCKER_DENIED'; "
                    "else echo 'DOCKER_OK'; echo '---PS---'; $DOCKER_CMD ps -a --format '{{json .}}'; "
                    "echo '---STATS---'; $DOCKER_CMD stats --no-stream --format '{{json .}}'; "
                    "echo '---DF---'; $DOCKER_CMD system df --format '{{json .}}'; fi; "
                    "echo '---HOST---'; df -h; echo '---FREE---'; free -m; echo '---UPTIME---'; uptime"
                )
                cmd = ssm.send_command(
                    InstanceIds=[instance_id],
                    DocumentName="AWS-RunShellScript",
                    Parameters={"commands": [script]}
                )
                command_id = cmd['Command']['CommandId']
                
                # Poll for up to 5 seconds
                invocation = None
                for _ in range(5):
                    time.sleep(1)
                    try:
                        inv = ssm.get_command_invocation(CommandId=command_id, InstanceId=instance_id)
                        if inv['Status'] in ['Success', 'Failed', 'Cancelled', 'TimedOut']:
                            invocation = inv
                            break
                    except ClientError:
                        pass
                
                if invocation and invocation['Status'] == 'Success':
                    output = invocation['StandardOutputContent']
                    
                    if 'DOCKER_MISSING' in output:
                        result["message"] = "Docker is not installed on this EC2 instance."
                    elif 'DOCKER_DENIED' in output:
                        result["message"] = "Docker exists, but the runtime user cannot access Docker."
                    else:
                        result["message"] = "Runtime workloads discovered successfully."
                        
                    result["runtime"]["raw_output"] = output
                    if '---PS---' in output:
                        try:
                            ps_out = output.split('---PS---')[1].split('---')[0].strip()
                            for line in ps_out.split('\n'):
                                if line.strip():
                                    try:
                                        c = json.loads(line)
                                        result["runtime"]["containers"].append({
                                            "id": c.get("ID", ""),
                                            "image": c.get("Image", ""),
                                            "status": c.get("Status", ""),
                                            "name": c.get("Names", "")
                                        })
                                    except Exception:
                                        pass
                        except Exception:
                            pass
                elif invocation:
                    result["message"] = f"SSM command executed but failed with status: {invocation['Status']}."
                else:
                    result["message"] = "SSM command sent but timed out waiting for results."
                    
            except ClientError as e:
                result["message"] = f"Failed to send SSM command: {str(e)}"
                
            result["status"] = "success" if result["runtime"]["containers"] else "partial_success"

        except Exception as e:
            logger.error(f"Error fetching runtime for EC2 {instance_id}: {e}")
            result["status"] = "error"
            result["message"] = f"Unexpected error during runtime discovery: {str(e)}"

        return result
