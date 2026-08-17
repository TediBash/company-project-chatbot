# app/api/routes/chat.py
import json
import asyncio
from fastapi import APIRouter, Request
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse
from app.database import db

router = APIRouter()

class ChatStreamRequest(BaseModel):
    session_id: str
    company_id: str
    user_id: str
    role: str
    message: str

@router.post("/stream")
async def chat_stream(req: ChatStreamRequest, request: Request):
    
    async def event_generator():
        try:
            # 1. Save User Message
            async with db.tenant_connection(req.company_id) as conn:
                await conn.execute(
                    """
                    INSERT INTO app_chat.chat_messages (session_id, role, content) 
                    VALUES ($1, 'user', $2)
                    """, 
                    req.session_id, req.message
                )

            # 2. Yield Status Updates (Pass a DICT, sse-starlette handles the \n\n formatting!)
            yield {"data": json.dumps({"type": "status", "payload": "Orchestrator analyzing request..."})}
            await asyncio.sleep(1)
            
            yield {"data": json.dumps({"type": "status", "payload": f"Routed to Technical Agent (Role: {req.role})..."})}
            await asyncio.sleep(1)

            yield {"data": json.dumps({"type": "status", "payload": "Generating response..."})}
            
            # 3. Stream the Tokens
            mocked_response = "Based on the manual for your capping machine, please check the air pressure valve."
            words = mocked_response.split(" ")
            
            for word in words:
                if await request.is_disconnected():
                    break
                yield {"data": json.dumps({"type": "message", "payload": word + " "})}
                await asyncio.sleep(0.1) 

            # 4. Save Final Message
            async with db.tenant_connection(req.company_id) as conn:
                await conn.execute(
                    """
                    INSERT INTO app_chat.chat_messages (session_id, role, content) 
                    VALUES ($1, 'assistant', $2)
                    """, 
                    req.session_id, mocked_response
                )

        except Exception as e:
            print(f"[Stream Error] {e}")
            yield {"data": json.dumps({"type": "error", "payload": "The AI Engine encountered a fatal error."})}

    return EventSourceResponse(event_generator())