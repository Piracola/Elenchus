# Elenchus Frontend

这是 Elenchus 的前端部分，技术栈主要是：

- React 19
- TypeScript 5
- Vite 7
- Zustand
- Framer Motion
- Vitest

前端负责的事情包括：

- 展示会话列表和消息流
- 启动和控制辩论
- 显示 Execution Timeline、Live Graph、Memory
- 管理模型配置、搜索配置、界面设置
- 通过 WebSocket 接收后端实时事件

## 前端目录大致在做什么

```text
frontend/
├─ src/
│  ├─ components/      页面组件和业务组件
│  ├─ hooks/           自定义 hooks
│  ├─ stores/          Zustand 状态管理
│  ├─ api/             后端 API 客户端
│  ├─ utils/           工具函数
│  ├─ types/           TypeScript 类型
│  ├─ styles/          样式与设计变量
│  ├─ App.tsx          应用入口组件
│  └─ main.tsx         前端挂载入口
├─ package.json
├─ vite.config.ts
└─ .env
```

## 如果你只想先把前端跑起来

### 1. 进入前端目录

```bash
cd frontend
```

### 2. 安装依赖

```bash
npm install
```

### 3. 告诉前端后端在哪个端口

前端默认通过 Vite 代理把 `/api` 和 `/api/ws` 转发给后端。

你需要创建或修改 `frontend/.env`：

```env
VITE_BACKEND_PORT=8001
```

如果你的后端不是 `8001`，就改成实际端口。

### 4. 启动前端

```bash
npm run dev
```

启动后打开：

```text
http://localhost:5173
```

## 前端启动前你要知道的事

### 1. 前端本身能启动，不代表系统就能完整工作

前端页面可以单独打开，但如果你想真正使用辩论功能，后端必须同时在线。

最少要保证：

- 后端健康检查可访问：`http://localhost:8001/health`
- `frontend/.env` 里的 `VITE_BACKEND_PORT` 对应后端实际端口

### 2. 页面打开后第一次通常还要配置模型

即使前后端都启动了，想让 AI 真正开始辩论，还需要在网页里的“模型配置”中新增至少一个可用提供商。

## 前端常用命令

### 启动开发环境

```bash
npm run dev
```

### 运行测试

```bash
npm run test:run
```

### 生产构建

```bash
npm run build
```

### 本地预览构建结果

```bash
npm run preview
```

### 运行 ESLint

```bash
npm run lint
```

## 前端开发时最常看的几个位置

如果你刚接手前端，建议优先看这些文件：

- `src/App.tsx`：应用整体布局
- `src/components/ChatPanel.tsx`：主对话区
- `src/components/sidebar/SessionList.tsx`：会话列表
- `src/components/chat/DebateControls.tsx`：辩论控制区
- `src/hooks/useDebateWebSocket.ts`：实时通信主入口
- `src/stores/debateStore.ts`：全局辩论状态
- `src/api/client.ts`：前端请求后端的统一入口

## 当前前端的核心数据流

可以先把它理解成下面这条链路：

1. 用户在界面里新建或启动辩论
2. 前端通过 REST API 创建会话
3. 前端通过 WebSocket 接收运行事件
4. 事件进入 store
5. 组件从 store 里读取状态并渲染
6. Timeline / Live Graph / Message 列表一起更新

## 前端联调最常见的启动方式

### 方式一：推荐

在项目根目录使用启动脚本：

- Windows：`start.bat` 或 `.\start.ps1`
- macOS / Linux：`./start.sh`

这样通常不需要手动维护 `frontend/.env`，脚本会帮你写好 `VITE_BACKEND_PORT`。

### 方式二：手动

1. 先启动后端
2. 确认后端端口
3. 修改 `frontend/.env`
4. 再执行 `npm run dev`

## 常见问题

### 1. 前端能打开，但数据加载失败

优先检查：

- 后端是否真的启动了
- `frontend/.env` 是否写了正确的 `VITE_BACKEND_PORT`
- 浏览器开发者工具里 `/api` 请求是否报错

### 2. WebSocket 连不上

先看这几项：

- 后端 WebSocket 路由是否可用
- `vite.config.ts` 里的代理目标端口是否和 `.env` 一致
- 后端是否真的在那个端口监听

### 3. 设置页打不开或加载失败

通常先从这两端查：

- 前端：`src/api/client.ts`
- 后端：对应的 `/api/...` 路由是否正常

### 4. 我只想改 UI，不想动后端

可以先只跑前端，但要注意：

- 很多页面依赖真实接口返回
- 最稳妥的方式仍然是同时把后端起起来

### 5. 构建时报大 bundle 警告

如果只是 Vite 的 chunk size warning，通常不是阻塞错误，说明包体偏大，但不一定构建失败。

## 给第一次看前端代码的人一个建议

如果你是第一次接手这个前端，最推荐的阅读顺序是：

1. `src/App.tsx`
2. `src/components/ChatPanel.tsx`
3. `src/components/sidebar/SessionList.tsx`
4. `src/hooks/useDebateWebSocket.ts`
5. `src/stores/debateStore.ts`
6. `src/api/client.ts`
7. `src/types/index.ts`
