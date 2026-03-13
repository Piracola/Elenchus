# Elenchus Architecture & Developer Guide

> **Note to AI / Developers:** This is the single source of truth for the Elenchus project architecture. Read this file before making broad changes.

---

## 1. Core Architecture Overview

Elenchus is a multi-agent LLM debate framework with real-time streaming.

- **Backend:** Python 3.11+, FastAPI (REST + WebSockets), LangGraph (state machine), SQLAlchemy async + SQLite
- **Frontend:** React 18, Vite, Zustand (state), Framer Motion
- **AI Routing:** Custom `LLMRouter` in `backend/app/agents/llm_router.py` → LangChain provider clients (OpenAI, Anthropic, Gemini). LiteLLM has been removed.

---

## 2. Module Directory

### Backend (`backend/app/`)

#### `agents/`
- **`graph.py`** — LangGraph state machine. Defines `DebateGraphState` and all graph nodes. Flow per turn: `manage_context → set_speaker → speaker ↔ tool_executor → judge → advance_turn`.
- **`runner.py`** — Compiles and runs the graph via `stream_mode="values"` (full merged state per step). Uses `_infer_node()` heuristic to detect which node just ran. Maps nodes to frontend status via `_NODE_STATUS`. Persists state to DB after each step.
- **`debater.py`** — Speaker node. Uses `bind_tools` for dynamic tool calling. Imports role display names from `app/constants.py`.
- **`judge.py`** — Scores each participant per turn. Appends judge entries directly to `dialogue_history`.
- **`context_manager.py`** — `compress_context()` converts old dialogue entries into concise "Memo" items stored in `shared_knowledge`. Returns the full updated knowledge list; callers must compute the delta before returning to the graph.
- **`llm.py`** — `create_llm()` factory. Reads `temperature` and `max_tokens` from the per-agent override dict (no hardcoded defaults).
- **`prompt_loader.py`** — Loads prompts from `backend/prompts/`. Supports custom persona injection via `custom_name` / `custom_prompt` fields in agent config.
- **`constants.py`** — Shared `ROLE_NAMES` and `ROLE_LABELS` dicts. Import from here instead of redefining per-file.

#### `agents/skills/`
Tool library. Each file wraps a capability with LangChain's `@tool` decorator. Both `searxng_tool.py` and `tavily_tool.py` delegate to `SearchProviderFactory` (singleton) — no per-call HTTP client creation.

- **`searxng_tool.py`** — Primary search tool via SearXNG.
- **`tavily_tool.py`** — Fallback search tool via Tavily.
- **`__init__.py`** — `get_all_skills()` returns all registered tools. `debater.py` binds these automatically.

#### `api/`
- **`websocket.py`** — WebSocket endpoint `/api/ws/{session_id}`. Validates session_id format (`^[0-9a-f]{12}$`) before accepting. Handles `start` / `stop` / `ping` actions. Cleans up finished tasks via `add_done_callback`. `WebSocketDisconnect` is always re-raised from inner try/except blocks to prevent infinite error loops.
- **`sessions.py`** — REST CRUD for sessions. `GET /api/sessions` supports `offset` / `limit` pagination params.
- **`models.py`** — REST CRUD for provider configurations.

#### `services/`
- **`session_service.py`** — Async DB operations. Imports `_gen_id` / `_utcnow` from `db/models.py` (no local redefinition). `create_session` resolves API keys server-side from the provider store using `provider_id` — never trusts a raw `api_key` from the frontend. Supports `list_sessions(offset, limit)` and `count_sessions()`.
- **`provider_service.py`** — JSON file store (`data/providers.json`) protected by `threading.RLock` for concurrent access safety. API keys are **Fernet-encrypted at rest** via `crypto.py`; `list_configs_raw()` decrypts and returns plaintext keys for internal use; `list_configs()` returns masked `ModelConfigResponse` objects for the API.
- **`crypto.py`** — Fernet symmetric encryption helpers (`encrypt_key`, `decrypt_key`, `is_encrypted`). Master key is read from `PROVIDERS_ENCRYPTION_KEY` env var. Auto-generated and written to `.env` on first startup by the launch scripts.

#### `models/`
- **`schemas.py`** — Pydantic API schemas. `ModelConfigResponse.api_key` is masked via `field_validator` (shows only last 4 chars, e.g. `sk-...xxxx`).
- **`state.py`** — `DialogueEntry` Pydantic model only. `GraphState` and duplicate `SearchResult` have been removed.
- **`scoring.py`** — `TurnScore` / `DimensionScore` models.

#### `db/`
- **`models.py`** — `SessionRecord` ORM model. `participants: Mapped[list]`. Exports `_gen_id()` and `_utcnow()` for use by services.
- **`database.py`** — Async engine setup, `Base`, session factory.

#### `config.py`
- Reads `config.yaml` (debate/search settings) and `.env` (secrets).
- `EnvSettings.cors_origins` — comma-separated CORS origins, configurable via `CORS_ORIGINS` env var.
- `RetryConfig` has been removed (was unused).
- The `agents:` block in `config.yaml` has been removed — per-agent model settings are configured at runtime via the UI and stored in the session DB.
- LiteLLM has been fully removed. LLM routing is handled by the custom `LLMRouter` → LangChain provider clients. LLM API keys are **not** read from `.env`; they are stored encrypted in `data/providers.json` and managed via the UI.

#### `search/`
- **`factory.py`** — `SearchProviderFactory` singleton. Manages SearXNG (primary) and Tavily (fallback) provider instances with automatic failover. Call `SearchProviderFactory.search(query)` from tools.
- **`searxng.py`** / **`tavily.py`** — Provider implementations with persistent `httpx.AsyncClient`.

#### `tests/`
- **`conftest.py`** — In-memory SQLite fixture (`db_session`) for isolated test runs.
- **`test_session_service.py`** — CRUD smoke tests including pagination.
- **`test_graph.py`** — Graph compilation test + reducer behaviour verification.

Run with: `pytest backend/tests/ -v`

---

### Frontend (`frontend/src/`)

#### `stores/`
- **`debateStore.ts`** — Zustand store. Single source of truth for all UI state. All mutations go through store actions — never mutate state directly (e.g. no `.push()` on arrays).

#### `hooks/`
- **`useDebateWebSocket.ts`** — Manages WS lifecycle (connect, reconnect with exponential backoff, cleanup). Dispatches all server events to the Zustand store via immutable actions.

#### `components/shared/`
- **`AgentConfigPanel.tsx`** — Shared component + `useAgentConfigs()` hook for per-agent model selection. Used by both `HomeView` and `DebateControls` to eliminate duplication. `buildAgentConfigs()` returns the agent config payload for session creation.

#### `components/chat/`
- **`DebateControls.tsx`** — Thin wrapper. Renders `ActiveSessionControls` (start/stop + connection status) when a session is active, or `SessionCreator` (topic input + agent config) otherwise.
- **`MessageRow.tsx`** — Renders debater and judge messages in a 6:4 layout.
- **`StatusBanner.tsx`** — Tracks current LangGraph node status.

#### `components/sidebar/`
- **`SessionList.tsx`** — Session history list with search, pagination ("load more"), and delete. Calls `api.sessions.list(offset, limit)`.
- **`ModelConfigManager.tsx`** — Modal for managing provider configurations (API key, base URL, models).

#### `components/`
- **`HomeView.tsx`** — Landing page with topic input. Uses `useAgentConfigs()` hook.
- **`ChatPanel.tsx`** — Main chat view. Uses `useMemo` + `groupDialogue()` for efficient row grouping.
- **`ScorePanel.tsx`** — Radar chart (ECharts) + score dimensions. Uses `useMemo` for chart config and `SCORE_DIMENSIONS` from `types/index.ts`.

#### `utils/`
- **`groupDialogue.ts`** — Pure `groupDialogue(entries)` function. Groups dialogue entries into `DialogueRow[]` (agent + paired judge entry).

#### `api/`
- **`client.ts`** — Typed fetch wrappers. `api.sessions.list(offset, limit)` supports pagination. Frontend sends `provider_id` (not `api_key`) when creating sessions. Error responses parse the FastAPI `detail` field and surface it directly to the user.

#### `types/index.ts`
- `SCORE_DIMENSIONS` includes `max: 10` field, used by both `ScorePanel` and the radar chart indicator config.

---

## 3. Core Data Flow & Graph State

`DebateGraphState` (TypedDict in `graph.py`):

```python
class DebateGraphState(TypedDict, total=False):
    session_id: str
    topic: str
    participants: list[str]
    current_turn: int
    max_turns: int
    current_speaker: str
    current_speaker_index: int

    dialogue_history: Annotated[list[dict], add]   # append-only reducer
    shared_knowledge: Annotated[list[dict], add]   # append-only reducer
    messages: Annotated[list[BaseMessage], add_messages]  # tool call scratchpad

    current_scores: dict
    cumulative_scores: dict
    status: str
    error: str | None
    agent_configs: dict[str, dict]
```

**Critical reducer rule:** Both `dialogue_history` and `shared_knowledge` use the `add` reducer (append-only). Nodes must return **only the delta** (new items), never the full list. Returning the full list causes double-counting.

**Runner streaming:** Uses `stream_mode="values"` — each event is the complete merged state after a node runs. The `_infer_node()` function compares consecutive snapshots to determine which node just executed.

**Context compression:** `node_manage_context` calls `compress_context()` which returns the full updated knowledge list. The node computes `delta = new_knowledge[len(old_knowledge):]` and returns only that delta to the graph.

**Security — API key flow:**
1. Frontend stores `provider_id` (not the raw key) in agent configs
2. `session_service.create_session()` calls `provider_service.list_configs_raw()` to resolve and decrypt the real key server-side
3. `ModelConfigResponse` always masks the key in API responses
4. Keys are stored Fernet-encrypted in `data/providers.json`; the master key lives only in `PROVIDERS_ENCRYPTION_KEY` (`.env`, never committed)

---

## 4. How to Extend the System

### Adding a New Skill/Tool
1. Create a file in `backend/app/agents/skills/`
2. Use the `@tool` decorator with a Pydantic `args_schema`
3. Use `SearchProviderFactory.search()` for any HTTP search needs (don't create new `httpx.AsyncClient` instances)
4. Register it in `skills/__init__.py` — `debater.py` binds all skills automatically

### Adding a New LLM Provider
1. Create a client class in `backend/app/agents/providers/`
2. Register it in `llm_router.py`'s `_registry`
3. Add the provider type string to the frontend's protocol selector in `ModelConfigManager`

### Adding a New Graph Node
1. Define the async node function in `graph.py`
2. Add it to `build_debate_graph()` with edges
3. Add a `_NODE_STATUS` entry in `runner.py`
4. Update `_infer_node()` if the node has a distinctive state change signature

---

## 5. Configuration Reference

| Source | Key | Default | Purpose |
|--------|-----|---------|---------|
| `.env` | `PROVIDERS_ENCRYPTION_KEY` | _(auto-generated)_ | Fernet master key for encrypting provider API keys |
| `.env` | `CORS_ORIGINS` | `http://localhost:5173,...` | Comma-separated allowed origins |
| `.env` | `DATABASE_URL` | `sqlite+aiosqlite:///./elenchus.db` | DB connection string |
| `.env` | `SEARXNG_BASE_URL` | `http://localhost:8080` | SearXNG instance URL |
| `.env` | `TAVILY_API_KEY` | _(empty)_ | Enables Tavily fallback search |
| `config.yaml` | `debate.default_max_turns` | `5` | Default turns per debate |
| `config.yaml` | `debate.context_window.recent_turns_to_keep` | `3` | Turns kept verbatim before compression |
| `config.yaml` | `debate.context_window.enable_summary_compression` | `true` | Toggle memo compression |
| `config.yaml` | `search.provider` | `searxng` | Primary search provider |

LLM provider API keys are **not** environment variables — they are managed via the UI and stored encrypted in `backend/data/providers.json`.

---

## 6. Future Engineering Roadmap

- **Vector Memory (RAG):** Embed `shared_knowledge` into ChromaDB/Qdrant for accurate cross-turn claim retrieval
- **Human-in-the-Loop:** Use LangGraph's `interrupt_before` to pause for human judge input
- **Async Event Bus:** Decouple WebSocket from LangGraph computation via Redis Pub/Sub + Celery for SaaS-scale concurrency
- **Multi-debater support:** Extend `participants` beyond 2 roles; `current_speaker_index` already supports N speakers
