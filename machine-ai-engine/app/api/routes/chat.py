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

from app.tools.commercial import create_draft_quote

router = APIRouter()

# ---------------------------------------------------------
# Session Creation Endpoint
# ---------------------------------------------------------
class CreateSessionRequest(BaseModel):
    company_id: str
    machine_id: str  
    user_id: str = "anonymous"

@router.post("/sessions")
async def create_chat_session(req: CreateSessionRequest):
    print(f"[DEBUG] Incoming CreateSessionRequest: {req.model_dump()}")
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
# The Streaming Endpoint
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
    machine_model: str = "Unknown Model"

@router.post("/stream")
async def chat_stream(req: ChatStreamRequest, request: Request):
    print(f"[DEBUG] Incoming ChatStreamRequest: {req.model_dump(exclude={'auth_token'})}")
    
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
                
        active_machine_id = chat_session.machine_id

    async def event_generator():
        async with db.tenant_connection(req.company_id) as conn:
            await conn.execute(
                "INSERT INTO app_chat.chat_messages (session_id, role, content) VALUES ($1, 'user', $2)", 
                req.session_id, req.message
            )

        executor = CognitiveLoopExecutor(
            session_id=req.session_id, 
            company_id=req.company_id, 
            user_id=req.user_id
        )
        
        executor.user_role = req.role.lower()
        executor.active_machine_id = active_machine_id
        executor.active_machine_name = req.machine_name
        executor.active_serial_number = str(req.serial_number) if req.serial_number else "Unknown SN"
        executor.active_machine_model = req.machine_model
        executor.auth_token = extracted_token
        
        final_response_buffer = ""

        async for event in executor.execute(req.message):
            if await request.is_disconnected():
                break
                
            if event["type"] == "message":
                final_response_buffer += event["payload"]
                
            # ---> NEW: Safely log the Tool Call Action directly to the Database <---
            elif event["type"] == "action_required":
                action_payload = event["payload"].copy()
                action_payload["isActionRequest"] = True
                action_payload["isResolved"] = False
                
                async with db.tenant_connection(req.company_id) as conn:
                    await conn.execute(
                        "INSERT INTO app_chat.chat_messages (session_id, role, content) VALUES ($1, 'assistant', $2)", 
                        req.session_id, json.dumps(action_payload)
                    )
                
            yield {"data": json.dumps(event)}

        if final_response_buffer and not await request.is_disconnected():
            async with db.tenant_connection(req.company_id) as conn:
                await conn.execute(
                    "INSERT INTO app_chat.chat_messages (session_id, role, content) VALUES ($1, 'assistant', $2)", 
                    req.session_id, final_response_buffer.strip()
                )

    return EventSourceResponse(event_generator())

# ---------------------------------------------------------
# HITL Action Resolution
# ---------------------------------------------------------
NODE_API_BASE = os.getenv("NODE_API_BASE", "http://localhost:5000/api")

# Helper function to update the DB state for an action
async def mark_action_resolved_in_db(session_id: str, company_id: str, is_approved: bool, result_message: str):
    async with db.tenant_connection(company_id) as conn:
        # 1. Fetch the exact action message from the DB
        row = await conn.fetchrow(
            """
            SELECT message_id, content FROM app_chat.chat_messages 
            WHERE session_id = $1 AND role = 'assistant' AND content LIKE '%"isActionRequest": true%' 
            ORDER BY created_at DESC LIMIT 1
            """, session_id
        )
        
        # 2. Update it to resolved
        if row:
            try:
                content_dict = json.loads(row["content"])
                content_dict["isResolved"] = True
                content_dict["approved"] = is_approved
                
                await conn.execute(
                    "UPDATE app_chat.chat_messages SET content = $1 WHERE message_id = $2",
                    json.dumps(content_dict), row["message_id"]
                )
            except Exception as e:
                print(f"[DB Error] Failed to update action request JSON: {e}")
        
        # 3. Insert the final confirmation message
        await conn.execute(
            "INSERT INTO app_chat.chat_messages (session_id, role, content) VALUES ($1, 'assistant', $2)",
            session_id, result_message
        )

@router.post("/action")
@router.post("/sessions/{session_id}/action")
async def execute_action(request: Request, session_id: str = None):
    try:
        req_data = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing Authorization header")
    token = auth_header.split(" ")[1]

    if not session_id:
        session_id = req_data.get("session_id")

    machine_id = req_data.get("machine_id") or req_data.get("machineId") or ""
    company_id = req_data.get("company_id") or req_data.get("companyId") or ""
    action_type = req_data.get("action_type") or req_data.get("action", "")
    is_approved = req_data.get("approved", True)
    
    # 1. Handle Cancellation / Rejection
    if not is_approved or action_type in ["reject", "cancel", "reject_commercial_request"]:
        result_msg = "Action cancelled by user."
        await mark_action_resolved_in_db(session_id, company_id, False, result_msg)
        return {"status": "success", "message": result_msg}

    # 2. Handle Commercial Requests (Tickets)
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
            
            response = await client.post(f"{NODE_API_BASE}/commercial", json=body, headers=headers)
            
            if response.status_code == 201:
                result_msg = "Ticket created successfully."
                await mark_action_resolved_in_db(session_id, company_id, True, result_msg)
                return {"status": "success", "message": result_msg, "data": response.json()}
            else:
                raise HTTPException(status_code=response.status_code, detail=f"Node.js rejected the request: {response.text}")
                
    elif action_type == "create_quote":
        # Extract the dynamic payload passed from Node.js
        details = req_data.get("details", {})
        
        # Extract specific quote fields (fallback to session context if missing)
        quote_company_id = details.get("companyId") or company_id 
        description = details.get("description", "New Quote generated by AI")
        currency = details.get("currency", "EUR")
        lines = details.get("lines", [])
        
        try:
            # Execute the Python tool!
            result_str = await create_draft_quote(
                company_id=quote_company_id,
                description=description,
                currency=currency,
                lines=lines,
                auth_token=token
            )
            
            result_json = json.loads(result_str)
            
            if "error" in result_json:
                raise HTTPException(status_code=500, detail=result_json["error"])
                
            result_msg = "Quote drafted successfully."
            await mark_action_resolved_in_db(session_id, company_id, True, result_msg)
            return {"status": "success", "message": result_msg, "data": result_json}
            
        except Exception as e:
            print(f"[Quote Creation Error] {e}")
            raise HTTPException(status_code=500, detail=f"Failed to create quote: {str(e)}")

    else:
        raise HTTPException(status_code=400, detail=f"Unknown action type: {action_type}")