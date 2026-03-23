# Elenchus

Elenchus 是一个用于多智能体辩论与模式化实验的本地优先平台，基于 `FastAPI + LangGraph + React 19` 构建，支持实时流式输出、事件回放、会话资料池，以及面向不同目标的独立辩论模式。

## 核心特性

- **标准辩论模式**：面向常规辩论流程，保留评分、评议与实时观察能力。
- **诡辩实验模式**：独立的实验链路，用于观察修辞操控、谬误标签与叙事漂移。
- **实时流式输出**：通过 WebSocket 推送发言、状态、时间线与运行图事件。
- **回放与恢复**：基于运行时事件与会话快照恢复历史过程。
- **会话资料池**：支持上传会话参考资料，并可注入模式内置文档。

## 快速启动

### 前提

- Python 3.10+
- Node.js 18+

### 一键启动

Windows：

```powershell
start.bat
```

或：

```powershell
.\start.ps1
```

macOS / Linux：

```bash
chmod +x ./start.sh
./start.sh
```

默认地址：

- 前端：`http://localhost:5173`
- 后端：`http://localhost:8001`

首次使用时，打开 Web UI 后需要先在模型配置中添加可用的 provider。

更完整的启动与联调说明见：[docs/getting-started.md](./docs/getting-started.md)

## 文档导航

- [文档首页](./docs/README.md)
- [快速开始](./docs/getting-started.md)
- [系统架构总览](./docs/architecture.md)
- [运行时与回放](./docs/runtime.md)
- [诡辩实验模式说明](./docs/sophistry-experiment-mode-design.md)
- [后端开发指南](./docs/guides/backend-development.md)
- [前端开发指南](./docs/guides/frontend-development.md)

## 项目结构概览

- `frontend/`：React + Vite 前端，负责创建会话、实时观察、聊天与回放界面。
- `backend/`：FastAPI + LangGraph 后端，负责运行编排、API、会话存储与事件流。
- `docs/`：详细文档入口，包括架构、运行时、模式与开发指南。
- `runtime/`：本地运行时生成内容，包括数据库、日志、会话快照与事件文件。

如果你只是第一次了解这个项目，先读本页；如果你准备开发或排查问题，请从 [docs/README.md](./docs/README.md) 进入详细文档。
