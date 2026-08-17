# app/api/routes/chat.py
import json
from fastapi import APIRouter, Request
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse
from app.database import db
from app.pipeline.executor import CognitiveLoopExecutor

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
        # 1. Save User Message to PostgreSQL
        async with db.tenant_connection(req.company_id) as conn:
            await conn.execute(
                """
                INSERT INTO app_chat.chat_messages (session_id, role, content) 
                VALUES ($1, 'user', $2)
                """, 
                req.session_id, req.message
            )

        # 2. Instantiate and run the Cognitive Loop
        executor = CognitiveLoopExecutor(
            session_id=req.session_id, 
            company_id=req.company_id, 
            user_id=req.user_id
        )
        
        final_response_buffer = ""

        # 3. Stream the executor's output directly to React
        async for event in executor.execute(req.message):
            if await request.is_disconnected():
                break
                
            # If it's a message token, save it to our buffer for the database
            if event["type"] == "message":
                final_response_buffer += event["payload"]
                
            yield {"data": json.dumps(event)}

        # 4. Save Final AI Message to PostgreSQL
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