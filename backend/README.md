# Elenchus Backend

后端技术栈：
- FastAPI
- LangGraph
- SQLAlchemy Async + SQLite
- WebSocket

## 本地开发启动

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

## 运行时数据目录（统一）

后端运行时不再依赖 `backend/.env` 与 `backend/elenchus.db`。
默认统一写入仓库根目录 `runtime/`：

- `runtime/backend/.env`
- `runtime/backend/config.yaml`
- `runtime/elenchus.db`
- `runtime/logs/`
- `runtime/data/log_config.json`

可通过环境变量覆盖：
- `ELENCHUS_RUNTIME_DIR=<自定义目录>`

## 环境变量

模板文件：`backend/.env.example`

常用变量：
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
- `ELENCHUS_ENCRYPTION_KEY` 首次启动会自动生成并写入 `runtime/backend/.env`
- `DATABASE_URL` 使用相对 SQLite 路径时，会自动归一化到 `runtime/` 下

## 测试

安装测试依赖：
```bash
pip install -r requirements-dev.txt
```

运行测试：
```bash
pytest
```

## 关键入口

- 应用入口：[backend/app/main.py](./app/main.py)
- 配置加载：[backend/app/config.py](./app/config.py)
- 运行时路径：[backend/app/runtime_paths.py](./app/runtime_paths.py)
- 打包入口：[backend/run_packaged.py](./run_packaged.py)
