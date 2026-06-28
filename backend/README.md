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
- `prompts/steelman/`：钢人论证开关使用的场景化提示词
- `prompts/judge_system.md`：标准模式裁判提示词
- `prompts/fact_checker_system.md`：事实核查代理提示词
- `prompts/sophistry/debater_system.md`：诡辩模式辩手通用基础提示词
- `prompts/sophistry/debater_proposer.md`：诡辩模式正方补充提示词
- `prompts/sophistry/debater_opposer.md`：诡辩模式反方补充提示词
- `prompts/sophistry/observer_system.md`：诡辩模式观察员提示词

这些文件由 [prompt_loader.py](/I:/JBCode/AI%20Tools/Elenchus/backend/app/agents/prompt_loader.py) 与 [sophistry_prompt_loader.py](/I:/JBCode/AI%20Tools/Elenchus/backend/app/agents/sophistry_prompt_loader.py) 在运行时读取；辩手类提示词采用“基础提示词 + 角色补充提示词”的组合加载方式。

## 后端单独开发时最常用的命令

在已经完成首次环境准备后，通常只需要：

```bash
npm run test:backend
cd backend
venv/Scripts/python -m uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
venv/Scripts/python -m pytest
venv/Scripts/python -m pytest tests/test_graph.py
```

macOS / Linux 请把 `venv/Scripts/python` 换成 `venv/bin/python`。

如果你还没有准备虚拟环境、依赖或前后端联调环境，请回到 [快速开始](../docs/getting-started.md)。

## Rate Limit 存储

后端限流在 `auto` 模式下，只会在“数据库地址是可共享的 SQLite 文件”时启用共享存储。

- `server.database_url` 指向 SQLite 文件时，多个后端实例只要共享同一个数据库文件，就会共享限流计数
- 如果没有显式配置数据库地址，默认会使用 `runtime/elenchus.db`，这同样是本机文件级共享，不是跨机器共享
- 如果 `server.database_url` 是非 SQLite 数据库，或 `sqlite:///:memory:` 这类内存库，`auto` 会明确退回进程内内存限流
- 可用 `ELENCHUS_RATE_LIMIT_BACKEND=memory|sqlite|auto` 切换限流后端
- 可用 `ELENCHUS_RATE_LIMIT_FALLBACK_TO_MEMORY=false` 禁止 `sqlite` 后端初始化失败时自动回退到内存

如果你的部署是多机器且不共享磁盘，仍然建议在反向代理或 API 网关层继续加一层统一限流。

## 推荐代码入口

为降低兼容壳层带来的理解成本，后端现在有一组明确的推荐入口：

- 工具能力：`app.tools` 与 `app.tools.*`
- OpenAI 兼容传输层：`app.llm.transport`
- 导出能力：`app.services.export`

下面这些路径只为兼容旧导入保留，不再作为新实现入口：

- `app.agents.skills`
- `app.agents.openai_transport`
- `app.services.export_service`

其中 `app.agents.skills` 当前保留的兼容面是有边界的：

- 包级导出仍支持：`app.agents.skills.web_search`、`app.agents.skills.get_all_skills`
- 历史镜像子模块仍支持：`app.agents.skills.metadata`、`search_formatter`、`search_query_planner`、`search_result_filter`、`search_tool`
- 新代码不要继续从这个兼容包新增入口或实现逻辑

## 继续阅读

- [后端开发指南](../docs/guides/backend-development.md)
- [系统架构总览](../docs/architecture.md)
- [运行时与回放](../docs/runtime.md)
