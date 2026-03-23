# 系统架构总览

> 更新时间：2026-03-23
> 本文档聚焦当前系统的整体架构、核心分层与主要代码入口。运行时目录细节请见 [runtime.md](./runtime.md)，模式专属行为请见对应模式文档。

## 1. 架构定位

Elenchus 当前是一个“共享底座 + 多模式运行链路”的多智能体辩论平台。

它的几个核心特征是：

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
└─ runtime/sessions/<session_id>/ files
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

## 4. 模式化运行时

Elenchus 的一个关键架构选择，是把“模式差异”放在运行链路层，而不是在单一流程里堆叠大量条件分支。

### 标准辩论模式

适合常规辩论场景，核心特征包括：

- 标准 debater / judge / jury 流程
- 可配合搜索与常规推理增强
- 产出评分、结论和相关观察结果

### 诡辩实验模式

适合修辞与谬误观察场景，核心特征包括：

- 独立 prompt 与独立 graph
- 不启用评分、陪审团与搜索工具
- 输出观察报告和整场复盘，而不是胜负结论
- 自动注入内置谬误库到当前会话资料池

详细边界与用户可见行为见：[sophistry-experiment-mode-design.md](./sophistry-experiment-mode-design.md)

## 5. 后端核心模块

### API 层

- `backend/app/api/sessions.py`：会话 CRUD、导出与资料接口
- `backend/app/api/websocket.py`：WebSocket 会话控制与事件收发
- `backend/app/api/models.py`：provider / 模型配置
- `backend/app/api/search.py`：搜索配置与健康检查
- `backend/app/api/log.py`：日志配置

### Services 层

- `backend/app/services/session_service.py`：会话主服务，负责状态组织与存取
- `backend/app/services/provider_service.py`：provider 存储与密钥处理
- `backend/app/services/document_service.py`：会话文档上传与读取
- `backend/app/services/reference_library_service.py`：结构化资料条目与同步逻辑
- `backend/app/services/builtin_reference_service.py`：模式内置参考文档注入

### Agents / Runtime 层

- `backend/app/agents/graph.py`：标准模式 graph
- `backend/app/agents/sophistry_graph.py`：诡辩实验模式 graph
- `backend/app/agents/debater.py` / `judge.py`：标准模式节点
- `backend/app/agents/sophistry_debater.py` / `sophistry_observer.py`：实验模式节点
- `backend/app/runtime/orchestrator.py`：运行协调
- `backend/app/runtime/event_emitter.py`：事件映射与推送
- `backend/app/runtime/engines/langgraph.py`：按模式装配并运行 LangGraph engine

## 6. 前端核心模块

### 会话与实时数据流

- `frontend/src/hooks/useDebateWebSocket.ts`：管理连接、重连、消息分发
- `frontend/src/stores/debateStore.ts`：会话、事件、回放与观察状态的单一数据源
- `frontend/src/api/client.ts`：REST 请求入口

### 主要界面

- `frontend/src/components/HomeView.tsx`：首页与会话创建入口
- `frontend/src/components/ChatPanel.tsx`：聊天主视图
- `frontend/src/components/chat/ExecutionTimeline.tsx`：执行时间线
- `frontend/src/components/chat/LiveGraph.tsx`：运行图
- `frontend/src/components/chat/RuntimeInspector.tsx`：运行观察器容器
- `frontend/src/components/chat/MessageRow.tsx`：消息行与右侧观察区渲染

## 7. 持久化与回放

系统持久化由两部分组成：

- 数据库：保存后端需要的结构化持久化数据
- `runtime/sessions/<session_id>/`：保存会话快照、事件流、按轮结果与资料池文件

这套设计使得系统可以同时支持：

- 实时运行
- 历史恢复
- 基于事件的回放
- 模式专属产物展示

运行时目录结构与文件职责请见：[runtime.md](./runtime.md)

## 8. 会话资料池与内置文档

当前会话资料池支持两类来源：

- 用户上传的参考文档
- 模式自动注入的内置文档

资料在运行时会以文档记录和结构化条目形式保存，并可同步到 `shared_knowledge`，供辩手和模式节点消费。

相关文档：

- [会话级资料池实现说明](./session-reference-library-implementation.md)
- [会话级资料池 MVP 规划](./session-reference-library-mvp-plan.md)
- [诡辩实验模式谬误库](./sophistry-fallacy-catalog.md)

## 9. 关键架构边界

当前架构有几条明确边界：

- 项目入口与快速了解内容放在根 `README.md`
- 详细技术说明集中在 `docs/`
- `runtime/` 保存运行时生成内容，不作为源码结构的一部分
- 模式专属规则放在各自模式文档，不在架构文档中重复展开
- 前后端目录内的 README 仅保留轻量入口，不再承担完整开发手册职责

## 10. 继续阅读

- [快速开始](./getting-started.md)
- [运行时与回放](./runtime.md)
- [诡辩实验模式说明](./sophistry-experiment-mode-design.md)
- [后端开发指南](./guides/backend-development.md)
- [前端开发指南](./guides/frontend-development.md)
