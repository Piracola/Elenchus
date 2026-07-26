# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Elenchus is a local-first AI multi-agent debate platform: users configure model providers, create a debate topic, and the backend orchestrates AI roles (proposer, opposer, judge, observer) through a LangGraph pipeline while the frontend renders events live over WebSocket. Docs (in Chinese) live in `docs/` — `architecture.md`, `runtime.md`, `development.md` are the canonical references.

## Commands

Root-level (wrappers in `scripts/*.cjs`):

```bash
npm run dev            # start backend + frontend together
npm run dev:backend    # backend only
npm run dev:frontend   # frontend only
npm run test:backend   # backend pytest suite
npm run lint           # frontend eslint
npm run kill:backend   # free the backend port
```

Backend (Python 3.11, managed with uv; `backend/pyproject.toml` + `backend/uv.lock` are the single source of truth for dependencies — ignore the stale `backend/venv/`):

```bash
cd backend
uv sync --frozen --group dev
uv run --frozen --no-dev python -m uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload --no-access-log
uv run --frozen --group dev pytest                        # all tests (pytest.ini at repo root points at backend/tests)
uv run --frozen --group dev pytest tests/test_graph.py    # single test file
uv run --frozen --group dev pytest tests/test_graph.py -k name  # single test
```

Frontend (React 19 + TypeScript + Vite 7, in `frontend/`):

```bash
npm run dev        # dev server at http://127.0.0.1:5173, proxies /api and /api/ws to backend port 8001
npm run lint
npm run test:run   # vitest (npm run test for watch mode)
npm run build      # regenerates brand assets, tsc -b, vite build
```

If the backend runs on a non-default port, set `VITE_BACKEND_PORT` in `frontend/.env`. Backend API docs at `http://localhost:8001/docs`.

## Architecture

Layers, top to bottom: React frontend → FastAPI API layer (`backend/app/api/`) → runtime layer (`backend/app/runtime/`) → agent/LLM layer (`backend/app/agents/`, `backend/app/llm/`) → persistence (`runtime/config.json` + SQLite).

### Persistence: SQLite ledger is the runtime truth

`runtime/elenchus.db` is the authoritative store. Key tables: `sessions` (user-defined topic/participants/config), `runs` (one execution), `run_events` (append-only fact stream keyed by `run_id + seq` — the primary source of truth for what happened), `run_projections` (rebuildable read model derived from session + documents + events), `run_checkpoints` (resume points), `run_commands` (stop/resume/intervene), `session_documents` (uploaded reference material). The legacy file layout under `runtime/sessions/` (session.json / events.jsonl) is import-only history, not a live format (`backend/scripts/import_legacy_runtime.py` migrates it).

Recovery targets a Run, never a Session: the projector rebuilds `RunProjection` from session config + `session_documents` + `run_events`; resume prefers the latest safe checkpoint. If `run_projections` is deleted the system must be able to rebuild it from events.

### Event flow (the main frontend/backend contract)

Graph nodes → `RuntimeBus` (`backend/app/runtime/bus.py`) → SQLite `run_events` + WebSocket `/api/ws/runs/{run_id}` → `frontend/src/stores/debateStore.ts` → UI. When adding a node or event type, verify all three sides: the backend persists it to `run_events`, the frontend recognizes and renders it, and the projector can rebuild `RunProjection` from it.

### Runtime layer roles

- `runtime/service.py` (DebateRuntimeService): start/stop, run status, user-intervention queue.
- `runtime/orchestrator.py`: picks the execution path per session mode, wraps it with persistence and events.
- `runtime/session_repository.py`: builds resumable run input from Session + projection/checkpoint, writes checkpoints back.
- `runtime/engines/langgraph.py`: assembles and invokes the LangGraph.

### Two debate modes with hard boundaries

- **Standard** (`backend/app/agents/graph.py`): proposer/opposer turns, per-turn group discussion, judge scoring, optional search, optional consensus summary.
- **Sophistry experiment** (`backend/app/agents/sophistry_graph.py`): separate graph and prompts; search disabled; no judge, group discussion, or scoring; observer tags fallacies and produces a postmortem; a built-in fallacy catalog is auto-injected.

Prompts live in `backend/prompts/` (standard at top level, sophistry under `sophistry/`), loaded as "base system prompt + role supplement", with fallback to the generic role file when a specific one is missing.

### Graph state conventions

- `last_executed_node` is the resume/status anchor — graph nodes must set it explicitly.
- `dialogue_history` and `shared_knowledge` use append-only reducers; nodes must return deltas, not full lists.
- Resume normalization clears partial current-turn output unless the last node is a safe boundary (`""`, `manage_context`, `advance_turn`, `consensus`, `sophistry_postmortem`) — see `backend/tests/test_session_runtime_repository.py`.

### Configuration

`runtime/config.json` is the single active config source (server, providers, search, logging, debate defaults). Do not reintroduce legacy sources (`.env` config, `config.yaml`, provider DB). Provider API keys are entered in the Web UI and stored there; with the `ELENCHUS_ENCRYPTION_KEY` env var set they are transparently encrypted (see README). Session `agent_configs` reference saved providers by `provider_id` (`{ model, provider_type, provider_id, api_base_url }`), never raw API keys. Search defaults to built-in DDGS with fallback from a custom HTTP endpoint.

## Conventions

- **UTF-8 everywhere**: all source files, JSON/Markdown/log output, and backend `text/*` and `application/json` responses must declare `charset=utf-8`; Chinese filenames in `Content-Disposition` use `filename*=UTF-8''...`; frontend file imports decode with `TextDecoder('utf-8', { fatal: true })`. Never commit mojibake literals.
- **Console logging is deliberately quiet**: console shows only startup/shutdown, key lifecycle, and WARNING+. Per-statement SQL, `ROLLBACK`s, HTTP access logs, and third-party INFO belong in `runtime/logs/`, not the terminal — keep `--no-access-log`, don't enable SQLAlchemy `echo`, and route loggers through `app/services/log_service.py`.
- **Frontend style contract**: calm, professional, content-first tool UI. No large gradients, glow, glassmorphism, or decorative animation; reuse existing tokens and components; respect reduced-motion.
- **Debugging runs**: check `/api/runs/{run_id}` (summary + projection), `/api/runs/{run_id}/events?after_seq=0`, the SQLite `runs`/`run_events`/`run_checkpoints`/`run_projections` rows, then `runtime/logs/`. `runtime/config.json` explains static config only, never why a run reached a state.
