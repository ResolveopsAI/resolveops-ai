import os
import re
import time
import logging
from typing import List, Dict, Tuple, Optional
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

logger = logging.getLogger(__name__)

class PredictiveEngine:
    def __init__(self):
        ai_provider = os.getenv("AI_PROVIDER", "groq").lower()

        if ai_provider == "groq":
            # Groq Cloud — free tier, fast inference, supports Llama 3.1/3.3 & Mixtral
            from langchain_groq import ChatGroq
            self.chat_model = ChatGroq(
                api_key=os.getenv("GROQ_API_KEY"),
                model=os.getenv("GROQ_MODEL_NAME", "llama-3.1-8b-instant"),
                temperature=0.1,
                max_tokens=4096,
            )
            logger.info("PredictiveEngine: using Groq Cloud provider")

        elif ai_provider == "openai":
            # Ollama (or any OpenAI-compatible endpoint) running locally on the host / EC2
            from langchain_openai import ChatOpenAI
            self.chat_model = ChatOpenAI(
                api_key=os.getenv("OPENAI_API_KEY", "ollama"),
                base_url=os.getenv("OPENAI_BASE_URL", "http://ollama:11434/v1"),
                model=os.getenv("OPENAI_MODEL_NAME", "llama3.1"),
                temperature=0.1,
                max_tokens=4096,
            )
            logger.info("PredictiveEngine: using OpenAI-compatible (Ollama) provider")

        else:
            # Bedrock fallback (only used when AI_PROVIDER=bedrock)
            import boto3
            from langchain_aws import ChatBedrock
            aws_region = os.getenv("AWS_REGION", "us-east-1")
            bedrock_client = boto3.client("bedrock-runtime", region_name=aws_region)
            self.chat_model = ChatBedrock(
                client=bedrock_client,
                model_id=os.getenv("BEDROCK_MODEL_ID", "anthropic.claude-3-haiku-20240307-v1:0"),
                model_kwargs={"temperature": 0.1},
            )
            logger.info("PredictiveEngine: using Amazon Bedrock provider")

    def analyze_logs_and_predict(self, logs: List[Dict]) -> Tuple[bool, Optional[Dict]]:
        """
        Analyzes a list of historical logs for a tenant and predicts potential failures
        using heuristic trend rules: moving averages, warning acceleration, and resource trends.
        
        Returns:
            Tuple[bool, dict]: (is_anomaly_detected, prediction_details)
        """
        if not logs or len(logs) < 3:
            return False, None

        # Sort logs chronologically
        sorted_logs = sorted(logs, key=lambda x: x.get("timestamp", ""))

        # Group logs by service
        services = {}
        for log in sorted_logs:
            srv = log.get("service", "unknown")
            if srv not in services:
                services[srv] = []
            services[srv].append(log)

        for srv, srv_logs in services.items():
            # Extract latency, warnings, error indicators, resource utilization
            latencies = []
            warnings_count = 0
            errors_count = 0
            mem_pcts = []
            disk_pcts = []
            
            # Analyze resource trends from message payloads (heuristics)
            # e.g., "Memory utilization at 85%", "Disk usage 91%"
            for log in srv_logs:
                msg = log.get("message", "")
                level = log.get("level", "INFO").upper()

                if level == "WARN":
                    warnings_count += 1
                elif level in ("ERROR", "CRITICAL", "FATAL"):
                    errors_count += 1

                # Parse latency
                try:
                    latency = log.get("latency_ms")
                    if latency:
                        latencies.append(float(latency))
                except (ValueError, TypeError):
                    pass

                # Regex for memory/disk percentages in message
                mem_match = re.search(r'(?:memory|mem|ram)\s*(?:usage|utilization)?\s*(?:at|is)?\s*(\d+(?:\.\d+)?)\s*%', msg, re.IGNORECASE)
                if mem_match:
                    mem_pcts.append(float(mem_match.group(1)))

                disk_match = re.search(r'(?:disk|storage)\s*(?:usage|utilization)?\s*(?:at|is)?\s*(\d+(?:\.\d+)?)\s*%', msg, re.IGNORECASE)
                if disk_match:
                    disk_pcts.append(float(disk_match.group(1)))

            # 1. Moving Averages / Latency Growth Patterns
            latency_anomaly = False
            avg_latency = 0.0
            if len(latencies) >= 3:
                avg_latency = sum(latencies) / len(latencies)
                # If latest latency is 2x the moving average and exceeds 800ms
                if latencies[-1] > (avg_latency * 2) and latencies[-1] > 800:
                    latency_anomaly = True

            # 2. Warning Pattern Acceleration
            warning_acceleration = False
            if len(srv_logs) >= 5:
                # Count warnings in the second half vs first half of log window
                mid = len(srv_logs) // 2
                recent_warns = sum(1 for l in srv_logs[mid:] if l.get("level", "").upper() == "WARN")
                older_warns = sum(1 for l in srv_logs[:mid] if l.get("level", "").upper() == "WARN")
                if recent_warns > older_warns and recent_warns >= 3:
                    warning_acceleration = True

            # 3. Resource Utilization Trends (Sequential Upward growth)
            mem_trending_up = False
            if len(mem_pcts) >= 3:
                if all(mem_pcts[i] < mem_pcts[i+1] for i in range(len(mem_pcts)-1)) and mem_pcts[-1] > 80.0:
                    mem_trending_up = True

            disk_trending_up = False
            if len(disk_pcts) >= 3:
                if all(disk_pcts[i] < disk_pcts[i+1] for i in range(len(disk_pcts)-1)) and disk_pcts[-1] > 85.0:
                    disk_trending_up = True

            # Check if any predictive anomaly is triggered (before a hard failure/outage)
            if (latency_anomaly or warning_acceleration or mem_trending_up or disk_trending_up) and errors_count == 0:
                # Calculate Risk & Confidence Scores
                risk_score = 30
                confidence_score = 50
                failure_type = "Impending Resource Exhaustion"

                if mem_trending_up:
                    risk_score += 30
                    confidence_score += 20
                    failure_type = "Potential OOM (Out Of Memory) Outage"
                if disk_trending_up:
                    risk_score += 40
                    confidence_score += 15
                    failure_type = "Potential Disk Saturation Outage"
                if latency_anomaly:
                    risk_score += 20
                    confidence_score += 10
                    failure_type = "Service Latency Degradation / Connection Pool Exhaustion"
                if warning_acceleration:
                    risk_score += 15
                    confidence_score += 5
                    failure_type = "Cascading Warning Rate Acceleration"

                risk_score = min(risk_score, 98)
                confidence_score = min(confidence_score, 95)

                prediction_details = {
                    "service": srv,
                    "failure_type": failure_type,
                    "risk_score": risk_score,
                    "confidence_score": confidence_score,
                    "recent_logs": srv_logs[-10:],
                    "metrics": {
                        "avg_latency_ms": round(avg_latency, 2),
                        "latest_latency_ms": round(latencies[-1], 2) if latencies else None,
                        "latest_mem_pct": mem_pcts[-1] if mem_pcts else None,
                        "latest_disk_pct": disk_pcts[-1] if disk_pcts else None,
                    }
                }
                return True, prediction_details

        return False, None

    def generate_predictive_rca(self, prediction_details: Dict, deployment_context: Optional[Dict] = None) -> Dict:
        """
        Generates an AI-Assisted Predictive RCA report using the ChatBedrock model.
        """
        service = prediction_details.get("service")
        failure_type = prediction_details.get("failure_type")
        risk_score = prediction_details.get("risk_score")
        confidence_score = prediction_details.get("confidence_score")
        metrics = prediction_details.get("metrics", {})

        logs_str = "\n".join([
            f"- [{l.get('timestamp')}] {l.get('level')}: {l.get('message')}"
            for l in prediction_details.get("recent_logs", [])
        ])

        dep_str = "No recent deployments or changes correlated."
        if deployment_context:
            dep_str = (
                f"Deployment detected on {deployment_context.get('timestamp')}.\n"
                f"Commit: {deployment_context.get('commit_sha')} ({deployment_context.get('commit_msg')})\n"
                f"PR: {deployment_context.get('pr_url')}"
            )

        system_prompt = (
            "You are an expert DevSecOps SRE Predictive Assistant.\n"
            "Analyze the system diagnostics and recent log context to perform a proactive Root Cause Analysis.\n"
            "Generate your analysis in valid JSON format with the following keys:\n"
            "- probable_cause: Short explanation of the primary risk driver.\n"
            "- suggested_remediation: Clear, actionable shell script commands or operational steps to resolve the issue before an outage occurs."
        )

        user_prompt = (
            "Service: {service}\n"
            "Predicted Failure Type: {failure_type}\n"
            "Risk Score: {risk_score}/100 | Confidence: {confidence_score}/100\n"
            "Current Metrics: {metrics}\n\n"
            "Recent Logs:\n{logs_str}\n\n"
            "Deployment Context:\n{dep_str}\n\n"
            "Return the JSON structure explaining the probable cause and suggested remediation."
        )

        prompt_template = ChatPromptTemplate.from_messages([
            ("system", system_prompt),
            ("human", user_prompt)
        ])

        chain = prompt_template | self.chat_model | StrOutputParser()

        try:
            ai_res = chain.invoke({
                "service": service,
                "failure_type": failure_type,
                "risk_score": risk_score,
                "confidence_score": confidence_score,
                "metrics": str(metrics),
                "logs_str": logs_str,
                "dep_str": dep_str
            })
            # Clean JSON if wrapped in markdown or conversational text (especially for Llama models)
            import json
            import re
            
            # Find the outermost curly braces
            json_match = re.search(r'(\{.*\})', ai_res, re.DOTALL)
            if json_match:
                json_str = json_match.group(1)
            else:
                json_str = ai_res

            parsed = json.loads(json_str)
            probable_cause = parsed.get("probable_cause", "Anomaly trend in operational logs.")
            remediation = parsed.get("suggested_remediation", "Scale resources or clean temp space.")
        except Exception as e:
            probable_cause = f"Automatic heuristic alarm for resource trend threshold breach. Ref: {str(e)}"
            remediation = "Please check container cluster CPU/Memory reservations and scale pods."

        return {
            "probable_cause": probable_cause,
            "suggested_remediation": remediation
        }

    # --- Self-Healing: Unrestricted AI Problem-Solving ---

    SELF_HEALING_SYSTEM_PROMPT = (
        "You are an expert DevSecOps SRE with unrestricted problem-solving capabilities.\n"
        "You have deep expertise across ALL domains of systems engineering:\n\n"
        "- Disk, filesystem, inode, and storage issues\n"
        "- Memory management, OOM, swap, cache pressure\n"
        "- CPU saturation, runaway processes, load spikes\n"
        "- Network: DNS, routing, firewall, iptables, MTU, TCP tuning\n"
        "- Containers: Docker, containerd, CRI-O, orchestration issues\n"
        "- Databases: MySQL, PostgreSQL, MongoDB, Redis — locks, replication, corruption\n"
        "- Web servers: Nginx, Apache, HAProxy — config, certs, upstream failures\n"
        "- SSL/TLS: certificate expiry, chain issues, protocol mismatches\n"
        "- Kernel: sysctl tuning, file descriptor limits, inode exhaustion\n"
        "- Systemd: service failures, dependency ordering, resource limits\n"
        "- Cron: stuck jobs, overlapping schedules, permission issues\n"
        "- Security: compromised processes, unauthorized access, firewall lockouts\n"
        "- Application: JVM heap, Python GC, Node.js event loop, Go goroutine leaks\n"
        "- Cloud-native: ECS tasks, EKS pods, Lambda cold starts, SQS backlogs\n"
        "- Package management: apt, yum, pip, npm — broken deps, corrupted state\n"
        "- Log management: rotation, saturation, syslog, journald\n\n"
        "When analyzing an issue, you MUST:\n"
        "1. First propose DIAGNOSTIC commands to understand the current state\n"
        "2. Then propose REMEDIATION commands based on the likely diagnosis\n"
        "3. Finally propose VERIFICATION commands to confirm the fix worked\n"
        "4. Classify each command's risk level honestly: none, low, medium, high, critical\n"
        "5. Mark whether each action is reversible (true/false)\n"
        "6. If a command could cause downtime, set causes_downtime to true\n"
        "7. If applicable, provide a rollback_command to undo the action\n\n"
        "Generate your response as valid JSON with this exact structure:\n"
        "{\n"
        '    "probable_cause": "Clear explanation of what is wrong and why",\n'
        '    "risk_assessment": "What happens if this is not fixed — timeline and impact",\n'
        '    "diagnostic_phase": [\n'
        "        {\n"
        '            "step": 1,\n'
        '            "command": "the actual shell command",\n'
        '            "description": "what this tells us",\n'
        '            "risk_level": "none",\n'
        '            "action_type": "diagnostic"\n'
        "        }\n"
        "    ],\n"
        '    "remediation_phase": [\n'
        "        {\n"
        '            "step": N,\n'
        '            "command": "the actual shell command",\n'
        '            "description": "what this fixes and how",\n'
        '            "risk_level": "low|medium|high|critical",\n'
        '            "reversible": true or false,\n'
        '            "causes_downtime": true or false,\n'
        '            "rollback_command": "command to undo this if needed or null",\n'
        '            "action_type": "remediation"\n'
        "        }\n"
        "    ],\n"
        '    "verification_phase": [\n'
        "        {\n"
        '            "step": M,\n'
        '            "command": "the actual shell command",\n'
        '            "description": "what this confirms",\n'
        '            "risk_level": "none",\n'
        '            "action_type": "verification"\n'
        "        }\n"
        "    ]\n"
        "}\n\n"
        "You are NOT restricted to any predefined list of commands.\n"
        "Use whatever tools, utilities, and approaches are appropriate for the specific problem.\n"
        "If you need to install a diagnostic tool (e.g., htop, iotop, strace), include that step.\n"
        "Be specific. Use real commands with real flags. No placeholders.\n"
        "Ensure step numbers are sequential across all phases."
    )

    def generate_self_healing_rca(
        self,
        prediction_details: Dict,
        instance_info: Optional[Dict] = None,
        deployment_context: Optional[Dict] = None
    ) -> Dict:
        """
        Generates an unrestricted AI-powered self-healing RCA with executable commands.
        
        The AI analyzes the issue and produces structured, phased remediation commands
        (diagnostic → remediation → verification) that can be presented to the user
        for approval before execution.
        
        Returns:
            {
                "probable_cause": "...",
                "risk_assessment": "...",
                "suggested_remediation": "...",
                "executable_actions": [
                    {
                        "step": 1,
                        "command": "...",
                        "description": "...",
                        "risk_level": "...",
                        "action_type": "diagnostic|remediation|verification",
                        "reversible": True/False,
                        "causes_downtime": True/False,
                        "rollback_command": "..." or None
                    }
                ]
            }
        """
        service = prediction_details.get("service", "unknown")
        failure_type = prediction_details.get("failure_type", "Unknown failure")
        risk_score = prediction_details.get("risk_score", 0)
        confidence_score = prediction_details.get("confidence_score", 0)
        metrics = prediction_details.get("metrics", {})

        logs_str = "\n".join([
            f"- [{l.get('timestamp')}] {l.get('level')}: {l.get('message')}"
            for l in prediction_details.get("recent_logs", [])
        ])

        dep_str = "No recent deployments or changes correlated."
        if deployment_context:
            dep_str = (
                f"Deployment detected on {deployment_context.get('timestamp')}.\n"
                f"Commit: {deployment_context.get('commit_sha')} ({deployment_context.get('commit_msg')})\n"
                f"PR: {deployment_context.get('pr_url')}"
            )

        instance_str = "No instance context available."
        if instance_info:
            instance_str = (
                f"Instance ID: {instance_info.get('instance_id', 'N/A')}\n"
                f"OS: {instance_info.get('detected_os', 'unknown')}\n"
                f"SSH User: {instance_info.get('ssh_user', 'ec2-user')}\n"
                f"Instance Type: {instance_info.get('instance_type', 'N/A')}\n"
                f"Region: {instance_info.get('region', 'N/A')}"
            )

        user_prompt = (
            "Service: {service}\n"
            "Predicted Failure Type: {failure_type}\n"
            "Risk Score: {risk_score}/100 | Confidence: {confidence_score}/100\n"
            "Current Metrics: {metrics}\n\n"
            "Instance Context:\n{instance_str}\n\n"
            "Recent Logs:\n{logs_str}\n\n"
            "Deployment Context:\n{dep_str}\n\n"
            "Analyze this issue and return the JSON structure with diagnostic, "
            "remediation, and verification phases. Be thorough and use real commands."
        )

        prompt_template = ChatPromptTemplate.from_messages([
            ("system", self.SELF_HEALING_SYSTEM_PROMPT),
            ("human", user_prompt)
        ])

        chain = prompt_template | self.chat_model | StrOutputParser()

        try:
            ai_res = chain.invoke({
                "service": service,
                "failure_type": failure_type,
                "risk_score": risk_score,
                "confidence_score": confidence_score,
                "metrics": str(metrics),
                "instance_str": instance_str,
                "logs_str": logs_str,
                "dep_str": dep_str
            })

            import json

            # Extract JSON from possible markdown wrapping
            json_match = re.search(r'(\{.*\})', ai_res, re.DOTALL)
            json_str = json_match.group(1) if json_match else ai_res

            parsed = json.loads(json_str)

            probable_cause = parsed.get("probable_cause", "Anomaly detected in operational metrics.")
            risk_assessment = parsed.get("risk_assessment", "Immediate attention recommended.")
            suggested_remediation = parsed.get("suggested_remediation", probable_cause)

            # Combine all phases into a single executable_actions list
            executable_actions = []
            for phase_key in ["diagnostic_phase", "remediation_phase", "verification_phase"]:
                phase_actions = parsed.get(phase_key, [])
                for action in phase_actions:
                    executable_actions.append({
                        "step": action.get("step", len(executable_actions) + 1),
                        "command": action.get("command", ""),
                        "description": action.get("description", ""),
                        "risk_level": action.get("risk_level", "none"),
                        "action_type": action.get("action_type", phase_key.replace("_phase", "")),
                        "reversible": action.get("reversible", True),
                        "causes_downtime": action.get("causes_downtime", False),
                        "rollback_command": action.get("rollback_command")
                    })

        except Exception as e:
            logger.error(f"Self-healing RCA generation failed: {e}")
            probable_cause = f"Automatic heuristic alarm for {failure_type}. AI analysis error: {str(e)}"
            risk_assessment = "Manual investigation recommended."
            suggested_remediation = "Check system metrics and logs manually."
            executable_actions = [
                {
                    "step": 1,
                    "command": "df -h && free -m && uptime && top -bn1 | head -20",
                    "description": "Gather basic system diagnostics",
                    "risk_level": "none",
                    "action_type": "diagnostic",
                    "reversible": True,
                    "causes_downtime": False,
                    "rollback_command": None
                }
            ]

        return {
            "probable_cause": probable_cause,
            "risk_assessment": risk_assessment,
            "suggested_remediation": suggested_remediation,
            "executable_actions": executable_actions
        }
