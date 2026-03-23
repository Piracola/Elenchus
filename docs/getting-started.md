# 快速开始

本文档聚焦“如何把 Elenchus 跑起来”。如果你只是想先用起来，从这里开始即可。

> 说明：这是仓库内**唯一完整启动文档**。`backend/README.md`、`frontend/README.md` 与开发指南只保留目录定位和开发期补充信息，不再重复完整启动手册。

## 1. 环境要求

- Python 3.10+
- Node.js 18+
- npm

## 2. 一键启动

项目根目录提供启动脚本，会自动完成环境检查、依赖安装、运行时目录初始化，并启动服务。

### Windows

```powershell
start.bat
```

或：

```powershell
.\start.ps1
```

可选参数：

```powershell
.\start.ps1 --skip-install
.\start.ps1 --backend-only
.\start.ps1 --frontend-only
```

### macOS / Linux

```bash
chmod +x ./start.sh
./start.sh
```

可选参数：

```bash
./start.sh --skip-install
./start.sh --backend-only
./start.sh --frontend-only
```

## 3. 默认地址

- 前端：`http://localhost:5173`
- 后端：`http://localhost:8001`
- 后端 API 文档：`http://localhost:8001/docs`

## 4. 首次使用提醒

首次启动时，建议按下面顺序确认：

1. 打开前端页面。
2. 在模型配置里新增至少一个可用 provider。
3. 确认后端健康可达。
4. 再创建并启动会话。

补充说明：

- 启动后会在 `runtime/config.json` 初始化统一运行时配置。
- 运行目录会准备 `runtime/elenchus.db`、`runtime/logs/`、`runtime/sessions/` 等本地内容。
- provider API key 不通过仓库内 `.env` 管理，而是在 Web UI 中配置并持久化到 `runtime/config.json`。
- 如果存在旧的 `.env` / `config.yaml` / `log_config.json` / provider DB 配置，首次启动会自动导入到 `runtime/config.json`。

## 5. 手动启动：最短路径

如果你不想使用根目录脚本，可以分别启动后端和前端。

### 5.1 启动后端

```bash
cd backend
python -m venv venv
```

Windows PowerShell：

```powershell
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
```

macOS / Linux：

```bash
source venv/bin/activate
pip install -r requirements.txt
python -m uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
```

如果你准备进行后端开发与测试，还可以额外安装：

```bash
pip install -r requirements-dev.txt
```

### 5.2 启动前端

```bash
cd frontend
npm install
```

如果后端不在默认端口 `8001`，请先配置 `frontend/.env`：

```env
VITE_BACKEND_PORT=8001
```

然后启动：

```bash
npm run dev
```

## 6. 开发常用命令速查

### 后端

```bash
cd backend
python -m uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
pytest
pytest tests/test_graph.py
pip install -r requirements-dev.txt
```

### 前端

```bash
cd frontend
npm run dev
npm run build
npm run lint
npm run test:run
npm run preview
```

## 7. 下一步读什么

- 想理解系统整体结构：读 [architecture.md](./architecture.md)
- 想了解运行时文件和回放：读 [runtime.md](./runtime.md)
- 想做后端开发：读 [guides/backend-development.md](./guides/backend-development.md)
- 想做前端开发：读 [guides/frontend-development.md](./guides/frontend-development.md)
