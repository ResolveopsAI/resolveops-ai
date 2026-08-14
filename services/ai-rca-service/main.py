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
    """Chat adapter with intent classification and routing.

    Intents supported:
      - greeting: short salutations -> canned reply
      - code_gen: Terraform/code generation -> code-generation flow
      - rca: root-cause analysis -> if message contains log-like content invoke analyze_rca,
             otherwise ask a clarifying question requesting logs/time-window/service
    """

    msg = (req.message or "").strip()

    def classify_intent(text: str) -> str:
        t = text.strip().lower()
        if not t:
            return "greeting"
        # greetings or very short
        if re.fullmatch(r"^(hi|hello|hey|yo|h[ie]llo)([!.]?|\s*)$", t) or len(t) < 4:
            return "greeting"
        # code generation / terraform keywords
        code_kw = ["terraform", "tf", "vm", "virtual machine", "azure", "create a vm", "generate a terraform", "terraform script", "create a virtual machine"]
        for kw in code_kw:
            if kw in t:
                return "code_gen"
        # default to rca
        return "rca"

    def looks_like_logs(text: str) -> bool:
        # Heuristics: timestamps, ERROR/WARN, stack traces, multiple lines
        if "error" in text.lower() or "exception" in text.lower() or "traceback" in text.lower():
            return True
        if re.search(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}", text):
            return True
        if "WARN" in text or "ERROR" in text:
            return True
        if "\n" in text and len(text.splitlines()) > 1:
            return True
        return False

    intent = classify_intent(msg)

    # Greeting -> canned reply
    if intent == "greeting":
        return {
            "status": "success",
            "answer": "Hi — I can help with Root Cause Analysis, Terraform code generation, or operational guidance. What would you like me to do? (e.g., 'Analyze logs for service X' or 'Generate Terraform to create an Azure VM')",
            "execution": {"requestId": str(uuid4())},
            "execution_path": "greeting",
            "provider": "assistant",
            "model": "local",
        }

    # Code generation -> return sample Terraform or call code-generation flow
    if intent == "code_gen":
        # If OpenAI-compatible configured, attempt generative response; otherwise return simple template
        try:
            openai_api_key = os.getenv("OPENAI_API_KEY")
            openai_base = os.getenv("OPENAI_BASE_URL")
            openai_model = os.getenv("OPENAI_MODEL") or os.getenv("OPENAI_MODEL_NAME")
            if openai_api_key and openai_model:
                from langchain_openai import ChatOpenAI
                from langchain_core.messages import SystemMessage, HumanMessage

                chat = ChatOpenAI(api_key=openai_api_key, base_url=openai_base, model=openai_model, temperature=0.1)
                prompt = (
                    "You are a helpful assistant that generates Terraform HCL. "
                    "Produce a minimal, runnable Terraform configuration to create an Azure virtual machine using the AzureRM provider. "
                    "Return only the HCL code without commentary."
                )
                res = chat.invoke([SystemMessage(content=prompt), HumanMessage(content=msg)])
                code = getattr(res, "content", str(res))
                return {
                    "status": "success",
                    "answer": code,
                    "execution": {"requestId": str(uuid4())},
                    "execution_path": "code_gen",
                    "provider": "openai",
                    "model": openai_model,
                }
        except Exception:
            # Fall back to a minimal Terraform template
            template = (
                'provider "azurerm" {\n  features {}\n}\n\nresource "azurerm_resource_group" "rg" {\n  name     = "example-rg"\n  location = "East US"\n}\n\nresource "azurerm_virtual_machine" "vm" {\n  name                  = "example-vm"\n  location              = azurerm_resource_group.rg.location\n  resource_group_name   = azurerm_resource_group.rg.name\n  network_interface_ids = []\n  vm_size               = "Standard_DS1_v2"\n\n  storage_os_disk {\n    name              = "osdisk"\n    caching           = "ReadWrite"\n    create_option     = "FromImage"\n    managed_disk_type = "Standard_LRS"\n  }\n\n  os_profile {\n    computer_name  = "hostname"\n    admin_username = "azureuser"\n    admin_password = "P@ssw0rd1234!"\n  }\n}\n'
            )
            return {"status": "success", "answer": template, "execution": {"requestId": str(uuid4())}, "execution_path": "code_gen", "provider": "local", "model": "template"}

    # RCA intent
    if intent == "rca":
        # If input looks like logs, pass to analyze flow
        if looks_like_logs(msg) and len(msg) > 30:
            try:
                analyze_req = AnalyzeRequest(source="chat", context=req.message, logs=req.message)
                result = analyze_rca(analyze_req)
                if isinstance(result, dict) and result.get("status") == "success":
                    analysis = result.get("analysis", {})
                    summary = analysis.get("summary") or ""
                    probable = analysis.get("probable_root_cause") or ""
                    fixes = analysis.get("recommended_fix") or []
                    parts = []
                    if summary:
                        parts.append(f"Summary: {summary}")
                    if probable:
                        parts.append(f"Probable root cause: {probable}")
                    if fixes:
                        parts.append("Recommended fixes:\n" + "\n".join([f"- {f}" for f in fixes]))
                    answer_text = "\n\n".join(parts) if parts else analysis.get("answer") or "No analysis available."
                    return {"status": "success", "answer": answer_text, "execution": {"requestId": str(uuid4())}, "execution_path": "ai_rca_chat", "provider": os.getenv("AI_PROVIDER", "openai"), "model": os.getenv("OPENAI_MODEL", "unknown")}
                return {"status": "error", "error": {"message": "AI analysis temporarily unavailable"}}
            except HTTPException as he:
                return {"status": "error", "error": {"message": str(he.detail)}}
            except Exception:
                return {"status": "error", "error": {"message": "Internal AI error"}}

        # Ask clarifying question when logs are missing
        return {
            "status": "success",
            "answer": "I can run root-cause analysis, but I need logs or more context. Please provide relevant log lines, the affected service name, and the approximate time window (e.g., last 30 minutes). Would you like to paste logs now?",
            "execution": {"requestId": str(uuid4())},
            "execution_path": "clarifying_question",
            "provider": "assistant",
            "model": "local",
        }
