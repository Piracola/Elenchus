# Elenchus 当前架构说明

> 更新时间：2026-03-20
> 依据：近三天提交历史与当前工作区改动整理，不等同于某个已发布版本的 release note。

## 1. 更新依据

### 近期影响架构认知的提交

- `17cef39`：重构运行时与模型调用链，开始收口运行链路。
- `5415038`：新增陪审团评议并优化组内讨论展示。
- `80c9569`：完善运行链路并补充模型温度配置。
- `c0e9187`：修复会话恢复与运行观察器交互并优化启动流程。
- `4fbf261`：增强搜索配置与模型自定义参数能力。
- `46e6f61`：改用 `events.jsonl` 过程流与按轮次拆分的 JSON 结果存储。
- `dc034d9`：增强辩论中断恢复与实时流式交互。

### 当前工作区里的相关改动

- `backend/app/api/sessions.py`：新增会话资料上传、列表、详情、删除接口。
- `backend/app/services/document_service.py`：新增资料接入层，负责校验、解码、规范化和摘要。
- `backend/app/storage/session_documents.py`：新增按 session 落盘的文档文件存储。
- `backend/tests/test_session_documents_api.py`：新增资料接口测试。
- `backend/tests/test_session_service.py`：补充删除 session 时联动清理资料文件的测试。

## 2. 架构总览

```text
Browser UI
├─ React 19 + Zustand
├─ REST 调用
└─ WebSocket 实时事件
   │
   ▼
FastAPI Backend
├─ /api/sessions        会话、历史、导出、资料接口
├─ /api/ws/{session_id} 实时辩论控制与事件推送
├─ /api/models          Provider / 模型配置
├─ /api/search          搜索配置与健康检查
└─ /api/log             日志级别配置
   │
   ▼
Service Layer
├─ session_service
├─ runtime_event_service
├─ document_service
├─ reference_library_service
├─ provider_service
└─ connection / intervention helpers
   │
   ▼
LangGraph Runtime
├─ debater / judge
├─ team_discussion / jury_discussion
├─ context_builder / context_manager
├─ safe_invoke / model_response / openai_transport
└─ search_tool / llm_router
   │
   ▼
Persistence
├─ runtime/elenchus.db
└─ runtime/sessions/<session_id>/
   ├─ session.json
   ├─ events.jsonl
   ├─ rounds/*.json
   ├─ documents/*.json
   └─ reference_entries/*.json
```

这套架构目前是“数据库 + 文件运行时”的混合持久化模式：

- SQLite 用于需要关系建模或统一配置管理的数据。
- Session 运行态与回放数据已经明显偏向文件化存储，减少大 JSON 在数据库中的频繁改写。

## 3. 分层职责

### 3.1 前端层

主要由 `frontend/src/components/`、`frontend/src/hooks/`、`frontend/src/stores/` 构成：

- `ChatPanel`、`RuntimeInspector`、`ExecutionTimeline` 负责辩论主界面与运行观察。
- `SessionList`、`SettingsPanel`、`ProviderSidebar`、`SearchConfigTab` 负责管理型交互。
- `useDebateWebSocket` 负责消费实时事件并驱动 store 更新。
- `debateStore` 负责把 REST 历史与 WebSocket 实时消息合并成统一前端状态。

### 3.2 API 层

当前公开 API 的职责边界如下：

- `sessions.py`：会话创建、读取、删除、导出、运行事件分页，以及本次新增的会话资料接口。
- `websocket.py`：基于 `start` / `stop` / `ping` / `intervene` 的实时控制协议。
- `models.py`：模型与 Provider 配置。
- `search.py`：搜索配置和搜索健康检查。
- `log.py`：日志级别控制。

`/api/sessions/{session_id}/documents` 这组接口当前属于后端 Phase 1 能力，只负责“资料接入层”，还没有把结构化资料池完整暴露给前端。

### 3.3 Service 层

- `session_service`：会话快照读写、回合结果同步、删除级联清理。
- `runtime_event_service`：将事件持久化到 `events.jsonl`，并提供分页读取。
- `document_service`：校验 `.txt` / `.md` 上传、解码 UTF-8 / GB18030、文本规范化、短摘要生成。
- `reference_library_service`：把文档预处理为结构化资料条目，并同步到 `shared_knowledge`。
- `provider_service`：Provider 凭据与配置管理。

这里最值得注意的变化是：文档接入层已经落地，但 `reference_library_service` 还没有被公开路由完整串起来，因此当前资料池属于“底座已建、入口未完全接通”的状态。

### 3.4 Agent Runtime 层

运行时核心仍然是 LangGraph 状态机：

- `graph.py` 负责编排辩手、裁判、工具调用与知识回写。
- `runner.py` 负责实际执行、事件发射与会话状态推进。
- `context_builder.py` / `context_manager.py` 负责上下文截断、共享知识注入和近期对话拼装。
- `team_discussion.py` 与 `jury_discussion.py` 分别承载组内讨论和陪审团评议。
- `search_tool.py` 与 `llm_router.py` 负责外部知识与多模型路由。

## 4. 当前持久化模型

### 4.1 运行时根目录

```text
runtime/
├─ backend/.env
├─ backend/config.yaml
├─ data/log_config.json
├─ elenchus.db
├─ logs/
└─ sessions/<session_id>/
```

### 4.2 单个 session 的文件结构

```text
runtime/sessions/<session_id>/
├─ session.json
├─ events.jsonl
├─ rounds/
│  ├─ round-001.json
│  └─ round-002.json
├─ documents/
│  ├─ <document_id>.json
│  └─ ...
└─ reference_entries/
   ├─ <document_id>.json
   └─ ...
```

对应语义：

- `session.json`：轻量会话快照，包含对话、分数、配置、共享知识等当前状态。
- `events.jsonl`：按事件顺序追加写入，适合恢复实时时间线。
- `rounds/*.json`：每轮完成后独立固化，便于回放、导出和中断恢复。
- `documents/*.json`：每份上传资料一条 JSON，保存原文、规范化文本、摘要和状态。
- `reference_entries/*.json`：结构化资料条目输出，当前已有存储能力，但还不是前端公开主链路。

### 4.3 与旧文档的关键差异

一些历史文档仍把 session 和资料池描述成“主要依赖数据库表”的形态。当前主线已经不是那个状态：

- Session 主数据以文件为主，而不是数据库主导。
- 运行事件使用 `JSONL` 而不是单个大 JSON 聚合。
- 每轮结果单独拆文件，恢复和局部读取成本更低。
- 会话资料上传当前也沿用了 session 目录下的文件化存储，而不是先落数据库表。

## 5. 关键链路

### 5.1 创建与启动辩论

1. 前端通过 `POST /api/sessions` 创建 session。
2. `session_service` 生成 `session.json` 初始快照。
3. 前端通过 `/api/ws/{session_id}` 发送 `start`。
4. 运行时开始执行 LangGraph，并通过 runtime bus 推送事件。
5. `runtime_event_service` 把事件持续写入 `events.jsonl`。
6. `session_service` 根据完成轮次同步更新 `rounds/*.json`。

### 5.2 恢复与回放

1. 前端通过 REST 拉取 `session.json` 对应的会话数据。
2. 通过 `GET /api/sessions/{session_id}/runtime-events` 分页补历史事件。
3. 观察器、时间线、消息流根据事件序列和轮次结果恢复 UI。

### 5.3 会话资料上传

1. 前端或测试通过 `POST /api/sessions/{session_id}/documents` 上传文件。
2. `document_service` 校验文件名、大小、MIME 和文本可解码性。
3. 服务把资料写入 `runtime/sessions/<session_id>/documents/<document_id>.json`。
4. 当前可通过列表、详情、删除接口管理这些资料。
5. 后续若接通 `reference_library_service`，则会继续生成 `reference_entries/*.json` 并把高价值条目同步到 `shared_knowledge`。

## 6. 资料池能力的当前状态

这部分是本次架构文档最需要澄清的地方：

- `document_service` + `session_documents` 已经落地，代表 Phase 1 的“接入层”完成。
- `reference_preprocessor.py`、`reference_library_service.py`、`storage/reference_library.py` 已经提供了结构化资料池的后续骨架。
- 但当前公开 API 还没有把“上传后自动预处理、查询结构化资料、在前端面板展示”整条链路接完。

因此，当前最准确的描述不是“资料池已完成”，而是：

> 会话级资料池已经具备文件接入与后续演进骨架，正在从原始文档接入层向结构化资料层推进。

## 7. 当前边界与建议

- `docs/archive/` 下的文档仍有参考价值，但不应继续作为当前架构的唯一事实来源。
- 根 README 适合描述主线能力与快速启动；本文件适合作为当前架构基线。
- 后续若继续推进资料池，建议优先公开 `reference_library_service` 对应 API，再补前端入口，而不是继续把文档信息塞进 `state_snapshot`。
