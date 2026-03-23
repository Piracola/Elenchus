# Elenchus Backend

这个目录包含 Elenchus 的 FastAPI、LangGraph、WebSocket 与运行时编排实现。

> 说明：这是**轻量目录入口**，帮助你快速定位后端代码与继续阅读路径；首次安装和完整启动步骤请统一参考 [docs/getting-started.md](../docs/getting-started.md)。

## 目录定位

- `app/`：后端源码
- `tests/`：后端测试
- `requirements.txt`：运行依赖
- `requirements-dev.txt`：开发 / 测试依赖

## 后端单独开发时最常用的命令

在已经完成首次环境准备后，通常只需要：

```bash
cd backend
python -m uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
pytest
pytest tests/test_graph.py
```

如果你还没有准备虚拟环境、依赖或前后端联调环境，请回到 [快速开始](../docs/getting-started.md)。

## 继续阅读

- [后端开发指南](../docs/guides/backend-development.md)
- [系统架构总览](../docs/architecture.md)
- [运行时与回放](../docs/runtime.md)
