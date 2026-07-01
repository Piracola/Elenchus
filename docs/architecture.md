# 系统架构总览

> 本文档说明当前系统如何组织：核心目标、分层、数据流、模式边界与主要代码入口。
> `runtime/` 目录和历史恢复文件职责请见 [runtime.md](./runtime.md)。

## 1. 核心目标

Elenchus 是一个本地优先的 AI 多智能体辩论应用。它的主路径只有一条：

1. 用户配置模型 provider。
2. 用户创建辩题。
3. 后端编排多个 AI 角色运行辩论。
4. 前端实时展示过程。
5. 系统保存会话，支持历史恢复和导出。

架构判断优先服务这条闭环。公开部署、外部代理集成、额外桌面壳和长期未来规划不属于当前主线。

## 2. 系统分层

```text
React Frontend
├─ 会话创建与切换
├─ 模型 / 搜索 / 界面设置
├─ WebSocket 实时事件渲染
└─ 历史恢复与导出入口
   │
   ▼
FastAPI Backend
├─ Sessions / Runs / Models / Search / Log APIs
├─ WebSocket Run 事件订阅
├─ 文档上传与会话参考资料
└─ 静态前端发布包回退
   │
   ▼
Runtime Layer
├─ DebateRuntimeService
├─ Orchestrator
├─ RuntimeBus
└─ SessionRuntimeRepository
   │
   ▼
Agent / LLM Layer
├─ 标准辩论 graph
├─ 诡辩实验 graph
├─ Prompt loader
├─ LLM invoke / transport
└─ Search tools
   │
   ▼
Persistence
├─ runtime/config.json
└─ SQLite database
```

## 3. 请求与事件流

### 创建会话

```text
HomeView
→ frontend/src/api/client.ts
→ POST /api/sessions
→ backend/app/api/sessions.py
→ backend/app/services/session_service.py
→ SQLite sessions 表
```

### 启动辩论

```text
DebateControls / useDebateWebSocket
→ POST /api/sessions/{session_id}/runs
→ backend/app/api/session_runtime.py
→ DebateRuntimeService
→ Orchestrator
→ LangGraph engine
→ standard graph 或 sophistry graph
```

### 实时展示

```text
Runtime nodes
→ RuntimeBus
→ SQLite run_events
→ WebSocket /api/ws/runs/{run_id}
→ debateStore
→ ChatPanel / StatusBanner / live transcript
```

### 历史恢复

```text
GET /api/runs/{run_id}
→ RunProjection
→ debateStore
→ 历史消息与运行态
```

## 4. 前端边界

前端负责用户操作与运行过程呈现，不承载辩论编排规则。

主要入口：

- `frontend/src/components/HomeView.tsx`：首页、模式选择、创建会话。
- `frontend/src/components/ChatPanel.tsx`：会话主视图。
- `frontend/src/hooks/useDebateWebSocket.ts`：启动 / 停止 / 心跳 / 干预与实时事件接收。
- `frontend/src/stores/debateStore.ts`：会话、消息和运行态的前端状态。
- `frontend/src/api/client.ts`：REST API 访问层。

## 5. 后端边界

后端负责 API、运行编排、LLM 调用、会话参考资料和持久化。

主要入口：

- `backend/app/main.py`：FastAPI 应用装配、CORS、路由、健康检查、静态前端回退。
- `backend/app/api/sessions.py`：会话 CRUD 与导出。
- `backend/app/api/session_runtime.py`：创建 Run、读取 Run、提交 RunCommand、读取 RunEvent。
- `backend/app/api/websocket.py`：按 `run_id` 订阅实时事件与断线补拉。
- `backend/app/api/models.py`：模型 provider 配置。
- `backend/app/api/search.py`：搜索配置与健康检查。
- `backend/app/api/session_documents.py`：会话参考文档接口。

## 6. 运行层边界

运行层把“API 请求”转成“可恢复、可广播、可落盘的辩论过程”。

关键职责：

- `DebateRuntimeService`：启动、停止、运行状态和用户干预队列。
- `Orchestrator`：按会话模式选择运行链路。
- `RuntimeBus`：创建事件、广播 WebSocket、追加 SQLite run event。
- `SessionRuntimeRepository`：从 Session + RunProjection/Checkpoint 构造运行输入，并把运行检查点写回 ledger。
- `runtime/engines/langgraph.py`：装配并调用 LangGraph。

运行事件是前后端之间的主契约之一。新增节点或事件时，需要同时确认：

- 后端是否写入 SQLite `run_events`。
- 前端是否能识别并渲染事件。
- projector 是否能从事件和会话文档重建 `RunProjection`。

## 7. 模式边界

### 标准辩论模式

标准模式用于常规辩论、评分和总结。

核心能力：

- 正反方发言。
- 每轮发言前的组内讨论简报。
- 裁判评分。
- 可选搜索增强。
- 可选共识收敛总结。

主要入口：

- `backend/app/agents/graph.py`
- `backend/app/agents/debater.py`
- `backend/app/agents/group_discussion.py`
- `backend/app/agents/judge.py`
- `backend/app/agents/consensus.py`

### 诡辩实验模式

诡辩实验模式用于观察修辞操控和谬误标签，不追求胜负裁决。

核心边界：

- 独立 prompt。
- 独立 graph。
- 禁用搜索。
- 不启用裁判、组内讨论和评分。
- 输出观察报告和最终复盘。
- 自动注入内置谬误库。

主要入口：

- `backend/app/agents/sophistry_graph.py`
- `backend/app/agents/sophistry_debater.py`
- `backend/app/agents/sophistry_observer.py`

模式行为细节见 [sophistry-experiment-mode-design.md](./sophistry-experiment-mode-design.md)。

## 8. 参考资料边界

会话参考资料是 Session 级输入能力，不是全局知识库，也不是 Run 的运行事实。

它负责：

- 保存用户上传文档。
- 解码并规范化纯文本 / Markdown。
- 将文档内容写入 SQLite `session_documents`，由 projector 派生为 Run 的 shared knowledge。

用户上传资料不再经过 LLM 预处理，也不生成 term / claim / excerpt 结构化条目。诡辩实验模式的内置谬误库仍会生成内部标签条目，作为该模式的固定背景能力。

主要入口：

- `backend/app/api/session_documents.py`
- `backend/app/services/document_service.py`
- `backend/app/services/session_document_workflow.py`
- `backend/app/services/builtin_reference_service.py`（仅诡辩模式内置资料）

运行时数据模型见 [runtime.md](./runtime.md)。

## 9. 配置与持久化

当前活动配置源是 `runtime/config.json`，主要保存静态配置：

- server 配置。
- provider 配置。
- 搜索配置。
- 日志配置。
- 辩论默认配置。

运行真相统一保存在 SQLite：`sessions` 保存用户定义的辩题和配置，`runs` 保存一次执行，`run_events` 保存事实事件，`run_projections` 保存可重建读模型，`run_checkpoints` 保存恢复点。导出仍走现有 JSON / Markdown / HTML 能力，但数据源来自 SQLite 聚合结果。

## 10. 代码入口速查

| 场景 | 优先入口 |
| --- | --- |
| 启动应用 | `backend/app/main.py` |
| 创建 / 删除 / 导出会话 | `backend/app/api/sessions.py` |
| 创建 / 查看 / 控制 Run | `backend/app/api/session_runtime.py` |
| 实时事件 | `backend/app/api/websocket.py`、`backend/app/runtime/bus.py` |
| 标准辩论流程 | `backend/app/agents/graph.py` |
| 诡辩实验流程 | `backend/app/agents/sophistry_graph.py` |
| LLM 调用 | `backend/app/llm/invoke.py`、`backend/app/llm/transport.py` |
| 搜索工具 | `backend/app/tools/search_tool.py` |
| 模型配置 | `backend/app/api/models.py`、`backend/app/services/provider_service.py` |
| 会话参考资料 | `backend/app/api/session_documents.py` |
| 前端创建页 | `frontend/src/components/HomeView.tsx` |
| 前端会话页 | `frontend/src/components/ChatPanel.tsx` |
| 前端实时通信 | `frontend/src/hooks/useDebateWebSocket.ts` |
| 前端状态 | `frontend/src/stores/debateStore.ts` |

## 11. 文档分工

- 启动项目：读 [getting-started.md](./getting-started.md)。
- 查看 API：启动后访问 `http://localhost:8001/docs`。
- 理解运行时文件：读 [runtime.md](./runtime.md)。
- 开发项目：读 [development.md](./development.md)。
