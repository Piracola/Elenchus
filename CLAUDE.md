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
npm run test:video     # video renderer unit tests
npm run lint           # frontend eslint
npm run lint:backend   # backend ruff
npm run typecheck:backend  # backend mypy
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
uv run --frozen --group dev ruff check .                  # CI-enforced lint
uv run --frozen --group dev mypy app                      # CI-enforced types
```

`ruff` and `mypy` both gate CI. mypy runs with a per-module ignore list in
`backend/pyproject.toml` for legacy third-party signature mismatches; anything
outside that list must stay clean, so new code cannot add type errors.

Frontend (React 19 + TypeScript + Vite 7, in `frontend/`):

```bash
npm run dev        # dev server at http://127.0.0.1:5173, proxies /api and /api/ws to backend port 8001
npm run lint
npm run test:run   # vitest (npm run test for watch mode)
npm run build      # regenerates brand assets, tsc -b, vite build
npm run test:coverage  # coverage report (measured, not gated)
```

Video renderer (`video/`, a separate Node + Remotion + Edge TTS toolchain):

```bash
cd video && npm ci && npm run typecheck && npm test   # what CI runs
npm run ui                                            # local console on :4317
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

- `runtime/service.py` (DebateRuntimeService): start/stop, run status, per-run interrupt events.
- `runtime/orchestrator.py`: picks the execution path per session mode, wraps it with persistence and events, and owns the re-entry loop for moderator directives.
- `runtime/session_repository.py`: builds resumable run input from Session + projection/checkpoint, writes checkpoints back.
- `runtime/engines/langgraph.py`: assembles and invokes the LangGraph.

### Two debate modes with hard boundaries

- **Standard** (`backend/app/agents/graph.py`): proposer/opposer turns, per-turn group discussion, a fact-check pass after each turn's speeches (`reasoning_config.fact_check_enabled`, on by default), judge scoring, optional search, optional consensus summary.
- **Sophistry experiment** (`backend/app/agents/sophistry_graph.py`): separate graph and prompts; search disabled; no judge, group discussion, or scoring; observer tags fallacies and produces a postmortem; a built-in fallacy catalog is auto-injected.

Prompts live in `backend/prompts/` (standard at top level, sophistry under `sophistry/`), loaded as "base system prompt + role supplement", with fallback to the generic role file when a specific one is missing.

### Graph state conventions

- `last_executed_node` is the resume/status anchor — graph nodes must set it explicitly.
- `dialogue_history` and `shared_knowledge` use append-only reducers; nodes must return deltas, not full lists.
- Resume normalization clears partial current-turn output unless the last node is a safe boundary (`""`, `manage_context`, `advance_turn`, `consensus`, `sophistry_postmortem`) — see `backend/tests/test_session_runtime_repository.py`.
- The `manage_context` conditional edge must map **every** node `predict_resume_next_node` can return. An unmapped key is a hard LangGraph `KeyError` on resume, not a fallback.
- `node_manage_context` skips `build_round_digest` when the previous turn is already summarized, so re-entry (resume or directive injection) costs no extra LLM call.

### Moderator directives (user intervention)

A directive is persisted to `run_commands` (`pending` → `consumed`/`revoked`) before anything else, so nothing is lost on restart. The orchestrator consumes pending directives at every node boundary: it closes the current graph stream, injects the directive as an `audience` entry whose `event_id` is the command id (which makes snapshot and event replay idempotent), then re-enters the graph using the existing `resume_next_node` semantics. `interrupt` additionally races the in-flight node via a per-run `asyncio.Event` and aborts speech generation, emitting `speech_cancel`; non-speech nodes degrade to "apply at the next boundary". Debaters get the directive twice — as a live constraint and as a separate highest-priority `HumanMessage` placed outside the "history is reference only" guardrail — and the judge is told to score whether it was addressed. See `backend/app/agents/moderator.py`.

### Failure budget

`backend/app/llm/failure_budget.py` installs a run-scoped budget in a ContextVar (shared by `asyncio.gather` fan-outs): total failures, provider `retry-after` clamp, cumulative backoff, and wall-clock. Node-level retries multiply with transport retries, so this is the only global ceiling. Exhaustion raises `FailureBudgetExhausted`, which the orchestrator turns into **STALLED** (resumable, progress kept) rather than FAILED. Configure under `debate.failure_budget` in `runtime/config.json`.

### Token accounting

`invoke_chat_model`/`invoke_text_model` take an `on_usage` callback; all three transport paths (langchain `ainvoke`, `astream` aggregation, raw OpenAI HTTP) extract usage, and streaming requests ask for `stream_options.include_usage` with automatic fallback for endpoints that reject it. Nodes emit `token_usage` events via `build_usage_callback`; the projector aggregates per role into `projection["token_usage"]`, which surfaces in the session payload, the HTML export, and the chat header chip.

### Configuration

`runtime/config.json` is the single active config source (server, providers, search, logging, debate defaults). Do not reintroduce legacy sources (`.env` config, `config.yaml`, provider DB). Provider API keys are entered in the Web UI and stored there; with the `ELENCHUS_ENCRYPTION_KEY` env var set they are transparently encrypted (see README). Session `agent_configs` reference saved providers by `provider_id` (`{ model, provider_type, provider_id, api_base_url }`), never raw API keys.

### Search providers

`backend/app/search/registry.py` is the single source of truth. A provider is a
module under `backend/app/search/` decorated with `@register_search_provider`
that declares `name`, `label`, `description`, `config_fields`
(`ProviderFieldSpec`, including `secret`/`required`), and `fallback_priority`.
Everything else derives from that declaration: `search.providers.<name>` config
normalization, at-rest encryption of every `secret` field, the
`GET /api/search/config` payload, and the settings form — the UI renders
whatever fields the backend reports and knows no provider by name. Adding a
provider means adding one module; do not reintroduce per-provider branches in
config, API models, or the frontend.

Fallback runs current-provider-first then by `fallback_priority`; DDGS declares
the highest value so it stays the no-configuration safety net. Providers missing
a required field are never instantiated and report `configured: false`.
`app/search/limits.py` owns the shared results-per-query clamp used by both
`tools/search_tool.py` and `agents/fact_checker.py`.

`video.base_url` points at the local video renderer console (default
`http://127.0.0.1:4317`); the backend only proxies the session export to it and
never renders in-process.

### Frontend design system

`frontend/src/index.css` holds every design token; `frontend/src/config/motion.ts`
holds every animation value. Read from them — do not add a local duration,
easing, or hover-scale literal.

Visual character is a **paper reading surface**: a warm page
(`--surface-page`), a white reading column (`--surface`), and three border steps
(`--border-hairline`/`--border-subtle`/`--border-strong`) carrying the structure
instead of shadows. Role colour appears only on a speaker avatar — speech cards
carry no coloured edge marker, because a 3px bar bending around the corner
radius reads as a defect. Scores are monochrome numerals with `.tabular-nums`,
never colour-coded.

A transcript row is two columns: the speech takes the remaining width from a
`--transcript-speech-min` basis, and the verdict takes
`--transcript-verdict-column` (`clamp(300px, 32%, 520px)`), so a wider page
gives the speech proportionally more — the verdict's content does not grow with
the viewport. Below the speech minimum the row wraps and the verdict stacks
under the speech; there is no breakpoint to keep in sync. The verdict column is
held open on speech-only rows, and `StreamingMessage` reproduces the same row
geometry, so a speech never resizes when its verdict lands or when streaming
ends. Line length is the user's call through the `messageWidth` display setting
(`MESSAGE_WIDTH_VALUES`), not a hard-coded measure — do not reintroduce a
per-message `max-width` cap on top of it, or the setting silently stops working.

`motion.ts` exports four durations (`TRANSITION.press/fast/normal/slow`) and one
on-screen curve (`EASE_OUT`); `--transition-fast` in CSS is the same curve so
plain CSS declarations stay in sync. Press feedback comes in three flavours and
picking the wrong one is visible: `PRESSABLE` for solid buttons,
`PRESSABLE_ICON` for icon-only buttons, and `PRESSABLE_TEXT` (opacity only) for
anything containing text — scaling Chinese glyphs blurs them. Anchored surfaces
use `POPOVER_MOTION` with a `transformOrigin` pointing at their trigger;
`MODAL_MOTION` stays centred; `COLLAPSE_MOTION` is for expand/collapse.
An `exit` needs an `AnimatePresence` that outlives the condition — putting the
`AnimatePresence` *inside* `{cond && ...}` means the exit never plays.

Accessibility invariants that are easy to undo:

- Focus rings are global (`:focus-visible` in `index.css`). Never add inline
  `outline: 'none'` — that is exactly how CustomSelect became keyboard-invisible.
- Dialogs use `useDialogA11y` (`frontend/src/hooks/`) for initial focus, Escape,
  in-dialog Tab wrapping, and focus restore. Tab is wrapped rather than
  document-trapped because selects inside dialogs portal their menus to `<body>`.
- Streaming text is never a live region; `StatusBanner` owns the one polite
  region and announces state changes.

## Conventions

- **UTF-8 everywhere**: all source files, JSON/Markdown/log output, and backend `text/*` and `application/json` responses must declare `charset=utf-8`; Chinese filenames in `Content-Disposition` use `filename*=UTF-8''...`; frontend file imports decode with `TextDecoder('utf-8', { fatal: true })`. Never commit mojibake literals.
- **Console logging is deliberately quiet**: console shows only startup/shutdown, key lifecycle, and WARNING+. Per-statement SQL, `ROLLBACK`s, HTTP access logs, and third-party INFO belong in `runtime/logs/`, not the terminal — keep `--no-access-log`, don't enable SQLAlchemy `echo`, and route loggers through `app/services/log_service.py`.
- **Frontend style contract**: calm, professional, content-first tool UI. No large gradients, glow, glassmorphism, or decorative animation; take every value from `index.css` tokens and `config/motion.ts`; respect reduced-motion. See "Frontend design system" above for the paper-surface rules and the press-feedback variants.
- **Run status presentation**: `frontend/src/utils/runtime/runStatusPresentation.ts` is the single mapping from run status to `isDebating`/`phase`. Both the run-summary path and the live `run_status_changed` path must go through it, or the UI flips depending on which wrote last.
- **Debugging runs**: check `/api/runs/{run_id}` (summary + projection), `/api/runs/{run_id}/events?after_seq=0`, the SQLite `runs`/`run_events`/`run_checkpoints`/`run_projections` rows, then `runtime/logs/`. `runtime/config.json` explains static config only, never why a run reached a state.
