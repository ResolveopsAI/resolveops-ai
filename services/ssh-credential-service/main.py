from fastapi import FastAPI
from routes.credential_routes import router as credential_router
from routes.self_heal_routes import router as self_heal_router

app = FastAPI(
    title="SSH Credential & Self-Healing Service",
    description=(
        "Secure PEM file vault and unrestricted AI-powered self-healing engine. "
        "Manages encrypted SSH credentials, matches key pairs to EC2 instances, "
        "auto-detects OS for SSH user resolution, and executes user-approved "
        "remediation commands via SSH."
    ),
    version="1.0.0"
)

app.include_router(credential_router)
app.include_router(self_heal_router)


@app.get("/health")
def health_check():
    return {"status": "healthy", "service": "ssh-credential-service"}
