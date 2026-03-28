# Elenchus Backend

这个目录包含 Elenchus 的 FastAPI、LangGraph、WebSocket 与运行时编排实现。

> 说明：这是**轻量目录入口**，帮助你快速定位后端代码与继续阅读路径；首次安装和完整启动步骤请统一参考 [docs/getting-started.md](../docs/getting-started.md)。

## 目录定位

- `app/`：后端源码
- `prompts/`：系统提示词文件，按标准模式与诡辩模式组织
- `tests/`：后端测试
- `requirements.txt`：运行依赖
- `requirements-dev.txt`：开发 / 测试依赖

## prompts 目录说明

- `prompts/debater_system.md`：标准模式辩手通用基础提示词
- `prompts/debater_proposer.md`：标准模式正方补充提示词
- `prompts/debater_opposer.md`：标准模式反方补充提示词
- `prompts/judge_system.md`：标准模式裁判提示词
- `prompts/fact_checker_system.md`：事实核查代理提示词
- `prompts/sophistry/debater_system.md`：诡辩模式辩手通用基础提示词
- `prompts/sophistry/debater_proposer.md`：诡辩模式正方补充提示词
- `prompts/sophistry/debater_opposer.md`：诡辩模式反方补充提示词
- `prompts/sophistry/observer_system.md`：诡辩模式观察员提示词

这些文件由 [prompt_loader.py](file:///i:/JBCode/AI%20Tools/Elenchus/backend/app/agents/prompt_loader.py) 与 [sophistry_prompt_loader.py](file:///i:/JBCode/AI%20Tools/Elenchus/backend/app/agents/sophistry_prompt_loader.py) 在运行时读取；辩手类提示词采用“基础提示词 + 角色补充提示词”的组合加载方式。

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
