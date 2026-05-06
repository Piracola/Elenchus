# CLAUDE.md

> Project-specific collaboration notes for coding agents. Keep this file short: record decisions, invariants, and extension rules that are easy to miss from code alone. Put broad explanations in `docs/`.

## Project Shape

Elenchus is a local-first multi-agent debate app. Runtime conversations stream over WebSocket, are replayable, and are persisted as files under `runtime/sessions/`.

The two debate modes are intentionally separate:

- `standard`: normal debate flow with judge/scoring/search-related capabilities.
- `sophistry_experiment`: rhetoric/fallacy observation flow. Do not silently merge its behavior back into standard mode.

`runtime/config.json` is the single authoritative runtime configuration source. Do not introduce a second active config store for providers, search, server settings, or debate defaults.

## Working Rules

- The user is an amateur developer using vibe coding. Keep explanations concise and focus on finished changes.
- Prefer changing the existing feature path over adding parallel systems.
- Session ids must remain 12 hex characters because the WebSocket route depends on that shape.
- Session state is file-backed, not database-backed. The database layer is not the source of truth for saved debate sessions.
- Provider keys are encrypted at rest. Access them through the provider service layer; do not copy raw keys into session state.
- Session `agent_configs` should reference saved providers by `provider_id`.
- Git commits should be made outside the sandbox when signing keys are needed. Prefer signed commits; do not use `--no-gpg-sign` unless the user asks for it.

## Runtime Invariants

- `last_executed_node` is the resume/status anchor. Added graph nodes must set it deliberately.
- LangGraph append-only reducers must return deltas, not rebuilt full lists, especially for dialogue history and shared knowledge.
- Runtime events are ordered, persisted, and then reduced by the frontend. Changing event semantics is a backend + frontend contract change.
- Sophistry observer reports are correlated to source turns/roles. Preserve that relationship when changing sophistry events or UI.
- Built-in reference material for a mode should enter through the reference-pool flow, not as hidden prompt-only context.

## Extension Points

Use these as the first places to look. Do not treat them as exhaustive file inventories.

- Debate graph behavior: extend the relevant graph/agent modules, then check resume state, emitted runtime events, and frontend replay.
- Runtime event types: update backend emission, event normalization/reduction, runtime inspector/timeline rendering, and replay behavior together.
- Session or API payload shape: update backend schemas/services and frontend types/client in the same change.
- LLM provider behavior: add it through the provider service and LLM routing layers, keeping config in `runtime/config.json`.
- Search behavior: extend the search provider abstraction and the runtime-editable search configuration UI/API together.
- Documents and reference library: keep upload/storage, structured reference entries, shared-knowledge sync, and UI panels aligned.
- Export behavior: extend the export service facade and expose only stable export actions in the chat UI.
- Debate mode behavior: keep prompts, graph, defaults, built-in references, events, and UI mode affordances explicit. Do not hide mode-specific behavior behind broad standard-mode conditionals.

## Change Checklist

Before finishing a change, check the relevant items:

- Backend tests for touched runtime/service logic.
- Frontend build or targeted tests for touched UI/state logic.
- Runtime event changes replay correctly from persisted session events.
- `runtime/config.json` remains the only active runtime config source.
- Docs are updated only when they teach usage or architecture, not as a changelog.

## Docs Boundary

This file is not an architecture manual or release note. Avoid:

- Listing every file path in the project.
- Recording temporary migration labels or historical implementation notes.
- Copying details that can be discovered directly from imports, route registration, or package manifests.

Use `README.md` for quick start, `docs/architecture.md` for system design, `docs/runtime.md` for replay/runtime details, and focused docs under `docs/` for user-facing guides.
