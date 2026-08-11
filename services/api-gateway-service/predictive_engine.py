import os
import re
import time
import boto3
import logging
from typing import List, Dict, Tuple, Optional
from langchain_aws import ChatBedrock
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

logger = logging.getLogger(__name__)

class PredictiveEngine:
    def __init__(self):
        ai_provider = os.getenv("AI_PROVIDER", "bedrock").lower()
        if ai_provider == "openai":
            from langchain_openai import ChatOpenAI
            import httpx
            self.chat_model = ChatOpenAI(
                api_key=os.getenv("OPENAI_API_KEY"),
                model=os.getenv("OPENAI_MODEL_NAME", "gpt-4o-mini"),
                base_url=os.getenv("OPENAI_BASE_URL"),
                temperature=0.1,
                http_client=httpx.Client(proxies=None)
            )
        else:
            aws_region = os.getenv("AWS_REGION", "us-east-1")
            bedrock_client = boto3.client("bedrock-runtime", region_name=aws_region)
            self.chat_model = ChatBedrock(
                client=bedrock_client,
                model_id=os.getenv("BEDROCK_MODEL_ID", "anthropic.claude-3-haiku-20240307-v1:0"),
                model_kwargs={"temperature": 0.1}
            )

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
