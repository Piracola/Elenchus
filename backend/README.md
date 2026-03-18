# Elenchus Backend

这是 Elenchus 的后端部分，主要技术栈：

- FastAPI
- LangGraph
- SQLAlchemy Async + SQLite
- WebSocket
- pytest

后端负责：

- 创建和管理辩论会话
- 驱动多智能体辩论流程
- 保存会话、评分和模型配置
- 提供 REST API / WebSocket
- 加密保存模型提供商 API Key

## 目录结构

```text
backend/
├─ app/
│  ├─ api/           HTTP / WebSocket 接口
│  ├─ agents/        辩手、裁判、图编排、LLM 调用
│  ├─ runtime/       运行时调度、事件网关、任务管理
│  ├─ services/      会话、模型配置、导出、连接管理等服务
│  ├─ search/        搜索引擎适配层
│  ├─ db/            数据库模型与连接
│  ├─ models/        Pydantic 模型
│  └─ main.py        FastAPI 入口
├─ tests/
├─ requirements.txt
├─ requirements-dev.txt
├─ .env.example
└─ config.yaml
```

## 最快启动方式

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

启动后可访问：

- Swagger：`http://localhost:8001/docs`
- 健康检查：`http://localhost:8001/health`

## `.env` 现在怎么处理

如果没有 `backend/.env`，你可以先复制模板：

Windows PowerShell：

```powershell
Copy-Item .env.example .env
```

macOS / Linux：

```bash
cp .env.example .env
```

但现在有个重要变化：

- `ELENCHUS_ENCRYPTION_KEY` 不需要你手工生成
- 后端首次启动时会自动生成并写回 `backend/.env`

也就是说，第一次启动后端时，这一项会被自动补齐。

## `ELENCHUS_ENCRYPTION_KEY` 到底加密了什么

它不是在加密整个数据库。

当前它只用于加密保存在本地数据库里的模型提供商 API Key，也就是 `providers` 表里的密钥字段。

这样做的目的不是提供强对抗级安全，而是避免 API Key 明文落盘。

## 常见环境变量

```env
ELENCHUS_ENCRYPTION_KEY=
SEARXNG_BASE_URL=http://localhost:8080
TAVILY_API_KEY=
DATABASE_URL=sqlite+aiosqlite:///./elenchus.db
HOST=0.0.0.0
PORT=8001
DEBUG=false
```

说明：

- `ELENCHUS_ENCRYPTION_KEY`：可留空，首次启动自动生成
- `SEARXNG_BASE_URL`：可选，接自建搜索时再填
- `TAVILY_API_KEY`：可选，接 Tavily 时再填
- `DATABASE_URL`：默认 SQLite，一般先不用改

## 常用命令

### 启动开发服务

```bash
python -m uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
```

### 安装测试依赖

```bash
pip install -r requirements-dev.txt
```

### 跑全部测试

```bash
pytest
```

### 不生成 pytest 缓存目录

```bash
pytest -p no:cacheprovider
```

### 跑单个测试文件

```bash
pytest backend/tests/test_session_service.py
pytest backend/tests/test_judge.py
pytest backend/tests/test_provider_service.py
```

## 后端代码建议先看哪里

如果你第一次接手后端，推荐阅读顺序：

1. `app/main.py`
2. `app/api/websocket.py`
3. `app/runtime/service.py`
4. `app/runtime/orchestrator.py`
5. `app/agents/graph.py`
6. `app/agents/debater.py`
7. `app/agents/judge.py`

## 常见问题

### 1. 启动时报加密密钥错误

现在如果 `.env` 里缺少密钥，系统会自动生成。

如果仍然报错，通常说明：

- 你手动写入了一个无效的 `ELENCHUS_ENCRYPTION_KEY`
- 或者这个 key 被改坏了

这种情况下不要让系统自动覆盖旧 key，因为那会导致已有加密 API Key 无法解密。应当修正原来的 key，或者删除本地 providers 数据后重新配置。

### 2. 后端正常启动，但前端保存模型时报错

优先检查：

- `http://localhost:8001/docs` 是否正常
- `http://localhost:8001/health` 是否正常
- 你是否误改过 `ELENCHUS_ENCRYPTION_KEY`

### 3. 搜索配置获取失败

可以直接检查：

- `http://localhost:8001/api/search/config`
- `.env` 中的搜索配置是否正确
- 自定义搜索服务是否可达
