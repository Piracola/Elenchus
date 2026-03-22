# CLAUDE.md

> **AI/Developer Guide:** This is the authoritative reference for understanding the Elenchus project architecture. Read this file before making broad changes.

---

## 1. Project Overview

Elenchus is a multi-agent LLM debate framework with real-time streaming. A session has a topic and 2–N debaters (proposer, opposer, etc.) plus a judge, each optionally using a different LLM provider/model.

**Core Capabilities:**
- Real-time debate streaming via WebSocket
- Per-agent model configuration (different LLM per debater/judge)
- Dynamic tool calling with search integration
- Context compression for long debates
- Audience intervention support

---

## 2. Commands Reference

### Backend
```bash
cd backend
pip install -r requirements.txt
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
pytest                          # run all tests
pytest tests/test_graph.py      # run a single test file
```

### Frontend
```bash
cd frontend
npm install
npm run dev       # Vite dev server on :5173 (proxies /api to :8000)
npm run build     # tsc -b && vite build
npm run lint      # ESLint
```

### One-shot Startup
```bash
./start.sh                  # macOS/Linux
./start.ps1                 # Windows PowerShell
start.bat                   # Windows CMD
# Flags: --skip-install, --backend-only, --frontend-only
```

---

## 3. Technology Stack

| Layer | Technology |
|-------|------------|
| Backend | Python 3.11+, FastAPI (REST + WebSockets), LangGraph (state machine), SQLAlchemy async + SQLite |
| Frontend | React 19, Vite 7, TypeScript 5.9, Zustand (state), Framer Motion, Tailwind CSS v4 |
| AI Routing | Custom `LLMRouter` → LangChain provider clients (OpenAI, Anthropic, Gemini) |
| Auth | JWT (python-jose) + bcrypt password hashing. Optional auth mode via `AUTH_ENABLED` env var. |
| Encryption | Fernet (cryptography) for API key encryption at rest |
| DI | FastAPI `Depends` + `lru_cache` singleton pattern in `dependencies.py` |
| Search | DuckDuckGo (default), SearXNG (optional), Tavily (optional) via `SearchProviderFactory` |

**Note:** LiteLLM has been fully removed. LLM routing is handled by the custom `LLMRouter` in `backend/app/agents/llm_router.py`.

---

## 4. Backend Module Directory (`backend/app/`)

### `agents/` — Core Debate Logic

| File | Purpose |
|------|---------|
| `graph.py` | LangGraph state machine. Defines `DebateGraphState` (includes `last_executed_node` for explicit tracking) and all graph nodes. Each node returns its name in `last_executed_node`. |
| `runner.py` | Compiles and runs the graph via `stream_mode="values"`. Uses `state.get("last_executed_node")` for explicit node tracking. Persists state to DB after each step. |
| `debater.py` | Speaker node. Uses `bind_tools` for dynamic tool calling. Imports role display names from `app/constants.py`. |
| `judge.py` | Scores each participant per turn. Appends judge entries directly to `dialogue_history`. |
| `context_manager.py` | `compress_context()` converts old dialogue entries into concise "Memo" items stored in `shared_knowledge`. |
| `llm.py` | Async `create_llm()` factory. Reads `temperature` and `max_tokens` from the per-agent override dict. Uses DI for provider service. |
| `llm_router.py` | `LLMRouter` maps provider types to `BaseProviderClient` implementations. Currently supports: `openai`, `anthropic`, `gemini`. |
| `prompt_loader.py` | Loads prompts from `backend/prompts/`. Supports custom persona injection. |
| `events.py` | Event emitter interface (`EventBroadcaster` protocol) for decoupling agents layer from API layer. |

### `agents/providers/` — LLM Provider Clients

| File | Purpose |
|------|---------|
| `base.py` | `BaseProviderClient` abstract base class. |
| `clients.py` | Concrete implementations: `OpenAIProviderClient`, `AnthropicProviderClient`, `GeminiProviderClient`. OpenAI client handles any OpenAI-compatible endpoint (DeepSeek, Ollama, etc.). |

### `agents/skills/` — Tool Library

Each file wraps a capability with LangChain's `@tool` decorator. Both tools delegate to `SearchProviderFactory` (singleton).

| File | Purpose |
|------|---------|
| `search_tool.py` | Unified web search tool using SearchProviderFactory with automatic provider fallback. |
| `__init__.py` | `get_all_skills()` returns all registered tools. `debater.py` binds these automatically. |

### `api/` — REST & WebSocket Endpoints

| File | Purpose |
|------|---------|
| `websocket.py` | WebSocket endpoint `/api/ws/{session_id}`. Handles `start` / `stop` / `ping` / `intervene` actions. Supports JWT auth via `?token=` query param. Uses `WebSocketUser` dependency for authentication. |
| `sessions.py` | REST CRUD for sessions. `GET /api/sessions` supports `offset` / `limit` pagination. Supports user isolation when auth enabled via `OptionalUser` dependency. |
| `models.py` | REST CRUD for provider configurations. |
| `users.py` | User auth endpoints: `POST /api/users/register`, `POST /api/users/login`, `GET /api/users/me`, `GET /api/users/auth/status`. |
| `log.py` | REST endpoints for dynamic log level adjustment (`/api/log/level`). |
| `search.py` | REST endpoints for search provider configuration (`/api/search/config`, `/api/search/providers`, `/api/search/health`). |

### `services/` — Business Logic

| File | Purpose |
|------|---------|
| `session_service.py` | Async DB operations. Resolves API keys server-side from provider store using `provider_id`. Supports `owner_id` for user isolation when auth enabled. Uses DI for provider service. |
| `provider_service.py` | Database-backed provider store (migrated from JSON file). API keys are **Fernet-encrypted at rest**. Uses SQLAlchemy async sessions. Auto-prepares a local encryption key for local runtime startup; production should set `ELENCHUS_ENCRYPTION_KEY` explicitly. |
| `intervention_manager.py` | Thread-safe manager for pending user interventions. Uses per-session `asyncio.Lock` via `_get_session_lock()` method. |
| `export_service.py` | Converts session data to Markdown or JSON for download. |
| `log_service.py` | Centralized logging configuration with dynamic level adjustment and file-based logging. |

### `models/` — Data Models

| File | Purpose |
|------|---------|
| `schemas.py` | Pydantic API schemas. `ModelConfigResponse` exposes `api_key_configured` instead of returning plaintext provider secrets. Includes user auth schemas: `UserRegister`, `UserLogin`, `UserResponse`, `TokenResponse`. |
| `state.py` | `DialogueEntry` Pydantic model. `DialogueEntryDict` and `SharedKnowledgeEntry` TypedDicts. |
| `scoring.py` | `TurnScore` / `DimensionScore` models. |

### `auth/` — Authentication

| File | Purpose |
|------|---------|
| `__init__.py` | Module entry point. Exports `create_access_token`, `decode_access_token`, `hash_password`, `verify_password`, `get_current_user`, `get_current_user_optional`. |
| `jwt.py` | JWT token generation and validation using `python-jose`. Token expiry configurable via `JWT_EXPIRE_MINUTES`. |
| `password.py` | Password hashing and verification using bcrypt via `passlib`. |
| `dependencies.py` | FastAPI dependencies: `get_current_user` (raises 401), `get_current_user_optional` (returns None if unauthenticated), `get_current_user_ws` (for WebSocket). Type aliases: `CurrentUser`, `OptionalUser`, `WebSocketUser`. |

### `dependencies.py` — Dependency Injection

| Function | Purpose |
|----------|---------|
| `get_provider_service()` | Returns cached `ProviderService` singleton via `@lru_cache`. |
| `get_llm_router()` | Returns cached `LLMRouter` singleton. |
| `get_search_factory()` | Returns cached `SearchProviderFactory` singleton. |
| `get_intervention_manager()` | Returns cached `InterventionManager` singleton. |
| `clear_dependency_cache()` | Clears all caches — use in tests for isolation. |

### `db/` — Database Layer

| File | Purpose |
|------|---------|
| `models.py` | ORM models: `SessionRecord` (with `owner_id` for user isolation), `ProviderRecord` (encrypted API keys), `UserRecord` (auth). Exports `_gen_id()` and `_utcnow()` for use by services. |
| `database.py` | Async engine setup, `Base`, session factory. |

### `search/` — Search Providers

| File | Purpose |
|------|---------|
| `factory.py` | `SearchProviderFactory` singleton. Manages DuckDuckGo (default), SearXNG (optional), and Tavily (optional) with automatic failover. |
| `base.py` | Abstract base class `SearchProvider` and `SearchResult` model. |
| `duckduckgo.py` | DuckDuckGo provider implementation (default, no API key required). |
| `searxng.py` | SearXNG provider implementation with persistent `httpx.AsyncClient`. |
| `tavily.py` | Tavily provider implementation. |

### `config.py`

Reads `config.yaml` (debate/search settings) and `.env` (secrets). LLM provider API keys are **not** read from `.env`; they are managed via the UI, stored encrypted in the providers database table, and only resolved server-side.

### `constants.py`

Shared `ROLE_NAMES` and `ROLE_LABELS` dicts. Import from here instead of redefining per-file.

### `tests/`

| File | Purpose |
|------|---------|
| `conftest.py` | In-memory SQLite fixture for isolated test runs. |
| `test_session_service.py` | CRUD smoke tests including pagination. |
| `test_graph.py` | Graph compilation test + reducer behaviour verification. |
| `verify_fixes.py` | Verification tests for bug fixes (judge scoring, structured output). |
| `manual_test_debate.py` | Manual test script for debate runner. |
| `manual_test_double.py` | Manual test script for double debate runner. |
| `manual_test_search.py` | Manual test script for search providers. |

---

## 5. Frontend Module Directory (`frontend/src/`)

### `stores/` — State Management

| File | Purpose |
|------|---------|
| `debateStore.ts` | Zustand store. Single source of truth for all UI state. All mutations go through store actions. |
| `themeStore.ts` | Theme state (light/dark mode). |
| `settingsStore.ts` | Application settings. |

### `hooks/` — Custom Hooks

| File | Purpose |
|------|---------|
| `useDebateWebSocket.ts` | Manages WS lifecycle (connect, reconnect with exponential backoff, cleanup). Dispatches all server events to the Zustand store. |
| `useAgentConfigs.ts` | Hook for per-agent model selection. Used by `HomeView` and `DebateControls`. |
| `useModelConfigManager.ts` | Hook for managing provider configurations. |
| `useSessionCreate.ts` | Hook for session creation logic. |
| `useToastState.ts` | Hook for global toast notification state. |

### `components/shared/`

| File | Purpose |
|------|---------|
| `AgentConfigPanel.tsx` | Shared component for per-agent model selection. `buildAgentConfigs()` returns the agent config payload. |
| `BackendHealthCheck.tsx` | Health check wrapper that displays loading/error state until backend is ready. |
| `CustomSelect.tsx` | Reusable select component. |
| `ErrorBoundary.tsx` | Error boundary wrapper. |
| `ToastContainer.tsx` | Global toast notification container. |

### `components/chat/`

| File | Purpose |
|------|---------|
| `DebateControls.tsx` | Wrapper. Renders `ActiveSessionControls` when session active, or `SessionCreator` otherwise. |
| `MessageRow.tsx` | Renders debater and judge messages in a 6:4 layout. |
| `StatusBanner.tsx` | Tracks current LangGraph node status. |

### `components/sidebar/`

| File | Purpose |
|------|---------|
| `SessionList.tsx` | Session history list with search, pagination, and delete. |
| `ModelConfigManager.tsx` | Modal for managing provider configurations (API key, base URL, models). |
| `ProviderForm.tsx` | Form for adding/editing provider configs. |
| `ProviderSidebar.tsx` | Provider list sidebar. |
| `SettingsPanel.tsx` | Settings panel. |

### `components/`

| File | Purpose |
|------|---------|
| `HomeView.tsx` | Landing page with topic input. Uses `useAgentConfigs()` hook. |
| `ChatPanel.tsx` | Main chat view. Uses `useMemo` + `groupDialogue()` for efficient row grouping. |
| `ScorePanel.tsx` | Radar chart (ECharts) + score dimensions. |

### `utils/`

| File | Purpose |
|------|---------|
| `groupDialogue.ts` | Pure `groupDialogue(entries)` function. Groups dialogue entries into `DialogueRow[]`. |

### `api/`

| File | Purpose |
|------|---------|
| `client.ts` | Typed fetch wrappers. `api.sessions.list(offset, limit)` supports pagination. Frontend sends `provider_id` (not `api_key`) when creating sessions. |

### `types/`

| File | Purpose |
|------|---------|
| `index.ts` | Type definitions. `SCORE_DIMENSIONS` includes `max: 10` field. |

---

## 6. Request Flow

1. `POST /api/sessions` — creates session with topic, participants, per-agent model configs
2. `WS /api/ws/{session_id}` — client connects, sends `{"action": "start"}`
3. Backend compiles and streams a LangGraph state machine; each node completion broadcasts typed WebSocket events
4. State is persisted to SQLite after every node

---

## 7. LangGraph Architecture

### Graph Flow (per turn)

```
manage_context → set_speaker → debater_speak ↔ tool_executor
                                    ↓
                              advance_turn (loop until all speak)
                                    ↓
                    (next turn or END)
```

### DebateGraphState

```python
class DebateGraphState(TypedDict, total=False):
    session_id: str
    topic: str
    participants: list[str]
    current_turn: int
    max_turns: int
    current_speaker: str
    current_speaker_index: int

    dialogue_history: Annotated[list[DialogueEntryDict], add]   # append-only reducer
    shared_knowledge: Annotated[list[SharedKnowledgeEntry], add]   # append-only reducer
    messages: Annotated[list[BaseMessage], add_messages]  # tool call scratchpad

    current_scores: dict
    cumulative_scores: dict
    status: Literal['in_progress', 'completed', 'error']
    error: str | None
    agent_configs: dict[str, dict]
    last_executed_node: str  # Explicit node tracking (replaces _infer_node heuristic)
```

### Critical Reducer Rules

| Field | Reducer | Rule |
|-------|---------|------|
| `dialogue_history` | `add` | Nodes must return **DELTA only** (new items), never the full list. |
| `shared_knowledge` | `add` | Same as above. Returning full list causes double-counting. |
| `messages` | `add_messages` | ID-based dedup. `advance_turn` clears via `RemoveMessage`. |

### Runner Streaming

Uses `stream_mode="values"` — each event is the complete merged state after a node runs. Node tracking is now **explicit**: each node returns its name in `last_executed_node`, and `runner.py` reads `state.get("last_executed_node")` to determine which node just executed. This replaces the previous `_infer_node()` heuristic.

### Context Compression

`node_manage_context` calls `compress_context()` which returns the full updated knowledge list. The node computes `delta = new_knowledge[len(old_knowledge):]` and returns only that delta.

### Audience Intervention

`node_manage_context` injects pending user interventions (queued via `InterventionManager`) as `audience` dialogue entries at the start of each turn.

---

## 8. WebSocket Protocol

### Server → Client Messages

```json
{ "type": "system",            "content": "..." }
{ "type": "status",            "content": "...", "phase": "..." }
{ "type": "speech_start",      "role": "proposer" }
{ "type": "speech_token",      "role": "proposer", "token": "..." }
{ "type": "speech_end",        "role": "proposer", "content": "full text" }
{ "type": "fact_check_start",  "claims": [...] }
{ "type": "fact_check_result", "results": [...] }
{ "type": "judge_start" }
{ "type": "judge_score",       "role": "proposer", "scores": {...} }
{ "type": "turn_complete",     "turn": 3, "scores": {...} }
{ "type": "debate_complete",   "final_scores": {...} }
{ "type": "audience_message",  "content": "...", "timestamp": "..." }
{ "type": "error",             "content": "..." }
{ "type": "pong" }
```

### Client → Server Messages

```json
{ "action": "start" }              // Begin the debate
{ "action": "ping" }               // Keep-alive
{ "action": "stop" }               // Abort the debate
{ "action": "intervene", "content": "..." }  // Queue audience intervention
```

---

## 9. Security — API Key & Auth Flow

### API Key Flow

1. Frontend stores `provider_id` (not the raw key) in agent configs
2. `session_service.create_session()` uses DI to get `provider_service` and resolves the real key server-side
3. `ModelConfigResponse` never returns plaintext provider keys; it only reports `api_key_configured`
4. Keys are stored Fernet-encrypted in the `providers` database table
5. Local runtime startup auto-prepares `ELENCHUS_ENCRYPTION_KEY`; production should set it explicitly

### Authentication Flow (Optional)

1. Set `AUTH_ENABLED=true` to enable JWT authentication
2. User registers via `POST /api/users/register` (email + password)
3. Password is hashed with bcrypt before storage
4. Login via `POST /api/users/login` returns JWT token
5. Include token in `Authorization: Bearer <token>` header for protected endpoints
6. WebSocket auth: pass token as query param `?token=<jwt>`
7. Sessions are isolated by `owner_id` when auth is enabled

### Key Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `ELENCHUS_ENCRYPTION_KEY` | Local runtime auto-generates if missing | Fernet key for API key encryption; set explicitly in production |
| `AUTH_ENABLED` | No (default: false) | Enable JWT authentication |
| `JWT_SECRET_KEY` | If auth enabled | JWT signing key |
| `JWT_EXPIRE_MINUTES` | No (default: 10080) | Token expiry (7 days) |

---

## 10. Configuration Reference

### Backend Configuration

| Source | Key | Default | Purpose |
|--------|-----|---------|---------|
| `.env` | `ELENCHUS_ENCRYPTION_KEY` | Local runtime auto-generates if missing | Fernet master key for encrypting provider API keys; set explicitly in production |
| `.env` | `AUTH_ENABLED` | `false` | Enable JWT authentication |
| `.env` | `JWT_SECRET_KEY` | `change-me-in-production` | JWT signing key (change when auth enabled) |
| `.env` | `JWT_EXPIRE_MINUTES` | `10080` | JWT token expiry (7 days) |
| `.env` | `CORS_ORIGINS` | `http://localhost:5173,...` | Comma-separated allowed origins |
| `.env` | `DATABASE_URL` | `sqlite+aiosqlite:///./elenchus.db` | DB connection string |
| `.env` | `SEARXNG_BASE_URL` | `http://localhost:8080` | SearXNG instance URL |
| `.env` | `TAVILY_API_KEY` | _(empty)_ | Enables Tavily search provider |
| `config.yaml` | `debate.default_max_turns` | `5` | Default turns per debate |
| `config.yaml` | `debate.context_window.recent_turns_to_keep` | `3` | Turns kept verbatim before compression |
| `config.yaml` | `debate.context_window.enable_summary_compression` | `true` | Toggle memo compression |
| `config.yaml` | `search.provider` | `duckduckgo` | Primary search provider |

### Frontend Configuration

| Source | Key | Default | Purpose |
|--------|-----|---------|---------|
| `.env` | `VITE_BACKEND_PORT` | `8001` | Backend server port for Vite proxy |
| `.env` | `VITE_API_URL` | `/api` | Backend API base URL |
| `.env` | `VITE_WS_URL` | _(auto)_ | WebSocket base URL |

**Important:** LLM provider API keys are **not** environment variables — they are managed via the UI and stored encrypted in the `providers` database table.

---

## 11. Key Constraints

| Constraint | Details |
|------------|---------|
| Session ID format | Must match `^[0-9a-f]{12}$` |
| CORS origins | Default to `localhost:5173/5174`; override via `CORS_ORIGINS` env var |
| Provider store | Database-backed (migrated from JSON file). Uses SQLAlchemy async sessions. |
| Encryption key | Local runtime startup auto-prepares `ELENCHUS_ENCRYPTION_KEY`; invalid custom values still raise `ValueError`, and production should configure the key explicitly |
| Intervention manager | Uses per-session `asyncio.Lock` via `_get_session_lock()` method (fixed from `defaultdict` issue). |
| API key responses | Provider REST responses expose `api_key_configured` and never return plaintext secrets |
| Reducer delta rule | `dialogue_history` and `shared_knowledge` nodes must return delta only |
| Node tracking | Explicit via `last_executed_node` field (replaces `_infer_node()` heuristic) |
| Auth (optional) | When `AUTH_ENABLED=true`, sessions are isolated by `owner_id` |
| DI pattern | Use `app.dependencies` for service instances; `clear_dependency_cache()` in tests |

---

## 12. How to Extend

### Adding a New Skill/Tool
1. Create a file in `backend/app/agents/skills/`
2. Use the `@tool` decorator with a Pydantic `args_schema`
3. Use `SearchProviderFactory.search()` for any HTTP search needs (get instance via `get_search_factory()`)
4. Register it in `skills/__init__.py` — `debater.py` binds all skills automatically

### Adding a New LLM Provider
1. Create a client class in `backend/app/agents/providers/clients.py` extending `BaseProviderClient`
2. Register it in `llm_router.py`'s `_registry`
3. Add the provider type string to the frontend's protocol selector in `ModelConfigManager`

### Adding a New Graph Node
1. Define the async node function in `graph.py`
2. Add it to `build_debate_graph()` with edges
3. **Return `last_executed_node: "<node_name>"` in the node's return dict** — this is required for explicit node tracking
4. Add a `_NODE_STATUS` entry in `runner.py` for UI display

### Using Dependency Injection
```python
# In API endpoints
from fastapi import Depends
from app.dependencies import get_provider_service

@router.get("/models")
async def list_models(
    service: ProviderService = Depends(get_provider_service)
):
    return await service.list_configs()

# In tests
from app.dependencies import clear_dependency_cache

def test_setup():
    clear_dependency_cache()  # Reset singleton state between tests
```

---

## 13. Future Engineering Roadmap

### Completed (v1.1)

- ✅ **Provider DB Migration:** Migrated from JSON file to SQLAlchemy database with Fernet encryption
- ✅ **JWT Authentication:** Optional auth mode with user isolation and WebSocket support
- ✅ **Dependency Injection:** `dependencies.py` with `@lru_cache` singletons, test-friendly `clear_dependency_cache()`
- ✅ **Explicit Node Tracking:** Replaced `_infer_node()` heuristic with `last_executed_node` field
- ✅ **Security Fixes:** Required encryption key, fixed `InterventionManager` lock mechanism, proper type annotations

### Planned

- **Vector Memory (RAG):** Embed `shared_knowledge` into ChromaDB/Qdrant for accurate cross-turn claim retrieval
- **Human-in-the-Loop:** Use LangGraph's `interrupt_before` to pause for human judge input
- **Async Event Bus:** Decouple WebSocket from LangGraph computation via Redis Pub/Sub + Celery for SaaS-scale concurrency
- **Multi-debater support:** Extend `participants` beyond 2 roles; `current_speaker_index` already supports N speakers
- **PostgreSQL Migration:** Support higher concurrency with connection pooling
- **Monitoring:** Prometheus metrics + OpenTelemetry tracing
