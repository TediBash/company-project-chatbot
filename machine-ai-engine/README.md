
---

# Machine-AI-Engine (Python Multi-Agent Orchestrator)

This directory contains the Python-based AI engine for the AROL Industrial Platform. It is responsible for orchestrating multiple specialized AI agents, managing the Retrieval-Augmented Generation (RAG) pipeline, executing tool calls, and maintaining conversational memory.

## ⚙️ Environment Configuration

Before starting the AI engine, you must configure your local environment and database connections.

1. Create a new file named `.env` in the root of the `machine-ai-engine` folder.
2. Add the following content, adapting the `DATABASE_URL` credentials to match your local PostgreSQL setup:

```env
HOST="0.0.0.0"
PORT=8000
DATABASE_URL="postgresql://postgres:password@localhost:5432/MachineChatbot"

```

* **Database Sync:** Ensure that the database configuration inside `app/db/session.py` matches the credentials provided in this `.env` file.
* **CORS Issues:** If you encounter Cross-Origin Resource Sharing (CORS) blocks when connecting the frontend, verify and update the allowed origins within the `app/main.py` file.

## 🎛️ Pipeline Configuration (`pipeline_config.yaml`)

The behavior of the entire AI engine is governed by the `pipeline_config.yaml` file located in the project root. **You do not need to modify code to change the engine's behavior; it is all handled here.**

This file allows you to toggle and configure:

* **LLM Routing (`llm_routing`):** Assign specific models (e.g., Llama3, GPT-4, Gemini) to specific roles (Planner, Worker, Router, Critic).
* **Endpoints:** Define your API keys and custom URLs. For local execution, ensure `ollama_api_base` is set (e.g., `"http://localhost:11434"`).
* **Feature Toggles:** Enable or disable short/long-term memory, RAG reranking, guardrails, and the intent router.
* **Budget & Limits:** Set token limits, maximum tool iterations, and cost tracking per answer.

## 🏗️ Project Structure and Architecture

The engine is built on a highly modular architecture, allowing individual components (memory, RAG, agents, LLMs) to be tested, swapped, or disabled independently.

* **`data/` (Knowledge Base & Ingestion):**
Contains the raw machine manuals and the ChromaDB vector database.
* The embeddings are generated using the `ingest_pdf.py` and `ingest_txt.py` scripts.
* A separate seeding script (`seed_database`) is used to automatically load the "TelemetrySnapshots" Excel sheet directly into the PostgreSQL relational tables.


* **`app/api/routes/chat.py` (API Entry Point):**
Exposes the REST APIs used by the frontend.
* The primary function is `chat_stream`, which receives the user's query, initializes the session, and streams the AI's response back to the client.
* This file also contains the endpoints for managing Human-in-the-Loop (HITL) action approvals.


* **`app/pipeline/` (Core Orchestration):**
* **`app/pipeline/executor.py`:** Contains the `CognitiveLoopExecutor`. This is the central brain of the system. It initializes and coordinates the `MemoryPipelineManager`, `RAGPipelineProvider`, `IntentRouter`, the Universal LLM client, and the distinct agent pools (Technical, Commercial, Operational, General). Because these are injected as separate objects, they can be easily modified or toggled via the config.
* **`app/pipeline/memory.py`:** Implements the stateful conversational memory logic.
* **`app/pipeline/tracer.py`:** A diagnostic tracker that logs every single action, tool execution, and routing decision from the moment a query is received to the final response. This trace is saved as a JSON payload in the database to debug, monitor, and improve agent behavior.


* **`app/agents/` (Agent Logic & Specialization):**
* **`app/agents/router.py`:** Implements the Intent Router agent, which classifies user queries and delegates them to the correct downstream expert.
* **`app/agents/specialized.py`:** Contains the specific implementations for the Technical, Commercial, Operational, and General agents.
* Associated tools are stored in **`app/tools/`**, and system instructions/prompts are managed in **`app/prompts/templates/`**.


* **`app/rag/provider.py` (RAG Pipeline):**
Implements the vector search logic against ChromaDB and manages optional reranking to improve the relevance of retrieved manual excerpts.
* **`app/llm/factory.py` (LLM Registry):**
Contains the `LLMRegistry` class, which loads the configuration from `pipeline_config.yaml`. This factory pattern allows the system to dynamically instantiate different LLM providers (Local Ollama, OpenAI API, Gemini API) on a per-agent basis, providing maximum flexibility for rapid experimentation and model evaluation.