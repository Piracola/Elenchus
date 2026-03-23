# 后端开发指南

本文档聚焦 Elenchus 后端的本地开发、测试、关键环境变量和主要代码入口。

## 1. 技术栈

- FastAPI
- LangGraph
- SQLAlchemy Async + SQLite
- WebSocket

## 2. 本地启动

### Windows PowerShell

```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
```

### macOS / Linux

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python -m uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
```

如果你只是想快速跑起来，优先使用仓库根目录启动脚本，见：[../getting-started.md](../getting-started.md)

## 3. 测试命令

安装测试依赖：

```bash
pip install -r requirements-dev.txt
```

运行全部测试：

```bash
pytest
```

运行单个测试文件：

```bash
pytest tests/test_graph.py
```

## 4. 关键环境变量

模板文件：`backend/.env.example`

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
- `ELENCHUS_ENCRYPTION_KEY` 在本地首次运行时可自动准备；生产环境应显式配置。
- provider API key 不在仓库 `.env` 中维护，而是在 Web UI 中配置并加密存储。
- 当 `DATABASE_URL` 使用相对 SQLite 路径时，运行时会把它归一化到 `runtime/` 目录下。

## 5. 运行时相关路径

后端运行时数据统一写入仓库根目录 `runtime/`，包括：

- `runtime/backend/.env`
- `runtime/backend/config.yaml`
- `runtime/elenchus.db`
- `runtime/logs/`
- `runtime/sessions/<session_id>/...`

详细目录职责见：[../runtime.md](../runtime.md)

## 6. 关键入口文件

- `backend/app/main.py`：应用入口
- `backend/app/config.py`：配置加载
- `backend/app/services/session_service.py`：会话状态与会话生命周期主服务
- `backend/app/api/sessions.py`：会话接口
- `backend/app/api/websocket.py`：WebSocket 会话控制
- `backend/app/agents/graph.py`：标准模式 graph
- `backend/app/agents/sophistry_graph.py`：诡辩实验模式 graph

## 7. 开发时最常见的阅读路径

如果你第一次接手后端，建议按这个顺序读：

1. `backend/app/main.py`
2. `backend/app/api/sessions.py`
3. `backend/app/api/websocket.py`
4. `backend/app/services/session_service.py`
5. `backend/app/agents/graph.py`
6. `backend/app/agents/sophistry_graph.py`
7. `backend/app/runtime/` 相关实现

## 8. 常见开发任务

### 查看 API

启动后访问：

- `http://localhost:8001/docs`

### 调试模式与会话状态

优先同时查看：

- API 返回
- WebSocket 事件
- `runtime/sessions/<session_id>/` 下的会话文件

### 排查资料池与回放问题

优先检查：

- `session.json`
- `events.jsonl`
- `documents/`
- `reference_entries/`

## 9. 关联文档

- [系统架构总览](../architecture.md)
- [运行时与回放](../runtime.md)
- [快速开始](../getting-started.md)
- [会话级资料池实现说明](../session-reference-library-implementation.md)
