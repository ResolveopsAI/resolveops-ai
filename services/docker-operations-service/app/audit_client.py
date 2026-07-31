"""
PostgreSQL database client for recording container actions and audit records.
"""
import os
import uuid
import datetime
import logging
from sqlalchemy import create_engine, Column, String, Text, JSON, DateTime
from sqlalchemy.orm import declarative_base, sessionmaker

logger = logging.getLogger("docker-operations-service")

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://resolveopsadmin:local-db-pass@postgres:5432/resolveopsdb")
if DATABASE_URL and DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

Base = declarative_base()


class ContainerActionModel(Base):
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

try:
    engine = create_engine(DATABASE_URL, pool_pre_ping=True)
    Base.metadata.create_all(bind=engine)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
except Exception as e:
    logger.warning(f"Could not connect docker-operations-service directly to DB: {e}")
