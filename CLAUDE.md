# CLAUDE.md

> Short collaboration guide for humans and coding agents. Keep this file high-signal and aligned with the current code. Move long explanations to `docs/`.

## 1. Project In One Minute

Elenchus is a multi-agent debate application with REST + WebSocket runtime streaming.

- Frontend: React 19, Vite, TypeScript, Zustand
- Backend: FastAPI, LangGraph
- Main modes: `standard` and `sophistry_experiment`
- Runtime settings: `runtime/config.json`
- Session persistence: file-backed under `runtime/sessions/`

## 2. Fast Commands

### Full stack from repo root

```bash
npm run dev
```

### One-shot startup

```bash
./start.sh
./start.ps1
start.bat
```

### Backend

```bash
cd backend
python -m venv venv
# activate the virtualenv in your shell first
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --host 0.0.0.0 --port 8001
pytest
```

### Frontend

```bash
npm --prefix frontend install
npm --prefix frontend run dev
npm --prefix frontend run build
npm --prefix frontend run lint
npm --prefix frontend run test:run
```

## 3. Architecture Map

### Backend

- `backend/app/main.py`
  - App wiring, CORS, API routers, frontend static serving
- `backend/app/api/`
  - `sessions.py`: session CRUD, exports, documents, reference library, runtime event history
  - `websocket.py`: `/api/ws/{session_id}` control channel with `start`, `stop`, `ping`, `intervene`
  - `models.py`, `search.py`, `log.py`: runtime-editable config APIs
- `backend/app/runtime/`
  - `service.py`: long-running task manager per session
  - `orchestrator.py`: wraps execution with persistence and outbound events
  - `engines/langgraph.py`: chooses the active graph by debate mode
  - `bus.py`: sequences, persists, and broadcasts runtime events
  - `session_repository.py`: builds resumable state and persists checkpoints
- `backend/app/agents/`
  - `graph.py`: standard debate graph
  - `sophistry_graph.py`: sophistry experiment graph
  - `debater.py`, `judge.py`, `team_discussion.py`, `jury_discussion.py`, `consensus.py`
  - `context_manager.py`, `reference_preprocessor.py`, `skills/search_tool.py`
- `backend/app/services/`
  - `session_service.py`: file-backed session CRUD
  - `provider_service.py`: provider configs stored in `runtime/config.json`
  - `document_service.py`: uploaded session documents
  - `reference_library_service.py`: structured reference entries synced into shared knowledge
- `backend/app/storage/`
  - File-backed helpers for sessions, documents, reference entries, and runtime events

### Frontend

- `frontend/src/components/HomeView.tsx`
  - Session creation, mode selection, agent config entry
- `frontend/src/components/ChatPanel.tsx`
  - Main conversation surface and export actions
- `frontend/src/components/chat/RuntimeInspector.tsx`
  - Timeline, graph, memory, and replay-oriented inspection UI
- `frontend/src/components/sidebar/SettingsPanel.tsx`
  - Providers, display, logging, and search settings
- `frontend/src/hooks/useDebateWebSocket.ts`
  - WebSocket lifecycle, reconnect, ping, event intake
- `frontend/src/stores/debateStore.ts`
  - Single source of truth; runtime events reduce into UI state
- `frontend/src/api/client.ts`
  - Typed REST client
- `frontend/src/utils/`
  - Replay, transcript, runtime-event, and virtualization helpers

## 4. Runtime Flow

1. `POST /api/sessions` creates a new session record.
2. Frontend connects to `WS /api/ws/{session_id}`.
3. Client sends `{ "action": "start" }`.
4. `DebateRuntimeService -> DebateOrchestrator -> LangGraphDebateEngine`.
5. Backend emits ordered runtime events through `RuntimeBus`.
6. Events are persisted and broadcast to connected clients.
7. Frontend reduces those events into chat, scores, replay, timeline, and inspector state.

## 5. Persistence Model

- `runtime/config.json` is the single active runtime config source for:
  - server settings
  - providers
  - search
  - debate defaults
  - logging
- Sessions are file-backed, not database-backed:
  - `runtime/sessions/<session_id>/session.json`
  - `runtime/sessions/<session_id>/events.jsonl`
  - `runtime/sessions/<session_id>/rounds/round-*.json`
  - `runtime/sessions/<session_id>/documents/`
  - `runtime/sessions/<session_id>/reference_entries/`
- Provider configs are stored in `runtime/config.json` under `providers`.
- Session `agent_configs` should reference saved providers by `provider_id`; avoid depending on raw API keys inside session state.

## 6. Debate Modes

### `standard`

- Graph: `backend/app/agents/graph.py`
- Supports tool/search usage, judge scoring, optional team discussion, optional jury discussion, optional final consensus

### `sophistry_experiment`

- Graph: `backend/app/agents/sophistry_graph.py`
- Uses a separate prompt and observer/postmortem flow
- Geared toward rhetoric analysis instead of winner selection
- Team discussion, jury discussion, and reasoning extras are disabled at session creation time

## 7. Important Invariants

- `runtime/config.json` is authoritative. Do not reintroduce multiple active config sources.
- `last_executed_node` is the resume/status anchor. New graph nodes must set it explicitly.
- Append-only LangGraph reducers must return deltas, not full lists:
  - `dialogue_history`
  - `shared_knowledge`
- If you add or change runtime event types, update both backend and frontend:
  - backend emitters/orchestrator
  - frontend event normalization
  - `frontend/src/stores/debateStore.ts`
- If you change session or API payload shapes, update backend schemas and frontend types/client together.
- Session ids must remain 12 hex chars. The WebSocket route validates this format.
- Keep `sophistry_experiment` behaviorally separate from the standard debate flow.

## 8. Common Edit Paths

### New runtime or graph behavior

- `backend/app/agents/`
- `backend/app/runtime/orchestrator.py`
- `backend/app/runtime/event_emitter.py`
- `backend/app/runtime/session_repository.py`
- `frontend/src/stores/debateStore.ts`
- `frontend/src/components/chat/RuntimeInspector.tsx`

### New provider or search configuration behavior

- `backend/app/config.py`
- `backend/app/services/provider_service.py`
- `backend/app/api/search.py`
- `frontend/src/components/sidebar/SettingsPanel.tsx`
- `frontend/src/components/sidebar/SearchConfigTab.tsx`
- `frontend/src/hooks/useModelConfigManager.ts`

### New document or reference-library behavior

- `backend/app/services/document_service.py`
- `backend/app/services/reference_library_service.py`
- `backend/app/storage/session_documents.py`
- `backend/app/storage/reference_library.py`
- `backend/app/agents/reference_preprocessor.py`

## 9. Read These Before Going Deeper

- `README.md`
- `docs/getting-started.md`
- `docs/architecture.md`
- `docs/runtime.md`
- `docs/session-reference-library-implementation.md`
- `docs/sophistry-experiment-mode-design.md`
- `docs/guides/backend-development.md`
- `docs/guides/frontend-development.md`

If this file starts turning into a full project manual again, move detail into `docs/` and keep only the stable collaboration-critical facts here.
