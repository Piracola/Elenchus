# 系统架构总览

> 更新时间：2026-03-26
> 本文档聚焦**当前系统如何组织**：系统分层、前后端职责、模式化运行链路与关键代码入口。
> `runtime/` 目录结构、`session.json` / `events.jsonl` / `documents/` / `reference_entries/` 的职责请见 [runtime.md](./runtime.md)。

## 1. 架构定位

Elenchus 当前是一个“共享底座 + 多模式运行链路”的多智能体辩论平台。

它的核心特征是：

- 共享会话模型、事件流、持久化与前端观察界面
- 按模式切换不同的 prompt、graph、事件映射与产物形态
- 通过 REST + WebSocket 组合实现创建、控制、实时推送与回放

当前主线模式包括：

- **标准辩论模式**：保留常规辩论流程、评分与观察能力
- **诡辩实验模式**：独立实验链路，用于观察修辞操控、谬误标签与叙事漂移

## 2. 系统分层

```text
Browser UI
├─ React 19 + Zustand
├─ REST 请求
└─ WebSocket 实时事件
   │
   ▼
FastAPI Backend
├─ Session / Model / Search / Log APIs
├─ WebSocket 会话控制
└─ Runtime orchestration
   │
   ▼
Service Layer
├─ session_service
├─ document / reference services
├─ provider service
└─ runtime helpers
   │
   ▼
LangGraph Runtime
├─ standard graph
└─ sophistry graph
   │
   ▼
Persistence
├─ SQLite database
└─ runtime session artifacts
```

## 3. 前后端职责

### 前端

前端负责：

- 创建与切换会话
- 展示消息流、时间线、运行图、记忆面板
- 管理模型配置、搜索配置和界面设置
- 接收 WebSocket 事件并驱动实时渲染
- 读取历史状态并支持回放

关键入口：

- `frontend/src/components/HomeView.tsx`
- `frontend/src/components/ChatPanel.tsx`
- `frontend/src/hooks/useDebateWebSocket.ts`
- `frontend/src/stores/debateStore.ts`
- `frontend/src/components/chat/RuntimeInspector.tsx`

### 后端

后端负责：

- 会话创建、读取、删除与导出
- WebSocket 启动、停止、介入和事件推送
- 模型 provider 配置与搜索配置
- LangGraph 运行编排
- 会话持久化、资料池处理与模式初始化

关键入口：

- `backend/app/main.py`
- `backend/app/api/sessions.py`
- `backend/app/api/websocket.py`
- `backend/app/services/session_service.py`
- `backend/app/runtime/orchestrator.py`
- `backend/app/runtime/engines/langgraph.py`

## 4. 模式化运行链路

Elenchus 的一个关键架构选择，是把“模式差异”放在运行链路层，而不是在单一流程里堆叠大量条件分支。

### 标准辩论模式

适合常规辩论场景，核心特征包括：

- 标准 debater / judge / jury 流程
- 可配合搜索与常规推理增强
- 产出评分、结论和相关观察结果

对应核心入口：

- `backend/app/agents/graph.py`
- `backend/app/agents/debater.py`
- `backend/app/agents/judge.py`

### 诡辩实验模式

适合修辞与谬误观察场景，核心特征包括：

- 独立 prompt 与独立 graph
- 不启用评分、陪审团与搜索工具
- 输出观察报告和整场复盘，而不是胜负结论
- 自动注入内置谬误库到当前会话资料池

对应核心入口：

- `backend/app/agents/sophistry_graph.py`
- `backend/app/agents/sophistry_debater.py`
- `backend/app/agents/sophistry_observer.py`

详细边界与用户可见行为见：[sophistry-experiment-mode-design.md](./sophistry-experiment-mode-design.md)

## 5. 核心模块入口

### API 层

- `backend/app/api/sessions.py`：会话 CRUD、导出入口与子路由聚合
- `backend/app/api/session_documents.py`：会话文档上传、列表、详情、删除与资料池接口
- `backend/app/api/session_runtime.py`：运行事件分页与快照导出接口
- `backend/app/api/websocket.py`：WebSocket 会话控制与事件收发
- `backend/app/api/models.py`：provider / 模型配置
- `backend/app/api/search.py`：搜索配置与健康检查
- `backend/app/api/log.py`：日志配置

### 服务层

- `backend/app/services/session_service.py`：会话主服务，负责 CRUD、更新入口与会话记录落盘
- `backend/app/services/session_service_helpers.py`：会话配置默认值、快照清洗与轮次辅助逻辑
- `backend/app/services/session_service_serializers.py`：会话记录序列化与轮次结果物化
- `backend/app/services/session_document_workflow.py`：会话文档上传后的预处理编排
- `backend/app/services/provider_service.py`：provider 配置应用服务与默认项规则
- `backend/app/services/provider_config_store.py`：provider 配置存储访问
- `backend/app/services/provider_serializers.py`：provider 配置排序、时间解析与响应映射
- `backend/app/services/document_service.py`：会话文档上传与读取
- `backend/app/services/reference_library_service.py`：结构化资料条目查询与删除入口
- `backend/app/services/reference_library_workflow.py`：资料预处理工作流与失败回滚
- `backend/app/services/reference_library_serializers.py`：资料文档与条目序列化
- `backend/app/services/reference_library_knowledge.py`：资料池到 shared knowledge 的同步逻辑
- `backend/app/services/builtin_reference_service.py`：模式内置参考文档注入
- `backend/app/services/export_service.py`：导出入口与 Markdown/文件名格式化
- `backend/app/services/export_runtime_service.py`：运行事件快照导出与校验摘要

### 运行层

- `backend/app/runtime/orchestrator.py`：运行协调
- `backend/app/runtime/engines/langgraph.py`：按模式装配并运行 LangGraph engine
- `backend/app/runtime/bus.py`：运行事件广播与持久化总线
- `backend/app/runtime/session_repository.py`：会话运行态读写

### 前端主路径

- `frontend/src/components/HomeView.tsx`：首页与会话创建入口
- `frontend/src/components/ChatPanel.tsx`：聊天主视图
- `frontend/src/components/ChatPanel.history.test.tsx`：长历史会话渲染与观察器联动回归测试入口
- `frontend/src/components/chat/ExecutionTimeline.tsx`：执行时间线
- `frontend/src/components/chat/LiveGraph.tsx`：运行图
- `frontend/src/components/chat/RuntimeInspector.tsx`：运行观察器容器
- `frontend/src/api/client.ts`：REST 请求入口
- `frontend/src/utils/textRepair.ts`：前端用户可见文本的乱码兜底修复
- `frontend/src/components/chat/referenceLibrary/`：参考资料面板拆分后的共享逻辑、状态 hook 与弹层展示
- `frontend/src/components/sidebar/settings/`：设置面板拆分后的显示/日志/服务商子模块

### 编码治理链路

- `frontend/index.html`：前端页面 UTF-8 编码声明
- `frontend/src/components/HomeView.tsx`、`frontend/src/types/scoring.ts`：首页与评分维度文案的直接显示入口
- `frontend/src/components/chat/ExecutionTimeline.tsx`：运行事件快照导入时的 UTF-8 / GB18030 解码回退
- `backend/app/api/sessions.py`：会话 JSON 导出响应头
- `backend/app/api/session_runtime.py`：运行事件快照导出响应头
- `backend/app/services/document_service.py`：上传文本文件的多编码兼容解码
- `backend/app/text_repair.py`：后端用户可见文本归一化与乱码修复

## 6. 会话资料池在架构中的位置

当前会话资料池支持两类来源：

- 用户上传的参考文档
- 模式自动注入的内置文档

其职责边界是：

- 文档与结构化资料作为会话级输入能力存在
- 高价值资料可同步进共享知识，供运行链路消费
- 资料池具体文件落点、快照关系与回放边界不在本文档展开

相关文档：

- [会话级资料池实现说明](./session-reference-library-implementation.md)
- [会话级资料池 MVP 规划](./session-reference-library-mvp-plan.md)
- [运行时与回放](./runtime.md)

## 7. 文档边界

当前架构文档只负责回答下面这些问题：

- 系统分成哪些层
- 前后端分别负责什么
- 不同模式的运行链路如何分开
- 应该从哪些源码入口理解系统

下列内容请改读对应文档：

- 如何启动项目：读 [getting-started.md](./getting-started.md)
- `runtime/` 目录和回放文件职责：读 [runtime.md](./runtime.md)
- 资料池文件与同步细节：读 [session-reference-library-implementation.md](./session-reference-library-implementation.md)
- 架构收敛的历史决策背景：读 [../PLATFORM_SIMPLIFICATION_PLAN.md](../PLATFORM_SIMPLIFICATION_PLAN.md)

## 8. 继续阅读

- [快速开始](./getting-started.md)
- [运行时与回放](./runtime.md)
- [诡辩实验模式说明](./sophistry-experiment-mode-design.md)
- [后端开发指南](./guides/backend-development.md)
- [前端开发指南](./guides/frontend-development.md)
- [编码规范指南](./guides/encoding.md)
