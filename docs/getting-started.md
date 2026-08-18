# 快速开始

本文档聚焦“如何把 Elenchus 跑起来”。如果你只是想先用起来，从这里开始即可。

> 说明：这是仓库内**唯一完整启动文档**。`backend/README.md`、`frontend/README.md` 与开发指南只保留目录定位和开发期补充信息，不再重复完整启动手册。

## 1. 环境要求

- uv
- Node.js 18+
- npm

补充说明：

- 后端 Python 依赖现在统一由 `uv` 管理。
- 仓库把后端解释器固定在 Python 3.11 这一条线上，`uv` 会按项目约束自动选择或下载兼容解释器。
- 如果你还没有安装 `uv`，先按官方文档完成安装：`https://docs.astral.sh/uv/getting-started/installation/`

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

- 前端：`http://127.0.0.1:5173`
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
- 运行目录会准备 `runtime/elenchus.db` 和 `runtime/logs/` 等本地内容；运行真相以 SQLite 账本为准。
- provider API key 不通过仓库内 `.env` 管理，而是在 Web UI 中配置并持久化到 `runtime/config.json`。
- 当前只会直接初始化并使用 `runtime/config.json`；旧的 `.env` / `config.yaml` / `log_config.json` / provider DB 残留不会再被自动导入。

## 5. 手动启动：最短路径

如果你不想使用根目录脚本，可以分别启动后端和前端。

### 5.1 启动后端

```bash
cd backend
uv sync --frozen --group dev
uv run --frozen --no-dev python -m uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
```

如果你准备进行后端开发与测试，还可以额外安装：

```bash
uv sync --frozen --group dev
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

## 6. 使用视频生成器（附属工具）

`video/` 是主项目的附属工具，把辩论记录渲染成带配音和字幕的 MP4（Remotion + Edge TTS）。

使用流程：

1. 双击 `video/启动视频生成器.bat`（首次会自建 Python 虚拟环境并安装 Edge TTS）。
2. 在辩论页的**导出**菜单中点击「生成视频 → 发送」，本场辩论会被送入生成器并自动打开其网页。
3. 在生成器网页中生成配音，再选择快速渲染或正式渲染。

补充说明：

- 生成器未启动时，导出菜单会提示先运行 bat；后端不会在自身进程内渲染视频。
- 生成器地址可在 `runtime/config.json` 的 `video.base_url` 中修改，默认 `http://127.0.0.1:4317`。
- 诡辩实验模式的观察员报告不会进入视频，仅渲染辩手发言。

## 7. 开发常用命令速查

### 后端

```bash
cd backend
uv sync --frozen --group dev
uv run --frozen --no-dev python -m uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
uv run --frozen --group dev pytest
uv run --frozen --group dev pytest tests/test_graph.py
```

如果你在仓库根目录，也可以直接运行：

```bash
npm run test:backend
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

## 8. 下一步读什么

- 想理解系统整体结构：读 [architecture.md](./architecture.md)
- 想了解运行时文件和历史恢复：读 [runtime.md](./runtime.md)
- 想做开发或联调：读 [development.md](./development.md)
