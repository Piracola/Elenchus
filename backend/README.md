# Elenchus Backend

这是 Elenchus 的后端部分，技术栈主要是：

- FastAPI
- LangGraph
- SQLAlchemy Async + SQLite
- WebSocket
- pytest

后端负责的事情包括：

- 创建和管理辩论会话
- 驱动多智能体辩论流程
- 持久化会话、评分、模型配置
- 提供 REST API 和 WebSocket
- 提供搜索配置、导出、运行时事件等能力

## 后端目录大致在做什么

```text
backend/
├─ app/
│  ├─ api/           HTTP / WebSocket 接口
│  ├─ agents/        辩手、裁判、图编排、LLM 调用
│  ├─ runtime/       运行时调度、事件网关、任务管理
│  ├─ services/      会话、模型配置、导出、连接管理等服务
│  ├─ search/        搜索引擎适配层
│  ├─ db/            数据库模型与连接
│  ├─ models/        Pydantic 数据模型
│  └─ main.py        FastAPI 入口
├─ tests/            后端测试
├─ requirements.txt
├─ requirements-dev.txt
├─ .env.example
└─ config.yaml
```

## 如果你只想先把后端跑起来

### 1. 进入后端目录

```bash
cd backend
```

### 2. 创建虚拟环境

Windows PowerShell：

```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
```

macOS / Linux：

```bash
python3 -m venv venv
source venv/bin/activate
```

### 3. 安装依赖

```bash
pip install -r requirements.txt
```

如果你还要跑测试，再额外安装开发依赖：

```bash
pip install -r requirements-dev.txt
```

### 4. 准备环境变量

如果还没有 `backend/.env`，先复制模板：

Windows PowerShell：

```powershell
Copy-Item .env.example .env
```

macOS / Linux：

```bash
cp .env.example .env
```

### 5. 生成加密密钥

后端需要 `ELENCHUS_ENCRYPTION_KEY` 才能正常处理模型提供商配置。

生成方法：

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

把输出结果写进 `backend/.env`：

```env
ELENCHUS_ENCRYPTION_KEY=替换成你刚生成的密钥
```

### 6. 启动后端

```bash
python -m uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
```

启动后可以访问：

- 接口文档：`http://localhost:8001/docs`
- 健康检查：`http://localhost:8001/health`

## 哪些配置是最常用的

`backend/.env` 常见字段：

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

- `ELENCHUS_ENCRYPTION_KEY`：必填
- `SEARXNG_BASE_URL`：可选，接自己的 SearXNG 时再填
- `TAVILY_API_KEY`：可选，接 Tavily 时再填
- `DATABASE_URL`：默认 SQLite，一般先不用改

## 后端常用命令

### 启动开发服务器

```bash
python -m uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
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
```

如果你当前就在 `backend/` 目录里，也可以写成：

```bash
pytest tests/test_session_service.py
```

## 后端主要接口入口

你可以先从这些文件开始看：

- `app/main.py`：FastAPI 应用入口
- `app/api/sessions.py`：会话创建、读取、删除、导出
- `app/api/websocket.py`：实时通信入口
- `app/api/models.py`：模型配置接口
- `app/api/search.py`：搜索配置接口
- `app/runtime/`：运行时调度主逻辑
- `app/agents/graph.py`：辩论图编排入口

## 一条最常见的本地联调路径

如果你要前后端一起调试，通常是这样：

1. 先启动后端
2. 确认 `http://localhost:8001/health` 正常
3. 再启动前端
4. 打开 `http://localhost:5173`
5. 在前端里配置模型提供商
6. 新建一场辩论

## 常见问题

### 1. 启动时报 `ELENCHUS_ENCRYPTION_KEY` 相关错误

说明 `.env` 里没有正确配置这个值。

重新生成：

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

写回 `backend/.env` 后重启服务。

### 2. 后端起来了，但前端设置模型时报错

优先检查：

- `backend/.env` 里是否有有效的 `ELENCHUS_ENCRYPTION_KEY`
- 后端有没有真的启动在 `8001`
- 浏览器访问 `http://localhost:8001/docs` 是否正常

### 3. 搜索配置获取失败

先确认后端本身已启动，再检查：

- `http://localhost:8001/api/search/config` 能否访问
- `.env` 是否写错
- 如果你接了自定义搜索服务，地址是否可达

### 4. 我只想开发后端，不想启动前端

完全可以。

你只需要：

```bash
cd backend
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8001
```

然后直接用：

- Swagger：`/docs`
- 或 Postman / curl
- 或你自己的前端

## 给第一次看后端代码的人一个建议

如果你要快速理解主链路，最推荐的阅读顺序是：

1. `app/main.py`
2. `app/api/websocket.py`
3. `app/runtime/service.py`
4. `app/runtime/orchestrator.py`
5. `app/agents/graph.py`
6. `app/agents/debater.py`
7. `app/agents/judge.py`
