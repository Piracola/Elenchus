# 前端开发指南

本文档聚焦 Elenchus 前端的**开发期信息**：Vite 代理、联调方式、常用命令、关键入口文件与核心数据流。

> 首次安装与完整启动步骤请先读：[快速开始](../getting-started.md)

## 1. 技术栈

- React 19
- TypeScript 5
- Vite 7
- Zustand
- Framer Motion
- Vitest

## 2. 前端开发时最常用的命令

完成首次依赖安装后，前端单独开发通常使用下面这些命令：

```bash
cd frontend
npm run dev
npm run lint
npm run test:run
npm run build
npm run preview
```

说明：

- `npm install` 与完整联调启动步骤统一留在 [快速开始](../getting-started.md)。
- 如果只是更新前端实现，通常不需要重复阅读完整启动手册；只需确认后端端口和代理配置是否一致。

## 3. 与后端联调

前端默认通过 Vite 代理把 `/api` 与 `/api/ws` 转发给后端。

当前默认行为：

- 前端开发服务器：`http://localhost:5173`
- 后端默认端口：`8001`
- `vite.config.ts` 会读取 `VITE_BACKEND_PORT`，默认回退到 `8001`

如果后端不在默认端口，请在 `frontend/.env` 中设置：

```env
VITE_BACKEND_PORT=8001
```

如果你还没有完成整套本地启动，请回到 [快速开始](../getting-started.md)。

## 4. 首次联调后最常见的注意点

- 前端页面能打开，不代表整套系统可用；后端也必须在线。
- 页面第一次可用之前，通常还需要在 UI 中添加至少一个 provider 配置。
- 如果数据加载失败，优先确认 `/api` 代理目标端口是否正确。
- 如果 WebSocket 连接失败，优先确认 `/api/ws` 是否也指向同一后端端口。

## 5. 关键入口文件

- `frontend/src/components/HomeView.tsx`：首页与创建会话入口
- `frontend/src/components/ChatPanel.tsx`：主聊天视图
- `frontend/src/hooks/useDebateWebSocket.ts`：实时通信主入口
- `frontend/src/stores/debateStore.ts`：全局会话与回放状态
- `frontend/src/api/client.ts`：统一 API 请求入口
- `frontend/src/components/chat/RuntimeInspector.tsx`：运行观察器容器

## 6. 核心数据流

前端主链路可以概括为：

1. 用户在界面创建或启动辩论
2. 前端通过 REST 创建 / 读取会话
3. 前端通过 WebSocket 接收运行事件
4. 事件进入 Zustand store
5. 组件从 store 读取状态并渲染
6. 聊天区、时间线、运行图和观察器同步更新

## 7. 常见联调问题

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

### 页面出现中文乱码

优先检查：

- `frontend/index.html` 是否保留 UTF-8 声明
- 新提交的源码文件是否被错误保存成 ANSI / GBK
- 接口下载响应是否显式返回 `charset=utf-8`
- 导入文件是否本身不是 UTF-8 编码

编码处理统一规范见：[编码规范指南](./encoding.md)

## 8. 阅读代码建议

如果你是第一次看这个前端，推荐阅读顺序：

1. `frontend/src/components/HomeView.tsx`
2. `frontend/src/components/ChatPanel.tsx`
3. `frontend/src/hooks/useDebateWebSocket.ts`
4. `frontend/src/stores/debateStore.ts`
5. `frontend/src/api/client.ts`
6. `frontend/src/types/index.ts`

## 9. 关联文档

- [系统架构总览](../architecture.md)
- [运行时与回放](../runtime.md)
- [快速开始](../getting-started.md)
- [后端开发指南](./backend-development.md)
- [编码规范指南](./encoding.md)
