# app/main.py
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.database import db

# Import the chat router (we will create this file next)
from app.api.routes import chat

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup logic
    await db.connect()
    yield
    # Shutdown logic
    await db.disconnect()

# Initialize FastAPI with the lifespan manager
app = FastAPI(
    title="AROL AI Engine",
    description="Multi-Agent Local LLM Engine",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"], 
    allow_credentials=True,
    allow_methods=["POST"], 
    allow_headers=["*"],
)

# Register the endpoints
app.include_router(chat.router, prefix="/api/v1/chat", tags=["Chat"])

@app.get("/health")
async def health_check():
    return {"status": "online", "database": "connected" if db.pool else "disconnected"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host=settings.host, port=settings.port, reload=True)