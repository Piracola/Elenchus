# Phase 2 Refactor Log

## 2026-03-17

### Completed

- P2-3 Replay Engine v1
  - Global replay state in store (`replayEnabled`, `replayCursor`, `visibleRuntimeEvents`)
  - Replay controls wired to full UI (timeline / chat / status / live graph)
  - Runtime event snapshot import/export (JSON)

- P2-1 Performance layer for long sessions
  - Timeline query filter (`Search events...`)
  - Paged timeline rendering (`TIMELINE_PAGE_SIZE = 200`)
  - Incremental "Load older" window expansion
  - Utility layer extracted: `timelineWindow.ts`

- Timeline + Graph event dictionary unification
  - Shared runtime event mapping in `runtimeEventDictionary.ts`
  - `ExecutionTimeline` and `liveGraph` now consume one mapping source

- Replay consistency guard
  - Snapshot export now writes `trajectory_checksum`
  - Snapshot import now verifies checksum and rejects mismatched trajectories

- 10k event performance baseline
  - Added baseline test for timeline windowing + replay snapshot parse/serialize at 10k events

### Validation

- `npm --prefix frontend run test:run`
  - 9 files, 26 tests passed
- `npm --prefix frontend run build`
  - Production build passed (existing chunk size warning remains)

## 2026-03-18

### Completed

- Memory event pipeline (backend -> frontend)
  - Backend orchestrator now emits `memory_write` runtime events for new shared knowledge items
  - Emission is incremental (new items only), avoids duplicate writes on unchanged snapshots

- Memory Stream panel (frontend)
  - Added replay-aware `MemoryPanel` to Chat view
  - Added memory importance/decay visualization and quick focus jump to source event
  - Added timeline filter support for `memory` event group

- Stability improvement
  - Fixed circular import risk in `app.runtime` and `app.agents` package exports by switching to lazy exports

### Validation

- `python -m pytest backend/tests/test_event_gateway.py backend/tests/test_orchestrator_memory_events.py`
  - 3 passed
- `npm --prefix frontend run test:run`
  - 12 files, 33 tests passed
- `npm --prefix frontend run build`
  - Production build passed (existing chunk size warning remains)
