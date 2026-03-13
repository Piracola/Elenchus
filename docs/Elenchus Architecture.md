# Elenchus Architecture & AI Context Guide

> **Note to AI / Developers:** This is the highly compressed single source of truth for the Elenchus project architecture. Read this file to understand the system layout, data flow, and module responsibilities before making any broad changes.

## 1. Core Architecture Overview
Elenchus is a high-performance, extensible multi-agent LLM debate framework.
* **Backend:** Python 3.11+, FastAPI (REST + WebSockets), LangGraph (State Machine), SQLAlchemy + SQLite.
* **Frontend:** React 18, Vite, Tailwind CSS v4, Zustand (State Management), Framer Motion.
* **AI Routing:** A custom internal **`LLMRouter`** layer (located in `backend/app/agents/llm_router.py`) directing traffic down to LangChain provider clients (OpenAI, Anthropic, Gemini). *(Note: LiteLLM has been completely removed).*

---

## 2. Module Directory & Usage Guide

### Backend (`backend/app/`)
* **`agents/`**: The core AI logic and state machine.
  * **`graph.py`**: Defines the LangGraph state machine (`manage_context` -> `speaker` -> `tool_executor` -> `judge`). Modify this to change the debate flow.
  * **`runner.py`**: Compiles the graph and streams state updates (`stream_mode="updates"`) over WebSocket. Manages database state persistence. **Rule:** If you add a node to `graph.py`, map its frontend status in the `_NODE_STATUS` dict here!
  * **`debater.py`** & **`judge.py`**: Agent nodes. `debater` uses LangChain's `bind_tools` to dynamically call internal skills.
  * **`context_manager.py`**: Compresses >10 turn old messages into "Memos" stored in `shared_knowledge` to prevent context length bloat and hallucination.
  * **`prompt_loader.py`**: Injects custom personas (`name` & `custom_prompt` via frontend Modal) and loads prompts from `backend/prompts/`.
* **`api/`**: 
  * **`websocket.py`**: Manages real-time WS broadcasting to the React frontend.
  * **`sessions.py`**: REST endpoints for creating/fetching historical debates.
* **`db/` & **`models/`**: 
  * **`database.py`** & **`models.py`**: SQLAlchemy setup (e.g., `SessionRecord` which stores complete `state_snapshot` JSONs to support resumable debates).
  * **`schemas.py`**: Pydantic models for API validation.
* **`skills/`**: The Tool library.
  * **`search.py`**: SearXNG/Tavily fact-checking tool wrapped with LangChain `@tool`. Agents voluntarily call this. Add new internal skills here.

### Frontend (`frontend/src/`)
* **`stores/debateStore.ts`**: The single source of truth for UI state. Connects to backend WS and reduces graph updates into React variables.
* **`components/chat/`**: 
  * **`MessageRow.tsx`**: Renders debater (pro/con) and judge messages in a strict 6:4 responsive layout using `react-markdown`.
  * **`DebateControls.tsx`** & **`StatusBanner.tsx`**: UI for interactive mode, tracking current LangGraph active nodes.
* **`components/sidebar/`**: 
  * **`ModelConfigManager.tsx`**: A persistent modal manager that syncs custom API keys and BaseURLs to the local DB.

---

## 3. Core Data Flow & Graph State
The entire system revolves around `DebateGraphState` (defined in `graph.py`):
```python
class DebateGraphState(TypedDict):
    topic: str
    participants: list[str]
    current_turn: int
    max_turns: int
    current_speaker_index: int     # Manages identical side turns (e.g., Proposer 1 -> Proposer 2)
    dialogue_history: Annotated[list[dict], operator.add] 
    shared_knowledge: list[dict]   # Compressed memos and verified Search facts
    messages: Annotated[list[AnyMessage], add_messages] # Tool calling memory loop
    current_scores: dict
    cumulative_scores: dict
```
* **Key Concept (Contextual Compression):** To prevent LLMs from hallucinating over long linear histories, older messages are swapped out and stored as concise truth statements in `shared_knowledge`. 

---

## 4. How to Extend the System
1. **Adding a New Skill/Tool**: 
   * Create a new Python file in `backend/app/agents/skills/`.
   * Use the LangChain `@tool` decorator.
   * Expose it in `skills/__init__.py`. `debater.py` will automatically parse and bind it to the LLM.
2. **Adding a New LLM Provider**:
   * Update `schemas.py` (`ProviderType` enum).
   * Update `db/models.py`.
   * Add the specific client initialization logic in `backend/app/agents/llm_router.py`.

---

## 5. Future Engineering Roadmap
* **Vector Memory (RAG):** Introduce ChromaDB/Qdrant to embed `shared_knowledge` into vectors, allowing agents to accurately retrieve and refute claims from round 1 during round N.
* **Human-in-the-Loop:** Use LangGraph's `interrupt_before` to pause execution, allowing real human judges to manually dock points or inject overriding logic via the UI.
* **Async Event Bus:** Decouple the WebSocket layer from LangGraph's heavy computation using Redis Pub/Sub + Celery workers to support high concurrency SaaS access.

---

## 6. Technical Design Principles
* **Storage Philosophy:** Use human-readable JSON files (e.g., `providers.json`, `config.json`) for simple, flat configurations like LLM provider credentials or system rules. Reserve the SQLite/PostgreSQL Database strictly for complex, relational, or high-volume data like debate session histories, node state snapshots, and agent dialogue tracking.
