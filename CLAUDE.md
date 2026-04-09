# CLAUDE.md

> Short collaboration guide for humans and coding agents. Keep this file high-signal and aligned with the current code. Move long explanations to `docs/`.

## 1. Project In One Minute

Elenchus is a multi-agent debate platform with REST + WebSocket runtime streaming, replay, and session reference pools.

- Frontend: React 19, Vite 7, TypeScript, Zustand 5, framer-motion
- Backend: FastAPI, LangGraph 0.2.60, SQLAlchemy 2.0, aiosqlite
- Main modes: `standard` (with judge/scoring/search) and `sophistry_experiment` (rhetoric/fallacy observation)
- Runtime settings: `runtime/config.json` (single authoritative source)
- Session persistence: file-backed under `runtime/sessions/` (not database-backed)
- Packaging: PyInstaller-based portable builds for Windows

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

### Build (PyInstaller portable release)

```bash
./build.ps1
```

### Git

- In this repository, run `git commit` outside the sandbox so local signing keys remain available.
- Prefer signed commits for repository changes.
- Do not fall back to `--no-gpg-sign` unless the user explicitly asks for an unsigned commit.

## 3. Architecture Map

### Backend

- `backend/app/main.py` — App wiring, CORS, API routers, frontend static serving
- `backend/app/api/` — REST + WebSocket endpoints
  - `sessions.py`: session CRUD, exports, sub-route aggregation
  - `session_documents.py`: document upload, list, detail, delete, reference pool
  - `session_runtime.py`: runtime event pagination, snapshot export
  - `websocket.py`: `/api/ws/{session_id}` control channel (start/stop/ping/intervene)
  - `models.py`, `search.py`, `log.py`: runtime-editable config APIs
- `backend/app/runtime/` — Orchestration & event bus
  - `orchestrator.py`: wraps execution with persistence and outbound events
  - `engines/langgraph.py`: chooses active graph by debate mode
  - `bus.py`: sequences, persists, broadcasts runtime events (primary entry: `RuntimeBus`)
  - `service.py`: long-running task manager per session
  - `event_emitter.py`: runtime event emission facade
  - `runtime_status.py`: node state descriptions, prediction, tool-call detection
  - `session_repository.py`: builds resumable state, persists checkpoints
  - `session_defaults.py`: default config factories (team/jury/reasoning/mode)
  - `session_dialogue_helpers.py`: dialogue history cleaning, round extraction
  - `session_snapshot_normalizer.py`: snapshot normalization, incomplete round rollback
- `backend/app/agents/` — LangGraph agents & graph definitions
  - `graph.py`: standard debate graph
  - `sophistry_graph.py`: sophistry experiment graph
  - `debater.py`, `judge.py`, `team_discussion.py`, `jury_discussion.py`, `consensus.py`
  - `sophistry_debater.py`, `sophistry_observer.py`, `sophistry_prompt_loader.py`
  - `context_builder.py`, `context_manager.py`, `reference_preprocessor.py`
  - `prompt_loader.py`: standard mode prompt loading
- `backend/app/llm/` — LLM invocation infrastructure (new)
  - `config.py`: provider config resolution, model factory
  - `router.py`: LLMRouter for provider routing
  - `providers/`: `base.py`, `clients.py` — provider client abstraction
  - `invoke.py`: safe invocation with retry/heartbeat/streaming
  - `transport.py`: raw OpenAI-compatible HTTP transport
  - `response.py`: response normalization, SSE parsing, tool call parsing
- `backend/app/tools/` — Agent tools (new, formerly agents/skills/)
  - `search_tool.py`, `search_query_planner.py`, `search_result_filter.py`, `search_formatter.py`
  - `metadata.py`: shared knowledge annotation
  - `skills/`: backward-compat re-exports (deprecated, use `app.tools/`)
  - `providers/`, `llm_router.py`, `safe_invoke.py`, `model_response.py`, `openai_transport.py`: backward-compat re-exports (deprecated, use `app.llm/`)
- `backend/app/services/` — Business logic
  - `session_service.py` (+ helpers): file-backed session CRUD, snapshot cleaning, round materialization
  - `provider_service.py` (+ store/serializers): provider configs from `runtime/config.json`
  - `document_service.py`: session document upload & multi-encoding decoding
  - `reference_library_service.py` (+ workflow/serializers/knowledge): structured reference entries synced to shared knowledge
  - `builtin_reference_service.py`: mode-builtin reference injection
  - `export_service.py` (+ markdown/json/scoring/filename/runtime): export facade
  - `connection_hub.py`, `runtime_event_service.py`, `intervention_manager.py`: runtime connection & intervention
  - `log_service.py`: log configuration service
  - `agent_config_service.py`: agent config management
- `backend/app/storage/` — File-backed storage helpers
  - `session_documents.py`, `session_files.py`, `reference_library.py`
- `backend/app/models/` — Pydantic schemas
  - `schemas.py`, `scoring.py`, `state.py`
- `backend/app/search/` — Search provider abstraction
  - `base.py`, `duckduckgo.py`, `searxng.py`, `tavily.py`, `factory.py`
- `backend/app/db/` — Database layer (SQLite via SQLAlchemy)
  - `database.py`, `models.py`
- `backend/prompts/` — Standard mode prompts (debater/judge/fact_checker + roles)
- `backend/prompts/sophistry/` — Sophistry mode prompts (debater/observer + roles)

### Frontend

- `frontend/src/App.tsx` — Root component, routing, error boundary, backend health check
- `frontend/src/components/HomeView.tsx` — Session creation, mode selector, agent config entry, sophistry notice
- `frontend/src/components/ChatPanel.tsx` — Main conversation surface, export actions
- `frontend/src/components/chat/` — Chat sub-components
  - `ChatHeaderOverlay.tsx`, `ChatHistoryList.tsx`, `DebateControls.tsx`
  - `ExecutionTimeline.tsx` (+ `executionTimeline/`): timeline visualization
  - `LiveGraph.tsx`: runtime graph visualization
  - `MemoryPanel.tsx` (+ `memoryPanel/`): shared knowledge inspector
  - `MessageRow.tsx` (+ `messageRow/`): individual message rendering
  - `RuntimeInspector.tsx`, `FloatingRuntimeInspector.tsx`: runtime observation panels
  - `RoundInsights.tsx`, `StatusBanner.tsx`, `ReferenceLibraryPanel.tsx` (+ `referenceLibrary/`)
- `frontend/src/components/home/` — Home view sub-components
  - `HomeComposerCard.tsx`, `HomeModeSelector.tsx`, `HomeStatusLegend.tsx`, `shared.ts`
- `frontend/src/components/shared/` — Shared UI components
  - `AgentConfigPanel.tsx`, `BackendHealthCheck.tsx`, `BrandIcon.tsx`, `CustomSelect.tsx`
  - `ErrorBoundary.tsx`, `SidebarExpandButton.tsx`, `SophistryModeNotice.tsx`, `ToastContainer.tsx`
- `frontend/src/components/sidebar/` — Sidebar components
  - `SessionList.tsx`, `SettingsPanel.tsx`, `ProviderForm.tsx`, `ProviderSidebar.tsx`, `SearchConfigTab.tsx`
  - `settings/`: settings sub-tabs (display, logging, etc.)
  - `search/`: search config sub-components
- `frontend/src/hooks/` — React custom hooks
  - `useDebateWebSocket.ts`: WebSocket lifecycle, reconnect, ping, event intake
  - `useDebateViewState.ts`, `useModelConfigManager.ts`, `useSessionCreate.ts`
  - `useAgentConfigs.ts`, `useToastState.ts`, `useForegroundDebateSelector.ts`
  - `chat/`: `useChatHistoryWindow.ts`, `useChatViewportMetrics.ts`, `useFloatingInspectorState.ts`, `useTranscriptPanelState.ts`
- `frontend/src/stores/` — Zustand stores
  - `debateStore.ts` (+ eventReducer/replay/runtime): single source of truth for runtime state
  - `settingsStore.ts`, `themeStore.ts`: settings & theme state
- `frontend/src/api/client.ts` — Typed REST client
- `frontend/src/types/` — TypeScript type definitions
  - `display.ts`, `index.ts`, `models.ts`, `runtime.ts`, `scoring.ts`, `search.ts`, `session.ts`
- `frontend/src/utils/` — Utility functions (50+ files)
  - Event normalization, replay, transcript, timeline, virtualization, text repair, etc.

## 4. Runtime Flow

1. `POST /api/sessions` creates a new session record.
2. Frontend connects to `WS /api/ws/{session_id}`.
3. Client sends `{ "action": "start" }`.
4. `DebateRuntimeService` → `DebateOrchestrator` → `LangGraphDebateEngine`.
5. Backend emits ordered runtime events through `RuntimeBus`.
6. Events are persisted to `runtime/sessions/<id>/events.jsonl` and broadcast to connected clients.
7. Frontend reduces events into chat, scores, replay, timeline, and inspector state via `debateStore.ts`.

## 5. Persistence Model

- `runtime/config.json` is the single active runtime config source for:
  - server settings (host, port, debug, cors, database_url)
  - auth (jwt settings)
  - providers (api keys, bases, models, default_max_tokens)
  - debate defaults (max_turns, max_tokens, context_window)
  - search (provider, searxng, tavily)
  - logging (level, backup_count)
- Sessions are file-backed, not database-backed:
  - `runtime/sessions/<session_id>/session.json` — session state
  - `runtime/sessions/<session_id>/events.jsonl` — runtime event log
  - `runtime/sessions/<session_id>/rounds/round-*.json` — round artifacts
  - `runtime/sessions/<session_id>/documents/` — uploaded documents
  - `runtime/sessions/<session_id>/reference_entries/` — reference pool entries
- Provider configs are stored in `runtime/config.json` under `providers`.
- Session `agent_configs` should reference saved providers by `provider_id`; avoid depending on raw API keys inside session state.

## 6. Debate Modes

### `standard`

- Graph: `backend/app/agents/graph.py`
- Supports tool/search usage, judge scoring, optional team/jury discussion, optional final consensus
- Prompts: `backend/prompts/debater_*.md`, `judge_system.md`, `fact_checker_system.md`

### `sophistry_experiment`

- Graph: `backend/app/agents/sophistry_graph.py`
- Uses separate prompts (`backend/prompts/sophistry/`) and observer/postmortem flow
- Geared toward rhetoric analysis, fallacy tagging, and narrative drift observation
- Team discussion, jury discussion, and reasoning extras are disabled at session creation time
- Built-in fallacy catalog auto-injected into session reference pool
- Events keyed by turn; observer reports carry `source_turn` / `source_roles` for frontend correlation

## 7. Important Invariants

- `runtime/config.json` is authoritative. Do not reintroduce multiple active config sources.
- `last_executed_node` is the resume/status anchor. New graph nodes must set it explicitly.
- Append-only LangGraph reducers must return deltas, not full lists:
  - `dialogue_history`
  - `shared_knowledge`
- If you add or change runtime event types, update both backend and frontend:
  - backend emitters/orchestrator
  - frontend event normalization in `debateStore.ts`
  - `frontend/src/components/chat/RuntimeInspector.tsx` and related components
- If you change session or API payload shapes, update backend schemas and frontend types/client together.
- Session ids must remain 12 hex chars. The WebSocket route validates this format.
- Keep `sophistry_experiment` behaviorally separate from the standard debate flow.
- Provider keys are encrypted at rest; use `provider_service.py` for access.
- Output token defaults: 128k max input, 64k max output (configurable per-provider via `default_max_tokens`).

## 8. Common Edit Paths

### New runtime or graph behavior

- `backend/app/agents/graph.py` or `sophistry_graph.py`
- `backend/app/runtime/orchestrator.py`
- `backend/app/runtime/event_emitter.py` / `runtime_report_emitter.py` / `runtime_speech_emitter.py`
- `backend/app/runtime/session_repository.py`
- `frontend/src/stores/debateStore.ts` (+ eventReducer/replay/runtime)
- `frontend/src/components/chat/RuntimeInspector.tsx` / `ExecutionTimeline.tsx`

### New provider or search configuration behavior

- `backend/app/config.py`
- `backend/app/services/provider_service.py` / `provider_config_store.py` / `provider_serializers.py`
- `backend/app/api/search.py` / `backend/app/services/log_service.py`
- `frontend/src/components/sidebar/SettingsPanel.tsx` / `SearchConfigTab.tsx`
- `frontend/src/hooks/useModelConfigManager.ts`

### New document or reference-library behavior

- `backend/app/services/document_service.py`
- `backend/app/services/reference_library_service.py` / `workflow.py` / `knowledge.py`
- `backend/app/storage/session_documents.py` / `reference_library.py`
- `backend/app/agents/reference_preprocessor.py`
- `frontend/src/components/chat/referenceLibrary/`

### New export behavior

- `backend/app/services/export_service.py` (facade)
- `backend/app/services/export_markdown_service.py` / `export_json_service.py`
- `backend/app/services/export_scoring_service.py` / `export_runtime_service.py`
- `frontend/src/components/chat/ChatPanel.tsx` (export actions)

## 9. Read These Before Going Deeper

- `README.md` — Project overview and quick start
- `docs/getting-started.md` — Detailed startup guide
- `docs/architecture.md` — System architecture overview
- `docs/runtime.md` — Runtime and replay mechanics
- `docs/session-reference-library-implementation.md` — Reference pool implementation
- `docs/sophistry-experiment-mode-design.md` — Sophistry mode design
- `docs/sophistry-fallacy-catalog.md` — Fallacy catalog
- `docs/guides/backend-development.md` — Backend development guide
- `docs/guides/frontend-development.md` — Frontend development guide
- `docs/guides/encoding.md` — Encoding guidelines

If this file starts turning into a full project manual again, move detail into `docs/` and keep only the stable collaboration-critical facts here.
