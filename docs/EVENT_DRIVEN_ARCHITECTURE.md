# Event-Driven 架构升级（Phase 1 落地）

本文件记录 Elenchus 在 Agent Runtime Observatory 方向上的第一阶段改造结果。

## 1. 已完成能力

### 1.1 统一 Event Schema（后端）

- 新增标准事件信封：
  - `schema_version`
  - `event_id`
  - `session_id`
  - `seq`
  - `timestamp`
  - `type`
  - `source`
  - `phase`
  - `payload`
- 保留 payload 的顶层平铺字段兼容旧客户端。

代码：
- `backend/app/runtime/event_schema.py`
- `backend/app/runtime/event_gateway.py`

### 1.2 Event Stream Gateway（后端）

- 所有运行时事件通过 `EventStreamGateway` 封装并分配单会话递增 `seq`。
- Orchestrator 与 WebSocket 网关统一使用该层发送事件。

代码：
- `backend/app/runtime/orchestrator.py`
- `backend/app/api/websocket.py`
- `backend/app/dependencies.py`

### 1.3 Event Reducer Layer（前端）

- WebSocket Hook 仅负责接收 + 归一化事件，不再直接写业务状态。
- Zustand Store 新增 `applyRuntimeEvent(event)` 作为统一 reducer 入口。
- 引入 `runtimeEvents` 日志与 `lastEventSeq` 去重控制。

代码：
- `frontend/src/utils/runtimeEvents.ts`
- `frontend/src/hooks/useDebateWebSocket.ts`
- `frontend/src/stores/debateStore.ts`
- `frontend/src/types/index.ts`

## 2. 对当前痛点的直接收益

- UI 更新从“散落逻辑 + 状态拼接”转为“统一事件驱动”。
- 同一会话的重复事件可通过 `event_id/seq` 与消息级去重拦截。
- 为 Timeline / Replay / Live Graph 提供了标准事件基础。

## 3. 下一阶段建议（Phase 2）

1. Execution Timeline UI  
基于 `runtimeEvents` 增加时间轴组件，支持筛选（node/type/phase）与回放定位。

2. Replay Engine  
支持导入事件序列重放 UI 状态，调试与回归复现更直观。

3. Live Graph Rendering  
把 `source + phase + type` 映射到图节点激活状态和边动画，形成实时图执行视图。
