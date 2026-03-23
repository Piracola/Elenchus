# Elenchus Frontend

这个目录包含 Elenchus 的 React + Vite 前端，实现会话创建、实时聊天、运行观察与历史回放界面。

> 说明：这是**轻量目录入口**，帮助你快速定位前端代码与继续阅读路径；首次安装和完整启动步骤请统一参考 [docs/getting-started.md](../docs/getting-started.md)。

## 目录定位

- `src/`：前端源码
- `package.json`：前端脚本与依赖
- `vite.config.ts`：Vite / Vitest 配置

## 前端单独开发时最常用的命令

在已经完成首次依赖安装后，通常只需要：

```bash
cd frontend
npm run dev
npm run lint
npm run test:run
npm run build
```

如果你还没有完成依赖安装、后端联调准备或端口确认，请回到 [快速开始](../docs/getting-started.md)。

## 继续阅读

- [前端开发指南](../docs/guides/frontend-development.md)
- [系统架构总览](../docs/architecture.md)
- [运行时与回放](../docs/runtime.md)
