# app/api/routes/chat.py
import json
import uuid
import os
import httpx
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
    print(f"[DEBUG] Incoming CreateSessionRequest: {req.model_dump()}")
    
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
    
    print(f"[DEBUG] Incoming ChatStreamRequest: {req.model_dump(exclude={'auth_token'})}")
    
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
        executor.active_serial_number = str(req.serial_number) if req.serial_number else "Unknown SN"
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

NODE_API_BASE = os.getenv("NODE_API_BASE", "http://localhost:5000/api")

@router.post("/action")
@router.post("/sessions/{session_id}/action")
async def execute_action(request: Request, session_id: str = None):
    # 1. Parse raw JSON
    try:
        req_data = await request.json()
        print(f"[DEBUG] Full Incoming Data: {req_data}")
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    # 2. Extract Token
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing Authorization header")
    token = auth_header.split(" ")[1]

    # 3. SECURELY FETCH MACHINE ID FROM DATABASE
    if not session_id:
        session_id = req_data.get("session_id")


    # ---> NEW: Fallback safely to request body if DB lookup fails! <---
    machine_id =  req_data.get("machine_id") or req_data.get("machineId") or ""
    company_id =  req_data.get("company_id") or req_data.get("companyId") or ""

    # 4. Extract Payload Safely
    action_type = req_data.get("action_type") or req_data.get("action", "")
    is_approved = req_data.get("approved", True)
    
    if not is_approved or action_type in ["reject", "cancel", "reject_commercial_request"]:
        return {"status": "success", "message": "Action cancelled by user."}

    # 5. Route the Action
    if action_type in ["create_commercial_request", "commercial_request"]:
        async with httpx.AsyncClient() as client:
            headers = {"Authorization": f"Bearer {token}"}
            
            raw_type = req_data.get("type", "spare_parts")
            
            raw_urgency = str(req_data.get("urgency", "medium")).lower()
            
            extracted_title = req_data.get("title", f"Spare Part Request for {machine_id}")
                
            type_mapper = {"spare_parts": "Spare Parts", "technical_support": "Technical Support"}
            urgency_mapper = {"low": "Low", "medium": "Standard", "high": "Urgent", "critical": "Critical"}
                
            db_type = type_mapper.get(raw_type, "Spare Parts") 
            db_urgency = urgency_mapper.get(raw_urgency, "Standard")
            
            body = {
                "title": extracted_title,
                "description": req_data.get("description", "Automated request generated via AI Assistant."),
                "type": db_type,
                "urgency": db_urgency,
                "machineId": str(machine_id) if machine_id else "",
                "companyId": str(company_id) if company_id else ""
            }
            
            print(f"[DEBUG] Sending to Node: {body}")
            
            response = await client.post(f"{NODE_API_BASE}/commercial", json=body, headers=headers)
            
            if response.status_code == 201:
                return {"status": "success", "message": "Ticket created successfully.", "data": response.json()}
            else:
                raise HTTPException(status_code=response.status_code, detail=f"Node.js rejected the request: {response.text}")
    else:
        raise HTTPException(status_code=400, detail=f"Unknown action type: {action_type}")