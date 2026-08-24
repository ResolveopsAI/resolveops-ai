from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import os
import re
import json
from typing import Any, List, Dict, Optional
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



# ── Multilingual, context-aware SRE system prompt ───────────────────────────
_CHAT_SYSTEM_PROMPT = """You are the ResolveOps AI Copilot — an intelligent, conversational Site Reliability
and DevSecOps assistant embedded inside the ResolveOps platform.

═══════════════════════════════════════════════════════════════
🌍 MULTILINGUAL RULE — THIS IS MANDATORY:
Detect the language of the user's message and ALWAYS reply in that exact same language.
- If the user writes in Hindi → reply in Hindi
- If the user writes in Tamil → reply in Tamil  
- If the user writes in Spanish → reply in Spanish
- If the user writes in Arabic → reply in Arabic
- If the user writes in French → reply in French
- If the user writes in English → reply in English
NEVER switch languages mid-conversation unless the user does first.
Technical terms (AWS, EC2, Docker, Kubernetes, etc.) can remain in English even in non-English responses.
═══════════════════════════════════════════════════════════════

You are connected to live AWS, Azure, GitHub, Docker, and Kubernetes infrastructure.
Your role is to help engineers understand, diagnose, and resolve operational issues.

DOMAINS YOU COVER:
- Cloud Infrastructure: AWS EC2, VPCs, RDS, S3, EKS, CloudWatch, Azure VMs, Resource Groups, Monitor
- Container orchestration: Docker Compose services, Kubernetes pods, nodes, namespaces, deployments
- CI/CD pipelines: GitHub Actions workflows, deployment failures, pipeline analysis
- Incident investigation: Root cause analysis from logs, metrics, and traces
- Cost optimization: AWS Cost Explorer, Azure billing, resource spending analysis
- Security: IAM policies, security groups, network policies, audit logs, compliance
- Architecture: Best practices for SRE, reliability engineering, scaling, observability
- DevOps tooling: Terraform, Helm, Prometheus, Grafana, ELK stack, Datadog

═══════════════════════════════════════════════════════════════
📏 RESPONSE LENGTH INTELLIGENCE — CRITICAL:
Match your response length EXACTLY to the nature of the question:

• Greeting ("Hi", "Hello", "Namaste", "Hola") → 2-3 sentences MAX. Introduce yourself, ask what they need.
• Simple yes/no question → Answer directly in 1-2 sentences.
• Short factual question → Short factual answer, 2-4 sentences.
• Specific error/log → Focused diagnosis: cause + fix. No padding.
• "How does X work?" → Moderate explanation with structure, not an essay.
• "Explain X in detail" or complex RCA → Thorough structured response with headers/bullets.

NEVER pad responses with unnecessary filler, disclaimers, or generic advice not asked for.
NEVER repeat the user's question back to them.
NEVER start with "Great question!" or similar filler phrases.
═══════════════════════════════════════════════════════════════

BEHAVIORAL RULES:
1. Respond in the user's language (see MULTILINGUAL RULE above).
2. Match response length to question complexity (see RESPONSE LENGTH INTELLIGENCE above).
3. Be direct and precise — give the answer, not a description of what you'll do.
4. For greetings: 1-2 sentence warm intro + ask what they're working on. That's it.
5. For follow-up questions: stay in context of the conversation, don't re-introduce yourself.
6. For log/error dumps: identify the specific error, root cause, and concrete fix steps.
7. For "what can you do?" questions: give a brief bullet list of capabilities.
8. If live data isn't available (specific CPU %, real metrics): say so in one sentence, explain how to get it.
9. REFUSE only genuinely off-topic requests (cooking, politics, sports, entertainment, gossip).
   When refusing, do so briefly and in the user's language. Don't lecture.
10. For DevSecOps questions in ANY language — always help.

Use markdown (code blocks, bullet points, headers) only when it genuinely improves clarity.
Short conversational replies should be plain text, not forced into bullet lists.
"""


def _call_llm(messages: list, request_id: str) -> str:
    """
    Call the configured LLM (OpenAI, Groq, or Bedrock) with a list of messages.
    Returns the assistant's reply as a string.
    Supports OpenAI, Groq, and Amazon Bedrock providers.
    All providers support multilingual responses natively.
    """
    ai_provider = os.getenv("AI_PROVIDER", "openai").lower()

    if ai_provider in ("openai", "openai_compatible"):
        api_key = os.getenv("OPENAI_API_KEY")
        base_url = os.getenv("OPENAI_BASE_URL")
        model = os.getenv("OPENAI_MODEL") or os.getenv("OPENAI_MODEL_NAME")
        if not api_key or not model:
            raise ValueError("OpenAI credentials not configured (OPENAI_API_KEY / OPENAI_MODEL missing)")
        from langchain_openai import ChatOpenAI
        from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
        chat = ChatOpenAI(api_key=api_key, base_url=base_url, model=model, temperature=0.5)
        lc_messages = []
        for m in messages:
            if m["role"] == "system":
                lc_messages.append(SystemMessage(content=m["content"]))
            elif m["role"] == "user":
                lc_messages.append(HumanMessage(content=m["content"]))
            elif m["role"] == "assistant":
                lc_messages.append(AIMessage(content=m["content"]))
        res = chat.invoke(lc_messages)
        return getattr(res, "content", str(res))

    elif ai_provider == "groq":
        api_key = os.getenv("GROQ_API_KEY")
        model = os.getenv("GROQ_MODEL_NAME", "llama-3.1-70b-versatile")
        if not api_key:
            raise ValueError("GROQ_API_KEY not configured")
        from langchain_groq import ChatGroq
        from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
        chat = ChatGroq(api_key=api_key, model=model, temperature=0.5)
        lc_messages = []
        for m in messages:
            if m["role"] == "system":
                lc_messages.append(SystemMessage(content=m["content"]))
            elif m["role"] == "user":
                lc_messages.append(HumanMessage(content=m["content"]))
            elif m["role"] == "assistant":
                lc_messages.append(AIMessage(content=m["content"]))
        res = chat.invoke(lc_messages)
        return getattr(res, "content", str(res))

    elif ai_provider == "bedrock":
        try:
            import boto3
            from langchain_aws import ChatBedrock
            from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
            region = os.getenv("AWS_REGION", os.getenv("AWS_DEFAULT_REGION", "us-east-1"))
            model_id = os.getenv("BEDROCK_MODEL_ID", "anthropic.claude-3-haiku-20240307-v1:0")
            client = boto3.client("bedrock-runtime", region_name=region)
            chat = ChatBedrock(client=client, model_id=model_id, model_kwargs={"temperature": 0.5})
            lc_messages = []
            for m in messages:
                if m["role"] == "system":
                    lc_messages.append(SystemMessage(content=m["content"]))
                elif m["role"] == "user":
                    lc_messages.append(HumanMessage(content=m["content"]))
                elif m["role"] == "assistant":
                    lc_messages.append(AIMessage(content=m["content"]))
            res = chat.invoke(lc_messages)
            return getattr(res, "content", str(res))
        except Exception as e:
            raise ValueError(f"Bedrock invocation failed: {e}")

    raise ValueError(f"No valid AI provider configured (AI_PROVIDER={ai_provider})")


@app.post("/api/v1/rca/chat")
def chat_rca(req: ChatRequest):
    """
    Dynamic AI chat endpoint — multilingual, context-aware, length-intelligent.

    - Every message goes to the real LLM (no hardcoded responses)
    - Detects user's language and responds in the same language
    - Response length matches question complexity
    - Conversation history is included for multi-turn context
    """
    import re as _re
    from uuid import uuid4 as _uuid4

    msg = (req.message or "").strip()
    request_id = str(_uuid4())

    if not msg:
        return {
            "status": "success",
            "answer": "It looks like you sent an empty message. What can I help you with?",
            "execution": {"requestId": request_id},
            "execution_path": "empty_input",
            "provider": "assistant",
            "model": "local",
        }

    # ── Lightweight guardrail: only block obvious non-ops English patterns ────
    # Non-English messages bypass this entirely — the LLM handles scope itself.
    # This prevents false positives on legitimate DevOps questions in other languages.
    ops_keywords = [
        "cluster", "pod", "container", "docker", "kubernetes", "k8s", "aws", "azure", "gcp",
        "ec2", "s3", "deployment", "service", "logs", "metric", "cpu", "memory", "disk",
        "network", "ingress", "vpc", "vnet", "subnet", "rca", "incident", "alert", "error",
        "exception", "pipeline", "github", "workflow", "ci/cd", "mcp", "telemetry", "cost",
        "billing", "cloudwatch", "devops", "sre", "build", "api", "database", "postgres",
        "redis", "terraform", "helm", "grafana", "prometheus", "nginx", "load balancer",
        "autoscaling", "lambda", "serverless", "microservice", "kubectl", "namespace"
    ]
    # Only apply English-language guardrail patterns when the message appears to be English
    # (contains mostly ASCII chars — non-English scripts bypass to LLM automatically)
    msg_lower = msg.lower()
    is_mostly_ascii = sum(1 for c in msg if ord(c) < 128) / max(len(msg), 1) > 0.85
    is_ops = any(kw in msg_lower for kw in ops_keywords)

    if is_mostly_ascii and not is_ops:
        # Only block clearly off-topic English queries
        strict_off_topic = [
            r"\brecipe for\b",
            r"\bhow to cook\b",
            r"\btell me a (joke|riddle|story)\b",
            r"\bwrite a (poem|essay|fiction|song)\b",
            r"\bwho won the (world cup|ipl|super bowl|match)\b",
            r"\bwhat is the capital of\b",
        ]
        for pattern in strict_off_topic:
            if _re.search(pattern, msg_lower):
                # Let the LLM give the refusal in a natural way
                # (it will be brief and in the user's language per the system prompt)
                break
        # Note: we don't hard-block here — the LLM's system prompt handles the refusal
        # gracefully. Hard-blocking causes worse UX than a polite LLM refusal.



    # Build the message list for the LLM
    messages = [{"role": "system", "content": _CHAT_SYSTEM_PROMPT}]

    # Include previous messages from history if provided
    if hasattr(req, "history") and req.history:
        for h in req.history[-10:]:  # cap at last 10 turns for context
            if isinstance(h, dict) and h.get("role") and h.get("content"):
                messages.append({"role": h["role"], "content": h["content"]})

    messages.append({"role": "user", "content": msg})

    # Call the real LLM
    try:
        ai_provider = os.getenv("AI_PROVIDER", "openai").lower()
        model = (
            os.getenv("OPENAI_MODEL") or os.getenv("OPENAI_MODEL_NAME") or
            os.getenv("GROQ_MODEL_NAME") or
            os.getenv("BEDROCK_MODEL_ID") or "unknown"
        )
        answer = _call_llm(messages, request_id)
        return {
            "status": "success",
            "answer": answer,
            "execution": {"requestId": request_id},
            "execution_path": "ai_chat_dynamic",
            "provider": ai_provider,
            "model": model,
        }
    except Exception as e:
        # LLM failed — give a helpful error rather than a canned response
        err_msg = str(e)
        # Don't expose raw API keys or internal details
        if "api_key" in err_msg.lower() or "apikey" in err_msg.lower():
            err_msg = "AI provider credentials are not configured. Please contact the administrator."
        elif "connection" in err_msg.lower() or "timeout" in err_msg.lower():
            err_msg = "The AI service is temporarily unreachable. Please try again in a moment."
        
        return {
            "status": "error",
            "answer": f"I'm having trouble connecting to the AI provider right now. {err_msg}",
            "execution": {"requestId": request_id},
            "execution_path": "ai_chat_error",
            "provider": os.getenv("AI_PROVIDER", "openai"),
            "model": "error",
        }

