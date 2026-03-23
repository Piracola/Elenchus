# 前端开发指南

本文档聚焦 Elenchus 前端的本地启动、联调方式、常用命令、关键入口文件与核心数据流。

## 1. 技术栈

- React 19
- TypeScript 5
- Vite 7
- Zustand
- Framer Motion
- Vitest

## 2. 本地启动

### 最短路径

```bash
cd frontend
npm install
npm run dev
```

默认地址：

```text
http://localhost:5173
```

## 3. 与后端联调

前端默认通过 Vite 代理把 `/api` 与 `/api/ws` 转发给后端。

如果后端运行在默认端口 `8001`，通常不需要额外修改；如果后端端口不同，请在 `frontend/.env` 中设置：

```env
VITE_BACKEND_PORT=8001
```

如果你想快速完成整套联调，推荐直接使用仓库根目录启动脚本，见：[../getting-started.md](../getting-started.md)

## 4. 常用命令

启动开发环境：

```bash
npm run dev
```

运行测试：

```bash
npm run test:run
```

生产构建：

```bash
npm run build
```

本地预览构建结果：

```bash
npm run preview
```

运行 ESLint：

```bash
npm run lint
```

## 5. 首次联调时要注意什么

- 前端页面能打开，不代表整套系统可用；后端也必须在线。
- 页面第一次可用之前，通常还需要在 UI 中添加 provider 配置。
- 如果数据加载失败，先确认 `/api` 代理目标端口是否正确。

## 6. 关键入口文件

- `frontend/src/components/HomeView.tsx`：首页与创建会话入口
- `frontend/src/components/ChatPanel.tsx`：主聊天视图
- `frontend/src/hooks/useDebateWebSocket.ts`：实时通信主入口
- `frontend/src/stores/debateStore.ts`：全局会话与回放状态
- `frontend/src/api/client.ts`：统一 API 请求入口

## 7. 核心数据流

前端主链路可以概括为：

1. 用户在界面创建或启动辩论
2. 前端通过 REST 创建 / 读取会话
3. 前端通过 WebSocket 接收运行事件
4. 事件进入 Zustand store
5. 组件从 store 读取状态并渲染
6. 聊天区、时间线、运行图和观察器同步更新

## 8. 常见联调问题

### 前端能打开，但数据加载失败

优先检查：

- 后端是否真的启动
- `frontend/.env` 的 `VITE_BACKEND_PORT` 是否正确
- 浏览器开发者工具中的 `/api` 请求是否报错

### WebSocket 连不上

优先检查：

- 后端 WebSocket 路由是否正常
- Vite 代理目标端口是否和后端一致
- 后端是否真的监听在该端口

### 设置页或管理面板加载失败

优先从这两端排查：

- 前端：`frontend/src/api/client.ts`
- 后端：对应 `/api/...` 路由

### 只想改 UI，不想动后端

可以只跑前端，但很多页面依赖真实接口。最稳定的方式仍然是把后端同时启动。

## 9. 阅读代码建议

如果你是第一次看这个前端，推荐阅读顺序：

1. `frontend/src/components/HomeView.tsx`
2. `frontend/src/components/ChatPanel.tsx`
3. `frontend/src/hooks/useDebateWebSocket.ts`
4. `frontend/src/stores/debateStore.ts`
5. `frontend/src/api/client.ts`
6. `frontend/src/types/index.ts`

## 10. 关联文档

- [系统架构总览](../architecture.md)
- [运行时与回放](../runtime.md)
- [快速开始](../getting-started.md)
- [后端开发指南](./backend-development.md)
