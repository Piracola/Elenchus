# 后端开发指南

本文档聚焦 Elenchus 后端的**开发期信息**：测试、环境变量、运行时路径、关键入口与排查路径。

> 首次安装与完整启动步骤请先读：[快速开始](../getting-started.md)

## 1. 技术栈

- FastAPI
- LangGraph
- SQLAlchemy Async + SQLite
- WebSocket

## 2. 后端开发时最常用的命令

完成首次环境准备后，后端单独开发通常使用下面这些命令：

```bash
cd backend
python -m uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
pytest
pytest tests/test_graph.py
pip install -r requirements-dev.txt
```

说明：

- `pip install -r requirements.txt`、虚拟环境创建、前后端同时启动等首次启动内容统一留在 [快速开始](../getting-started.md)。
- `requirements-dev.txt` 会包含 `requirements.txt`，适合本地开发与测试环境。

## 3. 关键环境变量

运行时环境变量副本默认位于：`runtime/backend/.env`

模板来源：`backend/.env.example`

常见变量：

```env
ELENCHUS_ENCRYPTION_KEY=
SEARXNG_BASE_URL=http://localhost:8080
SEARXNG_API_KEY=
TAVILY_API_KEY=
TAVILY_API_URL=https://api.tavily.com/search
DATABASE_URL=sqlite+aiosqlite:///./elenchus.db
HOST=0.0.0.0
PORT=8001
DEBUG=false
```

补充说明：

- 本地启动时会在 `runtime/backend/.env` 初始化运行时配置。
- `ELENCHUS_ENCRYPTION_KEY` 本地首次运行可自动准备；生产环境应显式配置。
- provider API key 不在仓库 `.env` 中维护，而是在 Web UI 中配置并加密存储。
- 当 `DATABASE_URL` 使用相对 SQLite 路径时，后端会把它归一化到 `runtime/` 目录。

## 4. 运行时相关路径

后端运行时数据统一写入仓库根目录 `runtime/`，重点包括：

- `runtime/backend/.env`
- `runtime/backend/config.yaml`
- `runtime/data/log_config.json`
- `runtime/elenchus.db`
- `runtime/logs/`
- `runtime/sessions/<session_id>/...`

这些路径的文件职责与回放关系见：[运行时与回放](../runtime.md)

## 5. 关键入口文件

### 应用与 API

- `backend/app/main.py`：应用入口
- `backend/app/api/sessions.py`：会话 CRUD、导出与资料接口
- `backend/app/api/websocket.py`：WebSocket 会话控制
- `backend/app/api/models.py`：provider / 模型配置接口
- `backend/app/api/search.py`：搜索配置与健康检查

### 服务层

- `backend/app/services/session_service.py`：会话生命周期主服务
- `backend/app/services/provider_service.py`：provider 存储与密钥处理
- `backend/app/services/document_service.py`：会话文档管理
- `backend/app/services/reference_library_service.py`：结构化资料条目与同步逻辑

### 运行与图编排

- `backend/app/agents/graph.py`：标准模式 graph
- `backend/app/agents/sophistry_graph.py`：诡辩实验模式 graph
- `backend/app/runtime/orchestrator.py`：按模式组织运行流程
- `backend/app/runtime/engines/langgraph.py`：LangGraph 引擎装配
- `backend/app/runtime/bus.py`：运行事件广播与持久化总线
- `backend/app/runtime/session_repository.py`：运行期会话读写入口

## 6. 常见阅读路径

如果你第一次接手后端，推荐按下面顺序阅读：

1. `backend/app/main.py`
2. `backend/app/api/sessions.py`
3. `backend/app/api/websocket.py`
4. `backend/app/services/session_service.py`
5. `backend/app/runtime/orchestrator.py`
6. `backend/app/runtime/engines/langgraph.py`
7. `backend/app/agents/graph.py` 或 `backend/app/agents/sophistry_graph.py`

## 7. 常见开发任务

### 查看 API 文档

启动后访问：

- `http://localhost:8001/docs`

### 排查会话 / 回放问题

优先同时查看：

- API 返回
- WebSocket 事件
- `runtime/sessions/<session_id>/session.json`
- `runtime/sessions/<session_id>/events.jsonl`

### 排查资料池问题

优先查看：

- `runtime/sessions/<session_id>/documents/`
- `runtime/sessions/<session_id>/reference_entries/`
- [会话级资料池实现说明](../session-reference-library-implementation.md)

## 8. 关联文档

- [系统架构总览](../architecture.md)
- [运行时与回放](../runtime.md)
- [快速开始](../getting-started.md)
- [会话级资料池实现说明](../session-reference-library-implementation.md)
