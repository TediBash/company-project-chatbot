# app/db/models.py
import uuid
from datetime import datetime
from sqlalchemy import Column, String, Float, Text, DateTime
from sqlalchemy.dialects.postgresql import UUID, JSONB
from app.db.session import Base

class ChatSession(Base):
    __tablename__ = "chat_sessions"
    __table_args__ = {"schema": "app_chat"}
    
    # We use a string ID here like "sess_12345" as defined in our API route
    id = Column("session_id", UUID(as_uuid=False), primary_key=True)
    company_id = Column(String(100), nullable=False, index=True)
    user_id = Column(String(100), nullable=True)
    
    # This locks the entire conversation to a specific machine
    machine_id = Column(String(100), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class AITelemetryTrace(Base):
    __tablename__ = "ai_telemetry_traces"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id = Column(String(100), nullable=False, index=True)
    company_id = Column(String(100), nullable=False, index=True)
    user_id = Column(String(100), nullable=True)
    machine_id = Column(String(100), nullable=False)
    
    # High-level summary
    question = Column(Text, nullable=False)
    final_answer = Column(Text, nullable=True)
    target_agent = Column(String(50), nullable=True)
    
    # The Timeline of Events (The most important column)
    trajectory_steps = Column(JSONB, default=list)
    
    # Aggregated Metrics
    total_tokens_in = Column(Float, default=0)
    total_tokens_out = Column(Float, default=0)
    total_cost_usd = Column(Float, default=0.0)
    total_latency_sec = Column(Float, default=0.0)
    
    created_at = Column(DateTime, default=datetime.utcnow)