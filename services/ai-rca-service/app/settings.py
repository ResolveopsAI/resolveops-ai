"""
AI-RCA Service — Centralised settings.

All configuration is loaded from environment variables.
Provider selection, feature flags, and limits are defined here.
"""
import os
import logging
from typing import Optional

logger = logging.getLogger(__name__)


class Settings:
    """Centralised, read-once settings for ai-rca-service."""

    # ── App ──────────────────────────────────────────────────────────────────
    APP_ENV: str = os.getenv("APP_ENV", "dev")
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO").upper()

    # ── AI Provider ──────────────────────────────────────────────────────────
    AI_PROVIDER: str = os.getenv("AI_PROVIDER", "openai").lower()
    BEDROCK_MODEL_ID: str = os.getenv(
        "BEDROCK_MODEL_ID",
        "anthropic.claude-3-haiku-20240307-v1:0",
    )
    AWS_REGION: str = os.getenv("AWS_REGION", "ap-south-1")
    BEDROCK_REQUEST_TIMEOUT_SECONDS: int = int(
        os.getenv("BEDROCK_REQUEST_TIMEOUT_SECONDS", "60")
    )
    BEDROCK_MAX_RETRIES: int = int(os.getenv("BEDROCK_MAX_RETRIES", "2"))

    # OpenAI configuration
    OPENAI_FALLBACK_ENABLED: bool = (
        os.getenv("OPENAI_FALLBACK_ENABLED", "false").lower() == "true"
    )
    OPENAI_API_KEY: Optional[str] = os.getenv("OPENAI_API_KEY") or None
    OPENAI_BASE_URL: Optional[str] = os.getenv("OPENAI_BASE_URL") or None
    OPENAI_MODEL: str = os.getenv("OPENAI_MODEL", os.getenv("OPENAI_MODEL_NAME", ""))

    # ── Feature Flags ────────────────────────────────────────────────────────
    MCP_RCA_ENABLED: bool = (
        os.getenv("MCP_RCA_ENABLED", "true").lower() == "true"
    )
    AI_RCA_CHAT_ENABLED: bool = (
        os.getenv("AI_RCA_CHAT_ENABLED", "true").lower() == "true"
    )
    LEGACY_GATEWAY_RAG_ENABLED: bool = (
        os.getenv("LEGACY_GATEWAY_RAG_ENABLED", "false").lower() == "true"
    )

    # ── MCP ──────────────────────────────────────────────────────────────────
    MCP_SERVER_URL: str = os.getenv(
        "MCP_SERVER_URL", "http://mcp-server-service:8000/mcp"
    )
    MCP_SERVICE_TOKEN: Optional[str] = os.getenv("MCP_SERVICE_TOKEN") or None
    MCP_REQUEST_TIMEOUT_SECONDS: int = int(
        os.getenv("MCP_REQUEST_TIMEOUT_SECONDS", "30")
    )

    # ── Investigation Limits ─────────────────────────────────────────────────
    RCA_MAX_TOOL_CALLS: int = int(os.getenv("RCA_MAX_TOOL_CALLS", "6"))
    RCA_MAX_RETRIEVAL_ROUNDS: int = int(os.getenv("RCA_MAX_RETRIEVAL_ROUNDS", "2"))
    RCA_INVESTIGATION_TIMEOUT_SECONDS: int = int(
        os.getenv("RCA_INVESTIGATION_TIMEOUT_SECONDS", "90")
    )
    RCA_MAX_EVIDENCE_ITEMS: int = int(os.getenv("RCA_MAX_EVIDENCE_ITEMS", "15"))
    RCA_MAX_LOG_CHARACTERS: int = int(os.getenv("RCA_MAX_LOG_CHARACTERS", "20000"))

    # ── RAG ──────────────────────────────────────────────────────────────────
    RAG_PROVIDER: str = os.getenv("RAG_PROVIDER", "bedrock_knowledge_base")
    RAG_FAISS_FALLBACK_ENABLED: bool = (
        os.getenv("RAG_FAISS_FALLBACK_ENABLED", "false").lower() == "true"
    )
    BEDROCK_KNOWLEDGE_BASE_ID: Optional[str] = (
        os.getenv("BEDROCK_KNOWLEDGE_BASE_ID") or None
    )
    RAG_MAX_RESULTS: int = int(os.getenv("RAG_MAX_RESULTS", "10"))

    # ── Visual Generation ─────────────────────────────────────────────────────
    VISUAL_GENERATION_ENABLED: bool = (
        os.getenv("VISUAL_GENERATION_ENABLED", "true").lower() == "true"
    )
    # DALL-E 3 / GPT Image models: gpt-image-2, dall-e-3, dall-e-2
    OPENAI_IMAGE_MODEL: str = os.getenv("OPENAI_IMAGE_MODEL", "gpt-image-2")
    # GPT Image quality: medium | hd | standard
    OPENAI_IMAGE_QUALITY: str = os.getenv("OPENAI_IMAGE_QUALITY", "medium")
    # GPT Image landscape: 1536x1024, portrait: 1024x1536, square: 1024x1024
    OPENAI_IMAGE_SIZE: str = os.getenv("OPENAI_IMAGE_SIZE", "1536x1024")
    OPENAI_IMAGE_FORMAT: str = os.getenv("OPENAI_IMAGE_FORMAT", "png")
    VISUAL_STORAGE_PROVIDER: str = os.getenv("VISUAL_STORAGE_PROVIDER", "local")
    VISUAL_STORAGE_DIR: str = os.getenv("VISUAL_STORAGE_DIR", "/app/data/visuals")
    VISUAL_GENERATION_TIMEOUT_SECONDS: float = float(
        os.getenv("VISUAL_GENERATION_TIMEOUT_SECONDS", "120")
    )
    VISUAL_MAX_REQUESTS_PER_USER: int = int(
        os.getenv("VISUAL_MAX_REQUESTS_PER_USER", "10")
    )
    VISUAL_CACHE_ENABLED: bool = (
        os.getenv("VISUAL_CACHE_ENABLED", "true").lower() == "true"
    )
    VISUAL_MAX_COMPONENTS: int = int(os.getenv("VISUAL_MAX_COMPONENTS", "30"))

    # ── Internal Services ────────────────────────────────────────────────────
    AWS_INTELLIGENCE_SERVICE_URL: str = os.getenv(
        "AWS_INTELLIGENCE_SERVICE_URL", "http://aws-intelligence-service:8000"
    )
    GITHUB_INTELLIGENCE_SERVICE_URL: str = os.getenv(
        "GITHUB_INTELLIGENCE_SERVICE_URL", "http://github-intelligence-service:8000"
    )

    def validate(self) -> list[str]:
        """Return a list of configuration warnings (not fatal, but logged)."""
        warnings: list[str] = []

        if self.AI_PROVIDER == "bedrock":
            if not self.BEDROCK_MODEL_ID:
                warnings.append("BEDROCK_MODEL_ID is not set; using default model.")
            if not self.AWS_REGION:
                warnings.append("AWS_REGION is not set; defaulting to ap-south-1.")

        elif self.AI_PROVIDER == "openai":
            if not self.OPENAI_API_KEY:
                warnings.append("AI_PROVIDER=openai but OPENAI_API_KEY is not set.")
            if not self.OPENAI_MODEL:
                warnings.append("AI_PROVIDER=openai but OPENAI_MODEL is not set.")

        else:
            warnings.append(
                f"Unknown AI_PROVIDER='{self.AI_PROVIDER}'. "
                "Expected 'bedrock' or 'openai'."
            )

        return warnings

    def provider_status_dict(self) -> dict:
        """Return a safe, public-facing provider status (no secrets)."""
        if self.AI_PROVIDER == "openai":
            display_name = "OpenAI"
            model = self.OPENAI_MODEL
            is_valid = bool(self.OPENAI_API_KEY and self.OPENAI_MODEL)
            status = "available" if is_valid else "misconfigured"
        elif self.AI_PROVIDER == "bedrock":
            display_name = "Amazon Bedrock"
            model = self.BEDROCK_MODEL_ID
            status = "available"
        else:
            display_name = self.AI_PROVIDER.capitalize()
            model = "unknown"
            status = "misconfigured"

        return {
            "provider": self.AI_PROVIDER,
            "display_name": display_name,
            "model": model,
            "status": status,
            "fallback_enabled": self.OPENAI_FALLBACK_ENABLED,
            "region": self.AWS_REGION if self.AI_PROVIDER == "bedrock" else None,
            "mcp_enabled": self.MCP_RCA_ENABLED,
            "chat_via_rca": self.AI_RCA_CHAT_ENABLED,
            "rag_provider": self.RAG_PROVIDER,
        }


# Singleton — instantiated once at import time.
settings = Settings()
