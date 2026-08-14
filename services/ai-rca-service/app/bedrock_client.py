'''
Original Bedrock client implementation (commented out).

If you need to re-enable Bedrock later, uncomment this block and
comment out the lightweight stub below.

---- START ORIGINAL IMPLEMENTATION ----

"""
AI-RCA Service — Amazon Bedrock client.

Provides a controlled interface for Bedrock invocations:
  - Uses the AWS SDK default credential chain (EC2 instance role preferred)
  - Enforces timeouts
  - Translates ALL exceptions into internal error codes
  - Never logs credentials or raw exception bodies at INFO/DEBUG
  - Optionally falls back to OpenAI only when OPENAI_FALLBACK_ENABLED=true
"""
import json
import logging
import uuid
from typing import Optional, List, Dict, Any

import boto3
from botocore.config import Config
from botocore.exceptions import (
    ClientError,
    EndpointConnectionError,
    NoCredentialsError,
    NoRegionError,
    ReadTimeoutError,
)

from app.settings import settings
from app.errors import ErrorCode, classify_provider_exception, build_error_response

logger = logging.getLogger(__name__)


class BedrockClient:
    """Thin wrapper around bedrock-runtime that enforces project-level policies."""

    def __init__(self) -> None:
        self._client = None
        self._openai_client = None
        self._provider = settings.AI_PROVIDER

    def _get_bedrock_client(self):
        if self._client is None:
            boto_config = Config(
                region_name=settings.AWS_REGION,
                connect_timeout=10,
                read_timeout=settings.BEDROCK_REQUEST_TIMEOUT_SECONDS,
                retries={"max_attempts": settings.BEDROCK_MAX_RETRIES + 1, "mode": "standard"},
            )
            self._client = boto3.client(
                "bedrock-runtime",
                region_name=settings.AWS_REGION,
                config=boto_config,
            )
        return self._client

    def _get_openai_client(self):
        """Only constructed when OPENAI_FALLBACK_ENABLED=true and key is present."""
        if self._openai_client is None:
            from openai import OpenAI  # type: ignore
            import httpx
            self._openai_client = OpenAI(
                api_key=settings.OPENAI_API_KEY,
                base_url=settings.OPENAI_BASE_URL,
                http_client=httpx.Client(proxies=None)
            )
        return self._openai_client

    def invoke(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        max_tokens: int = 4096,
        temperature: float = 0.1,
        request_id: Optional[str] = None,
    ) -> str:
        """
        Invoke the configured AI provider and return the text response.

        Raises a dict (safe error response) on any failure — never a raw exception.
        """
        rid = request_id or str(uuid.uuid4())
        provider = settings.AI_PROVIDER

        logger.info(
            "AI invocation starting",
            extra={
                "request_id": rid,
                "provider": provider,
                "model": (
                    settings.BEDROCK_MODEL_ID if provider == "bedrock"
                    else settings.OPENAI_MODEL
                ),
            },
        )

        try:
            if provider == "bedrock":
                return self._invoke_bedrock(prompt, system_prompt, max_tokens, temperature, rid)
            elif provider == "openai":
                if not settings.OPENAI_API_KEY or not settings.OPENAI_MODEL:
                    raise _SafeError(build_error_response(ErrorCode.AI_PROVIDER_CONFIGURATION_ERROR, rid))
                return self._invoke_openai(prompt, system_prompt, max_tokens, temperature, rid)
            else:
                raise _SafeError(build_error_response(ErrorCode.AI_PROVIDER_CONFIGURATION_ERROR, rid))

        except _SafeError:
            raise
        except Exception as exc:
            code = classify_provider_exception(exc)

            # If Bedrock fails and fallback is explicitly enabled, try OpenAI
            if (
                provider == "bedrock"
                and settings.OPENAI_FALLBACK_ENABLED
                and settings.OPENAI_API_KEY
                and code != ErrorCode.AI_PROVIDER_ACCESS_DENIED
            ):
                logger.warning(
                    "Bedrock failed; attempting OpenAI fallback",
                    extra={"request_id": rid, "bedrock_error_code": code},
                )
                try:
                    result = self._invoke_openai(prompt, system_prompt, max_tokens, temperature, rid)
                    logger.info(
                        "OpenAI fallback succeeded",
                        extra={"request_id": rid},
                    )
                    return result
                except Exception as fallback_exc:
                    fallback_code = classify_provider_exception(fallback_exc)
                    logger.error(
                        "OpenAI fallback also failed",
                        extra={"request_id": rid, "fallback_error_code": fallback_code},
                    )
                    raise _SafeError(build_error_response(fallback_code, rid)) from fallback_exc

            # Log sanitised error — do NOT log raw exception message at INFO
            logger.error(
                "AI provider invocation failed",
                extra={
                    "request_id": rid,
                    "provider": provider,
                    "error_code": code,
                    "exc_type": type(exc).__name__,
                },
            )
            raise _SafeError(build_error_response(code, rid)) from exc

    def _invoke_bedrock(
        self,
        prompt: str,
        system_prompt: Optional[str],
        max_tokens: int,
        temperature: float,
        request_id: str,
    ) -> str:
        client = self._get_bedrock_client()
        model_id = settings.BEDROCK_MODEL_ID

        if "llama" in model_id.lower() or "meta" in model_id.lower():
            sys_part = f"<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\n{system_prompt}<|eot_id|>" if system_prompt else "<|begin_of_text|>"
            prompt_str = f"{sys_part}<|start_header_id|>user<|end_header_id|>\n\n{prompt}<|eot_id|><|start_header_id|>assistant<|end_header_id|>\n\n"
            body = {
                "prompt": prompt_str,
                "max_gen_len": max_tokens,
                "temperature": temperature,
            }
        else:
            messages = [{"role": "user", "content": prompt}]
            body = {
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": max_tokens,
                "temperature": temperature,
                "messages": messages,
            }
            if system_prompt:
                body["system"] = system_prompt

        try:
            response = client.invoke_model(
                modelId=model_id,
                body=json.dumps(body),
                contentType="application/json",
                accept="application/json",
            )
            result = json.loads(response["body"].read())
            if "llama" in model_id.lower() or "meta" in model_id.lower():
                text = result.get("generation", "")
            else:
                text = result["content"][0]["text"]
            logger.info(
                "Bedrock invocation succeeded",
                extra={
                    "request_id": request_id,
                    "model": model_id,
                    "output_tokens": result.get("usage", {}).get("output_tokens", result.get("prompt_token_count", 0)),
                },
            )
            return text
            logger.error(
                "Bedrock connectivity error",
                extra={"request_id": request_id, "exc_type": type(exc).__name__},
            )
            raise

        except ClientError as exc:
            # ClientError carries the HTTP status and error code
            error_code = exc.response.get("Error", {}).get("Code", "")
            logger.error(
                "Bedrock ClientError",
                extra={
                    "request_id": request_id,
                    "aws_error_code": error_code,
                },
            )
            raise

    def _invoke_openai(
        self,
        prompt: str,
        system_prompt: Optional[str],
        max_tokens: int,
        temperature: float,
        request_id: str,
    ) -> str:
        client = self._get_openai_client()
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        response = client.chat.completions.create(
            model=settings.OPENAI_MODEL,
            messages=messages,
            max_tokens=max_tokens,
            temperature=temperature,
        )
        # Extract content from OpenAI response object (safe paths)
        try:
            choice_msg = response.choices[0].message
            return choice_msg.content or ""
        except Exception:
            # Fallbacks for alternative response shapes
            try:
                return response.choices[0].text or ""
            except Exception:
                return str(response)

    def converse_with_tools(
        self,
        messages: List[Dict[str, Any]],
        system_prompt: Optional[str] = None,
        tools: List[Dict[str, Any]] = None,
        max_tokens: int = 4096,
        temperature: float = 0.1,
        request_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Converse with the configured AI provider, passing tools dynamically.
        Returns a standardized dict containing role, content (text), and tool_calls.
        """
        rid = request_id or str(uuid.uuid4())
        provider = settings.AI_PROVIDER
        
        logger.info(
            "Converse with tools starting",
            extra={
                "request_id": rid,
                "provider": provider,
                "tool_count": len(tools) if tools else 0,
            },
        )
        
        try:
            openai_tools = []
            if tools:
                for tool in tools:
                    input_schema = tool.get("inputSchema", {})
                    if not input_schema:
                        input_schema = {"type": "object", "properties": {}}
                    openai_tools.append({
                        "type": "function",
                        "function": {
                            "name": tool["name"],
                            "description": tool.get("description", "")[:200],
                            "parameters": input_schema
                        }
                    })
                
        openai_messages = []
        if system_prompt:
            openai_messages.append({"role": "system", "content": system_prompt})
            
        for msg in messages:
            role = msg.get("role", "user")
            content = msg.get("content")
            
            openai_msg = {"role": role}
            
            if isinstance(content, str):
                openai_msg["content"] = content
            elif isinstance(content, list):
                text_parts = [p["text"] for p in content if "text" in p]
                openai_msg["content"] = "\n".join(text_parts)
                
            if role == "assistant" and msg.get("tool_calls"):
                openai_tc = []
                for tc in msg["tool_calls"]:
                    try:
                        args = json.loads(tc.function.arguments)
                    except Exception:
                        args = {}
                    tool_calls.append({
                        "id": tc.id,
                        "name": tc.function.name,
                        "arguments": args
                    })
                
            elif role == "tool":
                openai_msg["tool_call_id"] = msg.get("tool_call_id")
                output_val = msg.get("output")
                openai_msg["content"] = json.dumps(output_val) if not isinstance(output_val, str) else output_val
                
            openai_messages.append(openai_msg)
            
        params = {
            "model": model_id,
            "messages": openai_messages,
            "max_tokens": max_tokens,
            "temperature": temperature
        }
        if openai_tools:
            params["tools"] = openai_tools
            
        response = client.chat.completions.create(**params)
        choice_msg = response.choices[0].message
        
        tool_calls = []
        if choice_msg.tool_calls:
            for tc in choice_msg.tool_calls:
                try:
                    args = json.loads(tc.function.arguments)
                except Exception:
                    args = {}
                tool_calls.append({
                    "id": tc.id,
                    "name": tc.function.name,
                    "arguments": args
                })
                
        return {
            "role": "assistant",
            "content": choice_msg.content or "",
            "tool_calls": tool_calls
        }


    def generate_diagram_image(self, prompt: str, request_id: Optional[str] = None) -> Optional[str]:
        """
        Generate an architecture diagram image using Amazon Titan Image Generator v2.
        Returns a base64 data URI string (data:image/png;base64,...) or None on fallback.
        """
        rid = request_id or str(uuid.uuid4())
        try:
            client = self._get_bedrock_client()
            diagram_prompt = f"Professional technical cloud architecture diagram, sleek dark mode theme, SRE topology: {prompt}"
            body = json.dumps({
                "taskType": "TEXT_IMAGE",
                "textToImageParams": {
                    "text": diagram_prompt[:512]
                },
                "imageGenerationConfig": {
                    "numberOfImages": 1,
                    "quality": "standard",
                    "height": 512,
                    "width": 512,
                    "cfgScale": 8.0
                }
            })
            response = client.invoke_model(
                modelId="amazon.titan-image-generator-v2:0",
                body=body,
                contentType="application/json",
                accept="application/json"
            )
            res_body = json.loads(response["body"].read())
            images = res_body.get("images", [])
            if images:
                logger.info("Amazon Titan diagram image generated successfully", extra={"request_id": rid})
                return f"data:image/png;base64,{images[0]}"
        except Exception as exc:
            logger.warning(
                "Amazon Titan Image Generator unavailable or unpermitted; proceeding without AI image",
                extra={"request_id": rid, "error": str(exc)}
            )
        return None

    def check_availability(self) -> dict:
        """
        Perform a lightweight probe to confirm the AI provider is reachable.
        Returns a safe status dict — never raises.
        """
        try:
            if settings.AI_PROVIDER == "bedrock":
                client = self._get_bedrock_client()
                # Probe with a minimal prompt
                test_body = json.dumps({
                    "anthropic_version": "bedrock-2023-05-31",
                    "max_tokens": 10,
                    "temperature": 0.0,
                    "messages": [{"role": "user", "content": "ping"}],
                })
                client.invoke_model(
                    modelId=settings.BEDROCK_MODEL_ID,
                    body=test_body,
                    contentType="application/json",
                    accept="application/json",
                )
                return {"status": "available", "provider": "bedrock"}
            else:
                # For non-Bedrock, skip live probe — just confirm config
                if settings.OPENAI_API_KEY:
                    return {"status": "available", "provider": "openai"}
                return {"status": "misconfigured", "provider": "openai"}
        except Exception as exc:
            code = classify_provider_exception(exc)
            return {"status": "unavailable", "provider": settings.AI_PROVIDER, "error_code": code}


class _SafeError(Exception):
    """Internal sentinel — carries a safe error response dict."""
    def __init__(self, response: dict) -> None:
        self.response = response
        super().__init__(response["error"]["code"])


# Module-level singleton
bedrock_client = BedrockClient()

---- END ORIGINAL IMPLEMENTATION ----
'''

# ---------------------------------------------------------------------------
# Lightweight active stub
# ---------------------------------------------------------------------------
import uuid
import logging
from typing import Optional, List, Dict, Any

from app.settings import settings
from app.errors import ErrorCode, build_error_response

logger = logging.getLogger(__name__)


class _SafeError(Exception):
    """Internal sentinel — carries a safe error response dict."""

    def __init__(self, response: dict) -> None:
        self.response = response
        super().__init__(response.get("error", {}).get("code", "disabled"))


class BedrockClient:
    """Minimal stub of the Bedrock client used while Bedrock is disabled.

    Methods present are intentionally lightweight and return safe,
    non-exceptional responses where possible to avoid cascading failures.
    """

    def __init__(self) -> None:
        self._provider = settings.AI_PROVIDER

    def invoke(self, *args, **kwargs) -> str:
        rid = kwargs.get("request_id") or str(uuid.uuid4())
        logger.warning("Bedrock client invoked while disabled", extra={"request_id": rid})
        raise _SafeError(build_error_response(ErrorCode.AI_PROVIDER_UNAVAILABLE, rid))

    def converse_with_tools(self, *args, **kwargs) -> Dict[str, Any]:
        rid = kwargs.get("request_id") or str(uuid.uuid4())
        logger.warning("Converse_with_tools called while Bedrock disabled", extra={"request_id": rid})
        raise _SafeError(build_error_response(ErrorCode.AI_PROVIDER_UNAVAILABLE, rid))

    def generate_diagram_image(self, *args, **kwargs) -> Optional[str]:
        # No image generation available in stub
        return None

    def check_availability(self) -> dict:
        # Report that Bedrock is intentionally disabled locally
        return {"status": "disabled", "provider": "bedrock"}


# Module-level singleton used by the rest of the codebase
bedrock_client = BedrockClient()
