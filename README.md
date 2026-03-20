# Elenchus

Elenchus 是一个基于 `LangGraph + FastAPI + React 19` 的多智能体辩论实验平台，支持实时辩论、运行时回放、陪审团评议、搜索增强和本地运行时持久化。

> 本 README 按仓库当前主线状态整理（截至 2026-03-20）。
> 说明：仓库当前可见 Git tag 为 `v1.0.0`，下文优先反映最近提交与工作区最新改动，而不是旧版发布文案。

## 近期演进

### 最近提交（2026-03-18 ~ 2026-03-20）

- `ffb63ec` / `086c8a2` / `ea73651`：修复运行观察器 UI、模型 HTML 响应误判和 `safe_invoke` 依赖问题，补齐基础稳定性。
- `17cef39` / `5415038` / `80c9569` / `c0e9187` / `4fbf261`：重构运行时与模型调用链，加入陪审团评议、模型温度与搜索配置增强，完善会话恢复和启动流程。
- `46e6f61` / `dc034d9` / `b8ffa09`：运行事件持久化改为 `events.jsonl`，每轮结果单独落盘为 JSON，增强辩论中断恢复与实时流式交互，并过滤 `pong` 心跳噪声。

### 工作区最新改动（未提交）

- 新增会话级参考资料接口：`POST/GET/DELETE /api/sessions/{session_id}/documents...`
- 支持 `.txt` / `.md` 上传、文本解码、规范化和短摘要生成，后端新增 `python-multipart` 依赖。
- 上传资料按 session 落盘到 `runtime/sessions/<session_id>/documents/`，删除会话时会同步清理资料文件。
- 结构化资料池与预处理骨架已经存在，但当前工作区仍以“资料接入层”落地为主。

## 当前能力边界

- REST + WebSocket 双通道协作：REST 管理会话与历史，WebSocket 负责实时事件、启动、停止和介入。
- LangGraph 负责辩手、裁判、组内讨论、陪审团评议、搜索工具与共享知识的编排。
- 会话运行历史支持分页回放与按轮次结果查看。
- Provider、模型参数、搜索配置、日志配置与运行时目录已经收口到统一启动链路。
- 会话资料池当前已完成后端 Phase 1：上传、列表、详情、删除；前端入口与结构化资料 API 仍待接入。

## 系统结构

- 前端：`React 19 + Vite 7 + Zustand`，负责会话列表、主对话区、运行观察器、配置面板与实时事件渲染。
- 后端：`FastAPI` 提供 `sessions`、`websocket`、`models`、`log`、`search` 等 API。
- Agent Runtime：`LangGraph + LangChain` 驱动辩手、裁判、组内讨论、陪审团评议、上下文压缩与搜索调用。
- 持久化：`runtime/elenchus.db` 保存数据库型配置，`runtime/sessions/<session_id>/` 保存会话快照、事件流、轮次结果和资料文件。

## 快速启动（开发模式）

### 前提

- Python 3.10+
- Node.js 18+

### 推荐方式

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

根目录也提供 `npm run dev`，用于同时拉起前后端开发服务。

默认地址：

- 前端：`http://localhost:5173`
- 后端：`http://localhost:8001`

## 运行时数据目录

无论开发模式还是打包版，运行时数据都统一在根目录 `runtime/` 下：

```text
runtime/
├─ backend/
│  ├─ .env
│  └─ config.yaml
├─ data/
│  └─ log_config.json
├─ elenchus.db
├─ logs/
└─ sessions/
   └─ <session_id>/
      ├─ session.json
      ├─ events.jsonl
      ├─ rounds/
      │  └─ round-001.json
      ├─ documents/
      │  └─ <document_id>.json
      └─ reference_entries/
         └─ <document_id>.json
```

说明：

- `session.json` 保存会话快照与轻量运行态。
- `events.jsonl` 保存实时事件历史，便于恢复与回放。
- `rounds/` 保存已完成轮次的独立 JSON 结果。
- `documents/` 保存会话级参考资料原文、规范化文本与摘要。
- `reference_entries/` 预留给结构化资料池，当前代码中已有服务骨架，但公开链路尚未完全接通。

升级版本时，只要保留 `runtime/` 目录即可迁移大部分本地配置与数据。

## 打包发布（Windows EXE）

> 以下步骤给维护者使用，用于产出发行包。

### 1. 构建前端

```powershell
npm --prefix frontend run build
```

### 2. 构建便携版 EXE 发行包

```powershell
python scripts/build_pyinstaller_release.py --version <version>
```

产物默认输出到 `dist/releases/`：

- `elenchus-portable-<version>-windows/`
- `elenchus-portable-<version>-windows.zip`
- `elenchus-portable-<version>-windows.zip.sha256`

## GitHub Actions 发布

CI 已切换为 EXE 发布流程：

- [build-portable-release.yml](./.github/workflows/build-portable-release.yml)

触发方式：

- 推送 `v*` tag 自动构建并发布
- `workflow_dispatch` 手动发布（支持填写版本号、标题、发布说明）

## 文档入口

- 当前架构说明：[docs/architecture.md](./docs/architecture.md)
- 后端文档：[backend/README.md](./backend/README.md)
- 前端文档：[frontend/README.md](./frontend/README.md)
- 文档导航：[docs/README.md](./docs/README.md)
