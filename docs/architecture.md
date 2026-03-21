# Elenchus 当前架构说明

> 更新时间：2026-03-21
> 本文档以当前工作区实现为准，重点记录已经落地的 `诡辩实验模式`、会话级资料池和对应的前后端架构变化。

## 1. 当前架构结论

Elenchus 当前不是单一路径的辩论应用，而是一个“共享底座 + 多模式运行链路”的实验平台：

- 底层共享 `Session`、`Runtime Events`、`shared_knowledge`、文件化持久化和 WebSocket 驱动。
- 上层同时承载 `标准辩论模式` 与 `诡辩实验模式`。
- 模式差异主要落在 `Prompt`、`LangGraph`、`UI 视图`、`事件类型` 和 `产物结构` 上，而不是在同一条标准链路上堆叠条件判断。

这意味着当前架构的设计重点已经从“单一辩论流程”转向“模式化运行时”。

## 2. 系统总览

```text
Browser UI
├─ React 19 + Zustand
├─ REST 调用
└─ WebSocket 实时事件
   │
   ▼
FastAPI Backend
├─ /api/sessions        会话创建、读取、删除、导出、文档接口
├─ /api/ws/{session_id} 运行控制、事件推送、介入
├─ /api/models          Provider / 模型配置
├─ /api/search          搜索配置与健康检查
└─ /api/log             日志配置
   │
   ▼
Service Layer
├─ session_service
├─ runtime_event_service
├─ builtin_reference_service
├─ document_service
├─ reference_library_service
└─ provider / connection helpers
   │
   ▼
LangGraph Runtime
├─ standard graph
│  ├─ debater / judge
│  ├─ team_discussion / jury_discussion
│  └─ search_tool / llm_router
└─ sophistry graph
   ├─ sophistry_debater
   ├─ sophistry_observer
   └─ sophistry_prompt_loader
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

## 3. 模式架构

### 3.1 两种模式的职责分离

| 维度 | 标准辩论模式 | 诡辩实验模式 |
| --- | --- | --- |
| 目标 | 尽量接近求真式辩论 | 观察修辞操控、谬误识别与叙事漂移 |
| Prompt | 标准 debater / judge / jury prompt | 独立 sophistry prompt |
| Graph | 标准 graph | 独立 `sophistry_graph.py` |
| 搜索 | 可启用 | 完全禁用 |
| 裁判 / 陪审团 | 启用 | 不启用 |
| 结果 | 分数、裁判结论、陪审团讨论 | 观察报告、总览报告 |
| UI | 标准聊天与评分面板 | 淡黄色实验界面与观察面板 |
| 公共知识 | 用户资料 + 共享知识 | 用户资料 + 内置谬误库 + 共享知识 |

### 3.2 为什么要独立成模式

诡辩实验模式不适合做成标准模式里的几个布尔开关，原因有三点：

- 它的目标不是求真，也不是给出裁判判断。
- 它需要独立的 prompt 约束来鼓励“看起来合理的诡辩”而不是纯噪声输出。
- 它需要独立 graph，避免在标准 `graph.py` 里堆叠大量 `if debate_mode == ...`。

当前实现采取的策略是：

- 共享底层存储、事件总线和会话模型。
- 在 engine 层按 `debate_mode` 切换 graph。
- 在 agents / prompts / UI 层做独立分支。

## 4. 数据模型变化

### 4.1 Session Schema

后端 `backend/app/models/schemas.py` 为模式化运行引入了以下关键字段：

- `DebateMode`
  - `standard`
  - `sophistry_experiment`
- `SessionCreate.debate_mode`
- `SessionCreate.mode_config`
- `SessionResponse.debate_mode`
- `SessionResponse.mode_config`

当前还定义了 `SophistryModeConfig`，默认包含：

- `seed_reference_enabled`
- `observer_enabled`
- `artifact_detail_level`

当前实际运行时对该模式的默认初始化为：

- 自动加载内置谬误库
- 开启观察员
- 生成完整模式产物

### 4.2 Session Snapshot

`session.json` 的快照结构为了支持诡辩模式新增了：

- `debate_mode`
- `mode_config`
- `mode_artifacts`
- `current_mode_report`
- `final_mode_report`
- `builtin_reference_docs`

这些字段的职责分别是：

- `mode_artifacts`：累积保存每轮与整场模式产物。
- `current_mode_report`：本轮最近一次观察报告。
- `final_mode_report`：整场结束后的最终报告。
- `builtin_reference_docs`：记录已注入的内置文档，避免重复灌入。

### 4.3 Dialogue Role 扩展

对话与产物层新增了模式专用角色：

- `observer`
- `sophistry_round_report`
- `sophistry_final_report`

这让模式产物可以直接进入通用的 `dialogue_history`，同时又能在前端按角色进行专门渲染。

## 5. 后端实现

### 5.1 会话创建与模式初始化

关键文件：

- `backend/app/services/session_service.py`
- `backend/app/runtime/session_repository.py`

当前初始化逻辑会根据 `debate_mode` 生成不同默认配置：

- 标准模式保留原有团队讨论、陪审团、推理增强等默认链路。
- 诡辩实验模式写入独立的 `mode_config`，并初始化模式产物容器。

在 session 快照中，诡辩模式会额外保证以下字段存在：

- `mode_artifacts: []`
- `current_mode_report: null`
- `final_mode_report: null`
- `builtin_reference_docs: []`

### 5.2 Engine 选型

关键文件：

- `backend/app/runtime/engines/langgraph.py`

`LangGraphDebateEngine` 现在会按 `debate_mode` 选择不同编译入口：

- 标准模式：标准 graph
- 诡辩实验模式：`compile_sophistry_graph`

这是模式解耦的核心分叉点之一。Engine 不需要理解太多业务细节，只负责把同一个 session 驱动到不同 graph。

### 5.3 内置谬误库注入

关键文件：

- `backend/app/services/builtin_reference_service.py`
- `docs/sophistry-fallacy-catalog.md`

诡辩实验模式每次启动时，都会把内置谬误目录注入当前 session。当前实现有几个关键点：

- 固定文档 ID：`builtin-sophistry-fallacy-catalog`
- 只在 `debate_mode == sophistry_experiment` 时注入
- 已存在时会跳过重复注入
- 注入结果会同步写入：
  - `documents/<document_id>.json`
  - `reference_entries/<document_id>.json`
  - `shared_knowledge`
  - `builtin_reference_docs`

这样做的收益是：

- 辩手和观察员使用同一套谬误标签体系。
- 不依赖在线搜索或临时上传资料。
- 可离线运行，可回放，可复现。

### 5.4 独立 Prompt 体系

关键文件：

- `backend/app/agents/sophistry_prompt_loader.py`
- `backend/prompts/sophistry/debater_system.md`
- `backend/prompts/sophistry/debater_proposer.md`
- `backend/prompts/sophistry/debater_opposer.md`
- `backend/prompts/sophistry/observer_system.md`

当前诡辩模式 prompt 的原则不是放任模型“耍赖”，而是要求它做出可分析、可拆解、可比较的修辞动作。核心约束包括：

- 优先使用看起来像合理论证的诡辩。
- 避免纯辱骂、胡搅蛮缠、无意义重复。
- 尽量让观察员有可分析空间。
- 主动指出对手的谬误并附带短引文。
- 不输出 URL，不伪造来源，不假装检索过资料。
- 不调用工具，不描述搜索计划。

观察员 prompt 的任务不是判输赢，而是产出结构化观察报告，包括：

- 本轮叙事如何漂移
- 哪些谬误出现了
- 哪些指控有证据支撑
- 哪些指控本身也带操控性
- 双方下一轮最容易被打击的薄弱点

### 5.5 独立 Graph

关键文件：

- `backend/app/agents/sophistry_graph.py`
- `backend/app/agents/sophistry_debater.py`
- `backend/app/agents/sophistry_observer.py`

诡辩实验模式当前 graph 为：

```text
manage_context
  -> set_speaker
  -> sophistry_speaker
  -> set_speaker
  -> sophistry_speaker
  -> sophistry_observer
  -> advance_turn
  -> manage_context / sophistry_postmortem
```

关键性质：

- 每一轮先让正反双方都发言，再进入观察员节点。
- `should_route_after_set_speaker` 只要存在 `current_speaker` 就继续走 `speaker`，避免反方被跳过。
- 不存在 `judge`、`jury_discussion`、`tool_executor`、`consensus` 路径。
- 结束后进入 `sophistry_postmortem` 生成整场总览。

### 5.6 Runtime Event 与编排

关键文件：

- `backend/app/runtime/event_emitter.py`
- `backend/app/runtime/orchestrator.py`

诡辩模式新增并复用了以下事件：

- `mode_notice`
- `speech_start`
- `speech_token`
- `speech_end`
- `sophistry_round_report`
- `sophistry_final_report`

运行时职责分工如下：

- `orchestrator` 识别模式专用节点并把报告写回会话状态。
- `event_emitter` 为 `sophistry_speaker`、`sophistry_observer`、`sophistry_postmortem` 提供状态文案与节点映射。
- `debate_complete` 事件会携带 `final_report`，让前端在会话结束时直接拿到整场总览。

## 6. 前端实现

### 6.1 创建会话

关键文件：

- `frontend/src/components/HomeView.tsx`
- `frontend/src/hooks/useSessionCreate.ts`
- `frontend/src/types/index.ts`

当前前端首页已经支持模式选择：

- `标准辩论`
- `诡辩实验模式`

当用户切到诡辩模式时，界面会：

- 展示风险提示卡
- 隐藏陪审团相关配置
- 隐藏标准模式的 reasoning 增强配置
- 标记本模式搜索已禁用
- 在创建 session 时发送 `debate_mode = sophistry_experiment`

### 6.2 会话界面

关键文件：

- `frontend/src/components/ChatPanel.tsx`
- `frontend/src/index.css`

诡辩模式的会话界面具备以下专门处理：

- 顶部显示实验提醒条
- 使用淡黄色主题色
  - `--mode-sophistry-bg: #fcfaf8`
  - `--mode-sophistry-card`
  - `--mode-sophistry-border`
  - `--mode-sophistry-accent`
- 不再使用包住整块消息区的大圆角底框
- 提醒条文字做了压缩与截断处理，避免把其他 UI 挤乱

### 6.3 消息区与观察报告

关键文件：

- `frontend/src/components/chat/MessageRow.tsx`
- `frontend/src/utils/groupDialogue.ts`

诡辩观察报告不会混在普通辩手气泡里，而是复用“标准模式裁判评分所在的右侧区域”：

- `sophistry_round_report` 优先挂载到本轮最后一个发言 agent row 的右栏
- `sophistry_final_report` 没有对应 agent row 时也右对齐显示
- 该区域不再显示评分网格，而是显示观察员报告卡

这保证了：

- 视觉位置对用户是稳定的
- 标准模式和诡辩模式都能复用同一块右侧信息区
- 用户不会把观察报告误认为普通聊天气泡

### 6.4 运行图、时间线与事件映射

关键文件：

- `frontend/src/utils/liveGraph.ts`
- `frontend/src/components/chat/LiveGraph.tsx`
- `frontend/src/components/chat/ExecutionTimeline.tsx`
- `frontend/src/utils/runtimeEventDictionary.ts`
- `frontend/src/utils/eventFocus.ts`

前端现在会根据 `debate_mode` 切换运行图定义：

- 标准模式使用原有 graph
- 诡辩模式使用专属节点：
  - `manage_context`
  - `set_speaker`
  - `sophistry_speaker`
  - `sophistry_observer`
  - `advance_turn`
  - `sophistry_postmortem`
  - `end`

时间线和事件聚焦也已适配：

- `speech_*` 在诡辩模式下映射到 `sophistry_speaker`
- `sophistry_round_report` 映射到 `sophistry_observer`
- `sophistry_final_report` 映射到 `sophistry_postmortem`

### 6.5 Store 与回放

关键文件：

- `frontend/src/stores/debateStore.ts`

Store 当前会把模式产物同时落到三处：

- `dialogue_history`
- `mode_artifacts`
- `current_mode_report` / `final_mode_report`

因此无论是实时运行、历史恢复还是回放模式，前端都能重新拼出诡辩模式的完整视图。

## 7. 持久化模型

### 7.1 根目录

```text
runtime/
├─ backend/.env
├─ backend/config.yaml
├─ data/log_config.json
├─ elenchus.db
├─ logs/
└─ sessions/<session_id>/
```

### 7.2 单个 Session

```text
runtime/sessions/<session_id>/
├─ session.json
├─ events.jsonl
├─ rounds/
│  ├─ round-001.json
│  └─ round-002.json
├─ documents/
│  ├─ builtin-sophistry-fallacy-catalog.json
│  └─ <document_id>.json
└─ reference_entries/
   ├─ builtin-sophistry-fallacy-catalog.json
   └─ <document_id>.json
```

与诡辩模式直接相关的数据包括：

- `session.json`
  - `debate_mode`
  - `mode_config`
  - `shared_knowledge`
  - `mode_artifacts`
  - `current_mode_report`
  - `final_mode_report`
  - `builtin_reference_docs`
- `events.jsonl`
  - `mode_notice`
  - `sophistry_round_report`
  - `sophistry_final_report`
- `rounds/*.json`
  - 当前轮的模式报告摘要

## 8. 测试覆盖

本次模式化改动已补齐一组有针对性的测试，覆盖后端 graph、事件、持久化和前端渲染：

- 后端
  - `backend/tests/test_sophistry_graph.py`
  - `backend/tests/test_builtin_reference_service.py`
  - `backend/tests/test_langgraph_engine.py`
  - `backend/tests/test_runtime_event_emitter.py`
  - `backend/tests/test_orchestrator_status_events.py`
  - `backend/tests/test_session_service.py`
- 前端
  - `frontend/src/stores/debateStore.replay.test.ts`
  - `frontend/src/utils/groupDialogue.test.ts`
  - `frontend/src/utils/runtimeEventDictionary.test.ts`
  - `frontend/src/utils/liveGraph.test.ts`
  - `frontend/src/utils/eventFocus.test.ts`
  - `frontend/src/components/chat/MessageRow.test.tsx`

## 9. 当前边界

诡辩实验模式当前明确不做这些事情：

- 不提供裁判评分
- 不启用陪审团讨论
- 不宣布胜负
- 不暴露搜索入口
- 不允许工具调用
- 不复用标准模式的 `judge` / `jury` / `consensus` 流程

这不是缺失，而是模式边界的一部分。它的价值在于把修辞操控本身变成实验对象，而不是继续把它伪装成求真流程。

## 10. 相关文档

- [`README.md`](../README.md)：项目总览与模式入口
- [`sophistry-experiment-mode-design.md`](./sophistry-experiment-mode-design.md)：模式设计文档
- [`sophistry-fallacy-catalog.md`](./sophistry-fallacy-catalog.md)：内置谬误目录
