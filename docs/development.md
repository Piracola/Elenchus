# 开发指南

本文档合并后端、前端、UI 和编码相关开发约定。首次安装、完整启动和默认地址请先读 [快速开始](./getting-started.md)。

## 1. 技术栈

后端：

- FastAPI
- LangGraph
- SQLAlchemy Async + SQLite
- WebSocket

前端：

- React 19
- TypeScript 5
- Vite 7
- Zustand
- Framer Motion
- Vitest

## 2. 常用命令

### 后端

```bash
cd backend
uv sync --frozen --group dev
uv run --frozen --no-dev python -m uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload --no-access-log
uv run --frozen --group dev pytest
uv run --frozen --group dev pytest tests/test_graph.py
uv run --frozen --group dev ruff check .
uv run --frozen --group dev mypy app
```

`ruff` 与 `mypy` 是 CI 的强制门禁，配置在 `backend/pyproject.toml`。
mypy 对少数存量模块登记了豁免（第三方签名差异与 FastAPI 边界），
豁免表之外的新代码一旦引入类型错误就会失败。

如果在仓库根目录，也可以运行：

```bash
npm run test:backend
npm run lint:backend
npm run typecheck:backend
```

### 前端

```bash
cd frontend
npm run dev
npm run lint
npm run test:run
npm run test:coverage
npm run build
npm run preview
```

### 视频生成器（附属工具）

```bash
cd video
npm ci
npm run typecheck
npm test          # 单测，CI 会跑
npm run ui        # 本地控制台，配音与渲染在这里操作
```

渲染与配音需要 FFmpeg、字体、Chrome 与 Edge TTS 网络访问，因此只在本地手动执行；
CI 只跑类型检查与单测。

## 3. 本地联调

前端开发服务器默认运行在 `http://127.0.0.1:5173`，后端默认端口是 `8001`。

Vite 会把 `/api` 与 `/api/ws` 代理到后端。若后端不在默认端口，请在 `frontend/.env` 中设置：

```env
VITE_BACKEND_PORT=8001
```

首次联调时优先确认：

- 后端已经启动。
- 前端代理端口和后端端口一致。
- Web UI 中已经添加至少一个 provider 配置。
- WebSocket 路径 `/api/ws` 也指向同一个后端。

## 4. 运行时配置

当前唯一活动配置源是 `runtime/config.json`。本地启动会初始化该文件，并把运行数据写入 `runtime/`。

后端 Python 依赖的唯一真相源是：

- `backend/pyproject.toml`
- `backend/uv.lock`

常见配置项：

```json
{
  "server": {
    "host": "0.0.0.0",
    "port": 8001,
    "debug": false,
    "database_url": "sqlite+aiosqlite:///.../runtime/elenchus.db"
  },
  "search": {
    "provider": "ddgs",
    "custom": {"endpoint": "", "api_key": ""}
  },
  "logging": {
    "level": "INFO"
  }
}
```

补充说明：

- Provider API key 不在仓库 `.env` 中维护，而是在 Web UI 中配置并存储到 `runtime/config.json`。
- 旧的 `.env` / `config.yaml` / `log_config.json` / provider DB 残留不会再被导入。
- 当 `DATABASE_URL` 使用相对 SQLite 路径时，后端会把它归一化到 `runtime/` 目录。

运行时文件职责见 [运行时与历史恢复](./runtime.md)。

## 5. 关键入口

### 后端

- `backend/app/main.py`：应用入口。
- `backend/app/api/sessions.py`：会话 CRUD、导出与资料接口。
- `backend/app/api/session_runtime.py`：Run 创建、查看、命令和事件读取。
- `backend/app/api/websocket.py`：按 `run_id` 订阅 WebSocket 事件。
- `backend/app/api/models.py`：provider / 模型配置接口。
- `backend/app/api/search.py`：搜索配置与健康检查。
- `backend/app/services/session_service.py`：会话生命周期主服务。
- `backend/app/runtime/orchestrator.py`：按模式组织运行流程。
- `backend/app/runtime/engines/langgraph.py`：LangGraph 引擎装配。
- `backend/app/runtime/bus.py`：运行事件广播与持久化总线。
- `backend/app/agents/graph.py`：标准模式 graph。
- `backend/app/agents/sophistry_graph.py`：诡辩实验模式 graph。

### 前端

- `frontend/src/components/HomeView.tsx`：首页与创建会话入口。
- `frontend/src/components/ChatPanel.tsx`：主聊天视图。
- `frontend/src/hooks/useDebateWebSocket.ts`：实时通信主入口。
- `frontend/src/stores/debateStore.ts`：全局会话与运行状态。
- `frontend/src/api/client.ts`：统一 API 请求入口。

## 6. 阅读路径

后端建议顺序：

1. `backend/app/main.py`
2. `backend/app/api/sessions.py`
3. `backend/app/api/websocket.py`
4. `backend/app/services/session_service.py`
5. `backend/app/runtime/orchestrator.py`
6. `backend/app/runtime/engines/langgraph.py`
7. `backend/app/agents/graph.py` 或 `backend/app/agents/sophistry_graph.py`

前端建议顺序：

1. `frontend/src/components/HomeView.tsx`
2. `frontend/src/components/ChatPanel.tsx`
3. `frontend/src/hooks/useDebateWebSocket.ts`
4. `frontend/src/stores/debateStore.ts`
5. `frontend/src/api/client.ts`
6. `frontend/src/types/index.ts`

## 7. 常见排查

### API 文档

启动后端后访问：

- `http://localhost:8001/docs`

### 前端能打开，但数据加载失败

优先检查：

- 后端是否真的启动。
- `frontend/.env` 的 `VITE_BACKEND_PORT` 是否正确。
- 浏览器开发者工具中的 `/api` 请求是否报错。

### WebSocket 连不上

优先检查：

- 后端 WebSocket 路由是否正常。
- Vite 代理目标端口是否和后端一致。
- 后端是否真的监听在该端口。

### 会话 / 历史恢复异常

优先查看：

- `/api/runs/{run_id}` 返回的 run summary 和 projection。
- `/api/runs/{run_id}/events?after_seq=0` 返回的事件流。
- SQLite 中 `runs / run_events / run_checkpoints / run_projections` 对应记录。
- `runtime/logs/` 中的异常堆栈。

### 终端日志太多

控制台默认只用于现场提醒：启动、关闭、少量关键生命周期和 `WARNING` 以上问题。逐条 SQL、事务 `ROLLBACK`、HTTP access log 和第三方库 INFO 不应出现在控制台。

如果终端又开始刷屏，优先检查：

- 是否用了不带 `--no-access-log` 的 uvicorn 命令。
- 是否有人重新打开了 SQLAlchemy `echo`。
- 是否有第三方 logger 绕过了 `app.services.log_service`。

完整排障信息看 `runtime/logs/`；运行事实看 SQLite ledger 或 JSON / Markdown / HTML 导出。

### 参考资料异常

优先查看：

- `/api/sessions/{session_id}/documents`
- SQLite 中 `session_documents` 对应记录。
- `/api/runs/{run_id}` 返回 projection 中的 `shared_knowledge`。

## 8. 前端风格契约

Elenchus 是辩论、分析、配置和运行观察工具。界面应该冷静、专业、清晰、耐读，帮助用户快速输入、比较、追踪和复盘，而不是展示装饰效果。

核心原则：

- 内容优先：信息层级、可读性和操作效率优先于视觉花样。
- 克制表达：避免大面积渐变、发光、玻璃拟态、背景光斑和无意义动画。
- 清晰可扫：角色、状态、时间、分组和主要操作要容易辨认。
- 高密度但不压迫：工作台界面可以紧凑，但文字、间距和点击区域不能难用。
- 统一但不僵硬：复用已有 token、组件和局部模式，也允许根据场景做合理设计判断。
- 响应式自然：窄屏优先保证阅读和操作不重叠、不溢出、不被固定区域遮挡。

修改 UI 前，先明确目标体验、信息层级、布局方向和需要避免的视觉偏差；然后按现有代码风格实现。

## 9. 编码约定

统一原则：

- 所有源码文件使用 UTF-8 保存。
- 前端页面和静态入口声明 UTF-8。
- 后端文本响应显式返回 UTF-8 编码。
- JSON、Markdown、日志与运行时快照按 UTF-8 写入。
- 导入链路优先按 UTF-8 解码，必要时提供受控兼容回退。

前端注意：

- `frontend/index.html` 必须保留 `<meta charset="UTF-8" />`。
- 不允许把乱码字面量直接写入组件文案、配置常量或提示文本。
- 文件导入优先使用 `TextDecoder('utf-8', { fatal: true })`。
- 仅在明确需要兼容历史文件时，才允许增加 `gb18030` 等回退解码。

后端注意：

- `text/*` 响应必须显式带 `charset=utf-8`。
- `application/json` 导出接口也统一显式带 `charset=utf-8`。
- `Content-Disposition` 中包含中文文件名时，优先使用 `filename*=UTF-8''...`。
- 运行事件、SQLite 导出结果和可读导出文件统一使用 UTF-8。

出现乱码时，按下面顺序排查：

1. 检查源码文件本身是否已保存为错误编码。
2. 检查页面入口是否声明 UTF-8。
3. 检查接口响应头是否显式包含正确的 `Content-Type`。
4. 检查 WebSocket / REST 收到的原始文本是否在服务端就已损坏。
5. 检查导入文件是否为 UTF-8 之外的本地编码。
6. 检查历史持久化数据是否已经保存成乱码文本。

## 10. 关联文档

- [系统架构总览](./architecture.md)
- [运行时与历史恢复](./runtime.md)
- [快速开始](./getting-started.md)
- [CI 失败排查清单](./ci-troubleshooting.md)
