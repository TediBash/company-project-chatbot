# app/api/routes/chat.py
import json
import uuid
from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse
from sqlalchemy import select

from app.db.session import AsyncSessionLocal
from app.db.models import ChatSession
from app.database import db
from app.pipeline.executor import CognitiveLoopExecutor

router = APIRouter()

# ---------------------------------------------------------
# Session Creation Endpoint (Called by React UI/QR Code)
# ---------------------------------------------------------
class CreateSessionRequest(BaseModel):
    company_id: str
    machine_id: str  # Forces the UI to specify a machine
    user_id: str = "anonymous"

@router.post("/sessions")
async def create_chat_session(req: CreateSessionRequest):
    """Creates a new chat session locked to a specific machine."""
    session_id = f"sess_{uuid.uuid4().hex[:8]}"
    
    async with AsyncSessionLocal() as session:
        new_session = ChatSession(
            id=session_id,
            company_id=req.company_id,
            user_id=req.user_id,
            machine_id=req.machine_id
        )
        session.add(new_session)
        await session.commit()
        
    return {
        "session_id": session_id,
        "machine_id": req.machine_id,
        "status": "created"
    }

# ---------------------------------------------------------
# The Streaming Endpoint (Engine Execution)
# ---------------------------------------------------------
class ChatStreamRequest(BaseModel):
    session_id: str
    company_id: str
    user_id: str
    role: str
    message: str
    machine_name: str = "Unknown Model"
    serial_number: str = ""
    auth_token: str = ""

@router.post("/stream")
async def chat_stream(req: ChatStreamRequest, request: Request):
    
    # 1. VERIFY SESSION AND FETCH MACHINE ID
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(ChatSession).where(ChatSession.id == req.session_id)
        )
        chat_session = result.scalar_one_or_none()
        
        if not chat_session:
            raise HTTPException(status_code=404, detail="Chat session not found or expired.")
        
        extracted_token = getattr(req, "auth_token", "")
        if not extracted_token:
            auth_header = request.headers.get("Authorization")
            if auth_header and auth_header.startswith("Bearer "):
                extracted_token = auth_header.split(" ")[1]
                
        if not extracted_token:
            print("[WARNING] No Auth Token found in request body or headers!")
        
        # We now know exactly which machine this user is talking about!
        active_machine_id = chat_session.machine_id

    async def event_generator():
        # 2. Save User Message to PostgreSQL
        async with db.tenant_connection(req.company_id) as conn:
            await conn.execute(
                """
                INSERT INTO app_chat.chat_messages (session_id, role, content) 
                VALUES ($1, 'user', $2)
                """, 
                req.session_id, req.message
            )

        # 3. Instantiate and run the Cognitive Loop
        executor = CognitiveLoopExecutor(
            session_id=req.session_id, 
            company_id=req.company_id, 
            user_id=req.user_id
        )
        
        # Inject the Phase 1 RBAC and Machine Lock variables
        executor.user_role = req.role.lower() # Ensure it's lowercase for the guardrails
        executor.active_machine_id = active_machine_id
        executor.active_machine_name = req.machine_name
        executor.active_serial_number = str(req.serial_number) if req.serial_number else active_machine_id
        executor.auth_token = extracted_token
        
        final_response_buffer = ""

        # 4. Stream the executor's output directly to React
        async for event in executor.execute(req.message):
            if await request.is_disconnected():
                break
                
            if event["type"] == "message":
                final_response_buffer += event["payload"]
                
            yield {"data": json.dumps(event)}

        # 5. Save Final AI Message to PostgreSQL
        if final_response_buffer and not await request.is_disconnected():
            async with db.tenant_connection(req.company_id) as conn:
                await conn.execute(
                    """
                    INSERT INTO app_chat.chat_messages (session_id, role, content) 
                    VALUES ($1, 'assistant', $2)
                    """, 
                    req.session_id, final_response_buffer.strip()
                )

    return EventSourceResponse(event_generator())