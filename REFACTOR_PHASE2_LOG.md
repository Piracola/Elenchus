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
  - Frontend runtime event retention raised from 1200 to 10,000 to match the current replay/timeline baseline

- P2-H1 Runtime event history paging
  - Added persistent `runtime_events` storage so timeline history is no longer frontend-memory-only
  - Added `/api/sessions/{session_id}/runtime-events` paging endpoint for latest-page and older-page loading
  - Session switching now preloads the latest runtime event page
  - Execution Timeline can page older events from the server when local history is exhausted

- P2-H2 Full snapshot export + full replay load
  - Added `/api/sessions/{session_id}/runtime-events/export` full snapshot export endpoint
  - Backend snapshot format now matches replay checksum / parser expectations
  - Timeline export now prefers the backend full snapshot instead of only exporting the currently loaded window
  - Timeline added one-click full replay loading from persisted event history

- P2-H3 Timeline virtualization + indexed search
  - Timeline search now precomputes searchable text instead of rebuilding full search strings on every keystroke
  - Search input now runs through a deferred query path to reduce large-list typing stalls
  - Timeline event list now uses virtual window rendering, so loaded history pages no longer create a full DOM list
  - Added virtual window test coverage and updated the 10k baseline test to include indexed filtering + virtual window math

### Validation

- `python -m pytest backend/tests/test_event_gateway.py backend/tests/test_orchestrator_memory_events.py`
  - 3 passed
- `pytest -p no:cacheprovider backend/tests/test_event_gateway.py backend/tests/test_orchestrator_memory_events.py backend/tests/test_runtime_event_service.py -q`
  - 6 passed
- `pytest -p no:cacheprovider backend/tests/test_event_gateway.py backend/tests/test_orchestrator_memory_events.py backend/tests/test_runtime_event_service.py backend/tests/test_export_service.py -q`
  - 10 passed
- `npm --prefix frontend run test:run`
  - 12 files, 33 tests passed
- `npm --prefix frontend run test:run -- src/stores/debateStore.replay.test.ts src/utils/performanceBaseline.test.ts`
  - 2 files, 7 tests passed
- `npm --prefix frontend run test:run -- src/stores/debateStore.replay.test.ts src/utils/replaySnapshot.test.ts src/utils/performanceBaseline.test.ts`
  - 3 files, 12 tests passed
- `npm --prefix frontend run test:run -- src/utils/timelineWindow.test.ts src/utils/performanceBaseline.test.ts src/stores/debateStore.replay.test.ts`
  - 3 files, 12 tests passed
- `npm --prefix frontend run build`
  - Production build passed (existing chunk size warning remains)

## 2026-03-18 审计同步

### 清单与代码对齐后的真实状态

- Phase 1 已完成，并且已经是当前运行时底座
- Phase 2 实际上已达到 MVP 水平，不再是“刚开始做”
  - Timeline 联动定位已经接入消息高亮与滚动定位
  - Live Graph 已具备节点激活、活动边动画与节点热度显示
  - Replay 的导入导出、游标步进、实时/回放切换、轨迹校验都已在代码中落地
- Phase 3 已有可用前置能力
  - 后端 `memory_write` 事件已完成端到端打通
  - 前端已提供具备回放感知的 Memory Stream 面板，并展示重要度/衰减信息

### 审计中确认的已知限制

- 长会话支持仍然只完成了一部分
  - Timeline 已具备前端虚拟渲染和本地搜索索引，但还没有服务端索引检索
  - 前端 store 目前常驻最近 10,000 条 runtime events，10,000+ 之后依赖服务端历史分页回捞
- Live Graph 拓扑仍然是静态的
  - 还没有动态分支生成、子图折叠和 merge 可视化
- Memory 可视化仍然以面板为主
  - 还没有 Memory Graph、语义聚类和知识演化时间线

### 下一步执行优先级

- P3-1：基于 `memory_write` 的来源链路与引用关系，落 Memory Graph v1
- P3-2：补齐 Knowledge Timeline，让记忆增长能够以“认知演化”方式回放，而不只是事件列表
- P2-H3b：继续补强超长会话检索体验（服务端索引检索 / 更细粒度按需装载）
