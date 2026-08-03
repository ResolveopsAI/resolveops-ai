import os
import uuid
import datetime
from sqlalchemy import create_engine, Column, String, DateTime, Float, JSON, Integer, Text, Boolean
from sqlalchemy.orm import declarative_base, sessionmaker

# Expects a standard PostgreSQL connection string
DATABASE_URL = os.getenv("DATABASE_URL")
if DATABASE_URL and DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

Base = declarative_base()

class Artifact(Base):
    __tablename__ = 'artifacts'

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id = Column(String(255), nullable=False, index=True)
    artifact_type = Column(String(50), nullable=False) # e.g., 'architecture', 'rca', 'report'
    blob_container = Column(String(255), nullable=False)
    blob_path = Column(String(1024), nullable=False)
    file_name = Column(String(255), nullable=False)
    content_type = Column(String(100), nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    status = Column(String(50), default="CREATED")

class User(Base):
    __tablename__ = 'resolveops_users'
    email = Column(String(255), primary_key=True)
    user_id = Column(String(255), nullable=False, index=True)
    tenant_id = Column(String(255), nullable=False, index=True)
    full_name = Column(String(255))
    hashed_password = Column(String(255))
    created_at = Column(String(100))
    role = Column(String(50), default="user")
    reliability_score = Column(String(50), default="100.0")
    integrations = Column(JSON, default=dict)

class ApiKey(Base):
    __tablename__ = 'nexus_api_keys'
    api_key = Column(String(255), primary_key=True)
    user_id = Column(String(255), index=True)
    tenant_id = Column(String(255), index=True)
    name = Column(String(255))
    created_at = Column(String(100))
    last_used = Column(String(100), nullable=True)
    status = Column(String(50), default="active")

class Incident(Base):
    __tablename__ = 'nexus_incidents'
    tenant_id = Column(String(255), primary_key=True)
    incident_id = Column(String(255), primary_key=True)
    title = Column(String(255))
    status = Column(String(50))
    severity = Column(String(50))
    created_at = Column(String(100))
    detected_at = Column(String(100))
    description = Column(Text)
    affected_resources = Column(JSON, default=list)
    resolution_time = Column(String(100), nullable=True)
    root_cause = Column(Text, nullable=True)
    ai_analysis = Column(Text, nullable=True)
    remediation_steps = Column(JSON, default=list)

class Log(Base):
    __tablename__ = 'nexus_logs'
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id = Column(String(255), nullable=False, index=True)
    timestamp = Column(String(100), nullable=False)
    provider = Column(String(100))
    resource_type = Column(String(100))
    service = Column(String(100))
    level = Column(String(50))
    message = Column(Text)
    latency_ms = Column(String(50), nullable=True)
    status_code = Column(Integer, nullable=True)
    request_id = Column(String(255), nullable=True)
    cluster_id = Column(String(255), nullable=True)
    resource_id = Column(String(255), nullable=True)

class Deployment(Base):
    __tablename__ = 'nexus_deployments'
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id = Column(String(255), nullable=False, index=True)
    timestamp = Column(String(100), nullable=False)
    commit_sha = Column(String(255))
    commit_msg = Column(Text)
    author = Column(String(255))
    repository = Column(String(255))
    workflow_run_id = Column(String(255), nullable=True)
    pr_url = Column(String(1024), nullable=True)

class ChatHistory(Base):
    __tablename__ = 'resolveops_chat_history'
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id = Column(String(255), nullable=False, index=True)
    timestamp = Column(String(100), nullable=False)
    session_id = Column(String(255), nullable=False)
    role = Column(String(50))
    content = Column(Text)
    image_base64 = Column(Text, nullable=True)
    title = Column(String(255), nullable=True)
    execution = Column(JSON, nullable=True)

class PredictiveRisk(Base):
    __tablename__ = 'nexus_predictive_risks'
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id = Column(String(255), nullable=False, index=True)
    timestamp = Column(String(100), nullable=False)
    provider = Column(String(100))
    resource_type = Column(String(100))
    resource_name = Column(String(255))
    risk_score = Column(Float)
    confidence_score = Column(Float)
    ettf_minutes = Column(Integer, nullable=True)
    analysis = Column(Text)
    recommendation = Column(Text)

class AuditLog(Base):
    __tablename__ = 'audit_logs'
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    timestamp = Column(DateTime, default=datetime.datetime.utcnow, nullable=False, index=True)
    actor_user_id = Column(String(255), nullable=True, index=True)
    actor_email = Column(String(255), nullable=True, index=True)
    actor_role = Column(String(50), nullable=True)
    action = Column(String(255), nullable=False, index=True)
    target_type = Column(String(100), nullable=True)
    target_name = Column(String(255), nullable=True, index=True)
    request_id = Column(String(255), nullable=True)
    correlation_id = Column(String(255), nullable=True)
    approval_id = Column(String(255), nullable=True)
    status = Column(String(50), default="success", index=True)
    reason = Column(Text, nullable=True)
    sanitized_parameters = Column(JSON, default=dict)
    previous_state = Column(JSON, default=dict)
    resulting_state = Column(JSON, default=dict)
    source_ip = Column(String(100), nullable=True)
    user_agent = Column(String(255), nullable=True)
    error_code = Column(String(100), nullable=True)
    error_message = Column(Text, nullable=True)
    event_hash = Column(String(255), nullable=True)
    previous_event_hash = Column(String(255), nullable=True)

class HealingAction(Base):
    __tablename__ = 'healing_actions'
    id                  = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id           = Column(String(255), nullable=False, index=True)
    triggered_at        = Column(DateTime, default=datetime.datetime.utcnow, nullable=False, index=True)
    service             = Column(String(255), nullable=False, index=True)
    failure_type        = Column(String(255), nullable=False)
    risk_score          = Column(Float, nullable=True)
    confidence_score    = Column(Float, nullable=True)
    action_taken        = Column(String(255), nullable=False)  # e.g. "k8s_rollout_restart", "ec2_start", "simulated"
    target_resource     = Column(String(512), nullable=True)   # deployment name, instance-id, queue URL
    status              = Column(String(50), nullable=False, default="simulated", index=True)  # "success" | "failed" | "simulated"
    result_message      = Column(Text, nullable=True)
    incident_id         = Column(String(255), nullable=True)
    auto_resolved       = Column(Boolean, default=False)

class ContainerAction(Base):
    __tablename__ = 'container_actions'
    action_id = Column(String(255), primary_key=True)
    service_name = Column(String(255), nullable=False, index=True)
    reason = Column(Text, nullable=False)
    requested_by = Column(String(255), nullable=False, index=True)
    requested_at = Column(String(100), nullable=False)
    status = Column(String(50), nullable=False, default="awaiting_approval", index=True)
    approved_by = Column(String(255), nullable=True)
    approved_at = Column(String(100), nullable=True)
    rejected_by = Column(String(255), nullable=True)
    rejected_at = Column(String(100), nullable=True)
    rejection_reason = Column(Text, nullable=True)
    expires_at = Column(String(100), nullable=True)
    execution_started_at = Column(String(100), nullable=True)
    execution_completed_at = Column(String(100), nullable=True)
    before_state = Column(JSON, default=dict)
    after_state = Column(JSON, default=dict)
    verification_status = Column(String(50), nullable=True)
    error_message = Column(Text, nullable=True)

engine = None
SessionLocal = None

def init_pg_db():
    global engine, SessionLocal
    if not DATABASE_URL:
        print("Warning: DATABASE_URL not set. PostgreSQL storage will not be available.")
        return
    try:
        engine = create_engine(DATABASE_URL, pool_pre_ping=True)
        Base.metadata.create_all(bind=engine)
        SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
        print("PostgreSQL tables initialized successfully.")
    except Exception as e:
        print(f"Failed to initialize PostgreSQL DB: {e}")

def get_db():
    if not SessionLocal:
        yield None
        return
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
