from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import os
import re
import json
from typing import List, Dict, Optional
from uuid import uuid4
from app.schemas.investigation import ChatRequest
from ai_rca_service import PredictiveEngine

app = FastAPI(title="ai-rca-service")

# Initialize PredictiveEngine for generating self-healing steps
engine = PredictiveEngine()

@app.get("/health")
def health_check():
    return {"status": "healthy", "service": "ai-rca-service"}


@app.get("/api/v1/ai/provider-status")
def provider_status():
    """Return a lightweight provider availability summary for the gateway."""
    provider = os.getenv("AI_PROVIDER", "openai").lower()
    status = "misconfigured"
    details = {}
    if provider == "groq":
        if os.getenv("GROQ_API_KEY"):
            status = "available"
        else:
            status = "misconfigured"
    elif provider == "openai":
        if os.getenv("OPENAI_API_KEY") and os.getenv("OPENAI_MODEL"):
            status = "available"
        else:
            status = "misconfigured"
    elif provider == "bedrock":
        # bedrock requires BEDROCK_MODEL_ID and AWS credentials available in environment/instance role
        if os.getenv("BEDROCK_MODEL_ID"):
            status = "available"
        else:
            status = "misconfigured"
    else:
        status = "unknown"

    return {"status": status, "provider": provider, "details": details}

class SelfHealingRCARequest(BaseModel):
    service: str
    failure_type: str
    risk_score: int = 80
    confidence_score: int = 85
    recent_logs: List[dict] = []
    instance_info: Optional[dict] = None

@app.post("/api/v1/rca/self-healing")
def self_healing_rca(req: SelfHealingRCARequest):
    try:
        prediction_details = {
            "service": req.service,
            "failure_type": req.failure_type,
            "risk_score": req.risk_score,
            "confidence_score": req.confidence_score,
            "recent_logs": req.recent_logs,
            "metrics": {}
        }
        res = engine.generate_self_healing_rca(
            prediction_details=prediction_details,
            instance_info=req.instance_info
        )
        return res
    except Exception as e:
        # Return fallback commands if Bedrock invocation fails
        fallback_actions = [
            {
                "step": 1,
                "command": "df -h && free -m && uptime",
                "description": "Gather basic system diagnostics",
                "risk_level": "none",
                "action_type": "diagnostic",
                "reversible": True,
                "causes_downtime": False,
                "rollback_command": None
            }
        ]
        return {
            "probable_cause": f"Heuristic match for {req.failure_type} (LLM Error: {str(e)})",
            "risk_assessment": "Manual checks required.",
            "suggested_remediation": "Check logs and run diagnostics.",
            "executable_actions": fallback_actions
        }


class AnalyzeRequest(BaseModel):
    source: str
    context: str
    logs: str

@app.post("/api/v1/rca/analyze")
def analyze_rca(req: AnalyzeRequest):
    ai_provider = os.getenv("AI_PROVIDER", "openai")
    
    prompt = f"""
You are an expert DevSecOps SRE Assistant.
Analyze the following logs for root cause analysis.
Context: {req.context}
Logs:
{req.logs}

Generate your analysis in valid JSON format with the following keys:
- summary: Short title of the issue
- probable_root_cause: Detailed explanation
- recommended_fix: Array of string steps to fix
- evidence: Array of log lines proving the root cause
"""

    if ai_provider == "groq":
        groq_api_key = os.getenv("GROQ_API_KEY")
        if not groq_api_key:
            raise HTTPException(status_code=500, detail="GROQ_API_KEY environment variable not set")

        try:
            from langchain_groq import ChatGroq
            from langchain_core.messages import HumanMessage, SystemMessage

            chat = ChatGroq(
                api_key=groq_api_key,
                model=os.getenv("GROQ_MODEL_NAME", "llama-3.1-8b-instant"),
                temperature=0.1,
            )

            res = chat.invoke([
                SystemMessage(content="You are a helpful AI that returns strictly valid JSON."),
                HumanMessage(content=prompt)
            ])

            content = res.content
            json_match = re.search(r'(\{.*\})', content, re.DOTALL)
            if json_match:
                content = json_match.group(1)
            parsed = json.loads(content)

            return {
                "status": "success",
                "analysis": {
                    "status": "ai_generated",
                    "provider": "groq",
                    "model": os.getenv("GROQ_MODEL_NAME", "llama-3.1-8b-instant"),
                    "summary": parsed.get("summary", "Analysis"),
                    "probable_root_cause": parsed.get("probable_root_cause", ""),
                    "recommended_fix": parsed.get("recommended_fix", []),
                    "evidence": parsed.get("evidence", []),
                    "ai_provider_status": "available"
                }
            }
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Groq error: {str(e)}")
    elif ai_provider == "openai":
        # OpenAI-compatible endpoint (e.g., Groq via OpenAI API compatibility)
        openai_api_key = os.getenv("OPENAI_API_KEY")
        openai_base = os.getenv("OPENAI_BASE_URL")
        openai_model = os.getenv("OPENAI_MODEL") or os.getenv("OPENAI_MODEL_NAME")

        if not openai_api_key or not openai_model:
            raise HTTPException(status_code=500, detail="OpenAI-compatible credentials not configured")

        try:
            from langchain_openai import ChatOpenAI
            from langchain_core.messages import HumanMessage, SystemMessage

            chat = ChatOpenAI(
                api_key=openai_api_key,
                base_url=openai_base,
                model=openai_model,
                temperature=0.1,
            )

            res = chat.invoke([
                SystemMessage(content="You are a helpful AI that returns strictly valid JSON."),
                HumanMessage(content=prompt)
            ])

            content = res.content
            json_match = re.search(r'(\{.*\})', content, re.DOTALL)
            if json_match:
                content = json_match.group(1)
            parsed = json.loads(content)

            return {
                "status": "success",
                "analysis": {
                    "status": "ai_generated",
                    "provider": "openai",
                    "model": openai_model,
                    "summary": parsed.get("summary", "Analysis"),
                    "probable_root_cause": parsed.get("probable_root_cause", ""),
                    "recommended_fix": parsed.get("recommended_fix", []),
                    "evidence": parsed.get("evidence", []),
                    "ai_provider_status": "available"
                }
            }

        except Exception as e:
            raise HTTPException(status_code=500, detail=f"OpenAI error: {str(e)}")

    elif ai_provider == "azure_foundry":
        # Use Azure AI Foundry
        azure_endpoint = os.getenv("AZURE_AI_FOUNDRY_ENDPOINT") or os.getenv("AZURE_OPENAI_ENDPOINT")
        azure_api_key = os.getenv("AZURE_AI_FOUNDRY_API_KEY") or os.getenv("AZURE_OPENAI_API_KEY")
        azure_deployment = os.getenv("AZURE_AI_FOUNDRY_DEPLOYMENT_NAME") or os.getenv("AZURE_OPENAI_DEPLOYMENT")
        
        if not azure_endpoint or not azure_api_key:
            raise HTTPException(status_code=500, detail="Azure AI Foundry credentials not configured")
            
        try:
            from langchain_openai import AzureChatOpenAI
            from langchain_core.messages import HumanMessage, SystemMessage
            
            chat = AzureChatOpenAI(
                azure_endpoint=azure_endpoint,
                api_key=azure_api_key,
                azure_deployment=azure_deployment,
                api_version=os.getenv("AZURE_OPENAI_API_VERSION", "2023-05-15"),
                temperature=0.1,
            )
            
            res = chat.invoke([
                SystemMessage(content="You are a helpful AI that returns strictly valid JSON."),
                HumanMessage(content=prompt)
            ])
            
            content = res.content
            json_match = re.search(r'(\{.*\})', content, re.DOTALL)
            if json_match:
                content = json_match.group(1)
            parsed = json.loads(content)
            
            return {
                "status": "success",
                "analysis": {
                    "status": "ai_generated",
                    "provider": "azure_foundry",
                    "summary": parsed.get("summary", "Analysis"),
                    "probable_root_cause": parsed.get("probable_root_cause", ""),
                    "recommended_fix": parsed.get("recommended_fix", []),
                    "evidence": parsed.get("evidence", []),
                    "ai_provider_status": "available"
                }
            }
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Azure AI Foundry error: {str(e)}")

    elif ai_provider == "bedrock":
        try:
            import boto3
            from langchain_aws import ChatBedrock
            from langchain_core.messages import HumanMessage, SystemMessage
            
            aws_region = os.getenv("AWS_REGION", "us-east-1")
            bedrock_client = boto3.client("bedrock-runtime", region_name=aws_region)
            chat = ChatBedrock(
                client=bedrock_client,
                model_id=os.getenv("BEDROCK_MODEL_ID", "anthropic.claude-3-haiku-20240307-v1:0"),
                model_kwargs={"temperature": 0.1}
            )
            
            res = chat.invoke([
                SystemMessage(content="You are a helpful AI that returns strictly valid JSON."),
                HumanMessage(content=prompt)
            ])
            
            content = res.content
            json_match = re.search(r'(\{.*\})', content, re.DOTALL)
            if json_match:
                content = json_match.group(1)
            parsed = json.loads(content)
            
            return {
                "status": "success",
                "analysis": {
                    "status": "ai_generated",
                    "provider": "bedrock",
                    "summary": parsed.get("summary", "Analysis"),
                    "probable_root_cause": parsed.get("probable_root_cause", ""),
                    "recommended_fix": parsed.get("recommended_fix", []),
                    "evidence": parsed.get("evidence", []),
                    "ai_provider_status": "available"
                }
            }
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Amazon Bedrock error: {str(e)}")
            
    raise HTTPException(status_code=500, detail="No valid AI provider configured")


@app.post("/api/v1/rca/chat")
def chat_rca(req: ChatRequest):
    """Simple chat adapter that forwards free-text chat to the existing analyze flow.

    Returns a JSON structure the API gateway expects: `status`, `answer`, `execution`,
    and `execution_path` so gateway forwarding succeeds.
    """
    try:
        # Reuse analyze logic by creating a minimal AnalyzeRequest with the message as logs
        analyze_req = AnalyzeRequest(source="chat", context=req.message, logs=req.message)
        result = analyze_rca(analyze_req)

        # If analyze_rca raised an HTTPException it will propagate; otherwise map response
        if isinstance(result, dict) and result.get("status") == "success":
            analysis = result.get("analysis", {})
            answer = analysis.get("summary") or analysis.get("probable_root_cause") or ""
            return {
                "status": "success",
                "answer": answer,
                "execution": {"requestId": str(uuid4())},
                "execution_path": "ai_rca_chat",
                "provider": os.getenv("AI_PROVIDER", "openai"),
                "model": os.getenv("OPENAI_MODEL_NAME", os.getenv("GROQ_MODEL_NAME", "unknown")),
            }

        # Fallback: return a friendly error structure
        return {"status": "error", "error": {"message": "AI analysis temporarily unavailable"}}

    except HTTPException as he:
        return {"status": "error", "error": {"message": str(he.detail)}}
    except Exception as e:
        return {"status": "error", "error": {"message": "Internal AI error"}}
