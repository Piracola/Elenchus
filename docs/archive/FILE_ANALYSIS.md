# Elenchus 逐文件深度分析文档

> 统一入口：若要快速了解 2026-03-17 这轮审查，请先读 [2026-03-17-audit-summary.md](./2026-03-17-audit-summary.md)。本文保留为当时的逐文件原始勘测材料。

> 本文档按依赖拓扑顺序分析每个文件，记录详细的结构化信息。
> 生成时间：2026-03-17

---

## 一、入口模块

---

### 文件：backend/app/main.py

**模块归属**：API 层

**文件职责**：FastAPI 应用入口，管理应用生命周期和路由注册

**对外提供的能力**：
- 函数：`health_check()` - 健康检查端点
- 函数：`search_health()` - 搜索服务健康检查
- 变量：`app` - FastAPI 应用实例

**输入依赖**：
- import：fastapi (FastAPI, CORSMiddleware)
- import：app.config (get_settings)
- import：app.api.* (sessions_router, ws_router, models_router, log_router, search_router)
- import：app.db.database (init_db)
- import：app.search.factory (SearchProviderFactory)
- import：app.services.log_service (setup_logging, get_logger)
- import：app.agents.events (set_broadcaster)

**输出影响**：
- 初始化数据库表
- 配置事件广播器（WebSocket Manager）
- 注册所有 API 路由
- 配置 CORS 中间件

**数据流分析**：
- 启动时：init_db() → 创建 SQLite 表
- 启动时：set_broadcaster(ws_manager) → 连接 Agent 层与 WebSocket 层
- 关闭时：SearchProviderFactory.close() → 清理搜索资源

**AI调用分析**：无

**潜在风险**：
- 强耦合：直接导入所有 router，扩展需修改此文件
- 隐式状态：ws_manager 作为全局单例传递

**可优化建议**：
- 架构层：考虑使用工厂模式创建 app
- 可维护性：路由注册可改为自动发现

---

### 文件：frontend/src/main.tsx

**模块归属**：前端入口

**文件职责**：React 应用入口，挂载根组件

**对外提供的能力**：
- 无导出，仅作为入口执行

**输入依赖**：
- import：react (StrictMode, createRoot)
- import：./index.css
- import：./App.tsx

**输出影响**：
- 在 DOM #root 挂载 React 应用

**数据流分析**：
- 单向：ReactDOM.render → App 组件树

**AI调用分析**：无

**潜在风险**：无

**可优化建议**：无

---

### 文件：frontend/src/App.tsx

**模块归属**：前端 UI 层

**文件职责**：应用根组件，布局和路由控制

**对外提供的能力**：
- 函数：`App()` - 根组件函数

**输入依赖**：
- import：react (useEffect)
- import：./components (ChatPanel, ToastContainer, useToastState, BackendHealthCheck)
- import：./components/HomeView
- import：./components/sidebar/SessionList
- import：./stores/themeStore
- import：./stores/debateStore
- import：./components/shared/ErrorBoundary

**输出影响**：
- 根据 currentSessionId 切换 HomeView / ChatPanel
- 渲染 SessionList 侧边栏
- 渲染 ToastContainer 通知

**数据流分析**：
- 读取：useDebateStore.currentSessionId
- 读取：useThemeStore.theme
- 渲染：条件渲染 HomeView 或 ChatPanel

**AI调用分析**：无

**潜在风险**：
- 条件渲染：currentSessionId 变化时组件完全切换，可能丢失状态

**可优化建议**：
- 可读性：考虑使用 React Router 替代条件渲染

---

## 二、核心 Agent 模块

---

### 文件：backend/app/agents/graph.py

**模块归属**：核心模块

**文件职责**：LangGraph 状态机定义，辩论流程编排核心

**对外提供的能力**：
- 类型：`DebateGraphState` - 状态类型定义
- 函数：`build_debate_graph()` - 构建状态图
- 函数：`compile_debate_graph()` - 编译状态图
- 函数：`node_manage_context()` - 上下文管理节点
- 函数：`node_set_speaker()` - 发言人设置节点
- 函数：`node_debater_speak()` - 辩手发言节点
- 函数：`node_tool_executor()` - 工具执行节点
- 函数：`node_judge_score()` - 裁判评分节点
- 函数：`node_advance_turn()` - 轮次推进节点
- 函数：`should_execute_tools()` - 条件边：是否执行工具
- 函数：`should_continue()` - 条件边：是否继续

**输入依赖**：
- import：langgraph.graph (END, StateGraph)
- import：langgraph.graph.message (add_messages)
- import：langchain_core.messages (BaseMessage, RemoveMessage)
- import：app.agents.debater (debater_speak)
- import：app.agents.judge (judge_score)
- import：app.agents.context_manager (compress_context)
- import：app.agents.skills (get_all_skills)
- import：app.models.state (DialogueEntryDict, SharedKnowledgeEntry)
- import：app.services.intervention_manager (get_intervention_manager)

**输出影响**：
- 定义辩论流程的状态流转
- 管理对话历史累加
- 管理共享知识累加

**数据流分析**：
```
初始状态 → manage_context (压缩/注入)
         → set_speaker (确定发言人)
         → speaker (LLM 生成)
            ↓ [有工具调用]
         tool_executor → speaker (循环)
            ↓ [无工具调用]
         judge (评分)
         → advance_turn (轮次+1)
            ↓ [未达最大轮次]
         → manage_context (循环)
            ↓ [已达最大轮次]
         END
```

**AI调用分析**：
- 间接调用：通过 debater_speak 和 judge_score 调用 LLM
- 工具调用：通过 tool_executor 执行 web_search

**潜在风险**：
- 强耦合：直接导入所有节点函数
- 隐式状态：使用 Annotated 累加器，状态变化不透明
- 循环依赖风险：node_manage_context 导入 intervention_manager

**可优化建议**：
- 架构层：节点函数可改为可插拔注册
- 可读性：状态变化应更明确

---

### 文件：backend/app/agents/runner.py

**模块归属**：核心模块

**文件职责**：辩论执行器，运行 LangGraph 图并流式推送事件

**对外提供的能力**：
- 函数：`run_debate()` - 执行完整辩论
- 函数：`_persist_state()` - 持久化状态快照

**输入依赖**：
- import：asyncio
- import：app.agents.events (broadcast_event)
- import：app.db.database (get_session_factory)
- import：app.services.session_service
- import：app.agents.graph (DebateGraphState, compile_debate_graph)

**输出影响**：
- 执行 LangGraph 状态机
- 通过 WebSocket 推送实时事件
- 持久化状态到 SQLite

**数据流分析**：
```
run_debate(session_id, topic, ...)
    ↓
加载 session_db 状态快照
    ↓
构建 initial_state
    ↓
app.astream(initial_state)  # 流式执行
    ↓
for state_snapshot in astream:
    ├── _infer_node() 推断当前节点
    ├── broadcast_event() 推送事件
    └── _persist_state() 持久化
    ↓
推送 debate_complete
```

**AI调用分析**：无直接调用，间接通过 graph 节点调用

**潜在风险**：
- 隐式状态：`_infer_node()` 通过比较状态快照推断节点，脆弱
- 错误处理：异常时仅记录日志，可能丢失用户反馈

**可优化建议**：
- 可维护性：_infer_node 逻辑可改为节点显式报告
- 可读性：事件类型应提取为常量

---

### 文件：backend/app/agents/debater.py

**模块归属**：核心模块 / AI 模块

**文件职责**：辩手节点，生成辩论论点

**对外提供的能力**：
- 函数：`debater_speak(state)` - LangGraph 节点函数
- 函数：`_extract_citations(text)` - 提取引用 URL

**输入依赖**：
- import：langchain_core.messages (HumanMessage, SystemMessage, BaseMessage, RemoveMessage)
- import：app.agents.llm (get_debater_llm)
- import：app.agents.prompt_loader (get_debater_system_prompt)
- import：app.agents.context_manager (build_context_for_agent)
- import：app.agents.skills (get_all_skills)
- import：app.constants (ROLE_NAMES)

**输出影响**：
- 调用 LLM 生成论点
- 追加 dialogue_history
- 可能触发工具调用

**数据流分析**：
```
debater_speak(state)
    ↓
获取 role, topic, history, agent_configs
    ↓
构建 system_prompt (prompt_loader)
构建 context_block (context_manager)
构建 instruction (根据轮次和角色)
    ↓
get_debater_llm(override=agent_configs)
    ↓
llm.bind_tools(skills)  # 绑定搜索工具
    ↓
llm.ainvoke([SystemMessage, HumanMessage, ...messages])
    ↓
if tool_calls:
    return {"messages": [response]}  # 触发工具执行
else:
    return {"dialogue_history": [entry], "messages": [RemoveMessage]}
```

**AI调用分析**：
- 模型：通过 get_debater_llm 获取
- Prompt 来源：debater_system.md + debater_{role}.md
- Tool 调用：web_search
- Workflow：LangGraph 状态机编排

**潜在风险**：
- 不可预测 AI 行为：LLM 可能生成不当内容
- 魔法字符串：role 名称 "proposer", "opposer"

**可优化建议**：
- 可维护性：Prompt 构建逻辑可抽取为独立函数
- 可测试性：LLM 调用可抽象为接口

---

### 文件：backend/app/agents/judge.py

**模块归属**：核心模块 / AI 模块

**文件职责**：裁判节点，五维度评分

**对外提供的能力**：
- 函数：`judge_score(state)` - LangGraph 节点函数
- 函数：`_build_judge_instruction()` - 构建评分指令
- 函数：`_parse_score_response()` - 解析评分响应

**输入依赖**：
- import：langchain_core.messages (HumanMessage, SystemMessage)
- import：pydantic (ValidationError)
- import：app.agents.llm (get_judge_llm)
- import：app.agents.prompt_loader (get_judge_prompt)
- import：app.models.scoring (TurnScore)

**输出影响**：
- 更新 current_scores
- 更新 cumulative_scores

**数据流分析**：
```
judge_score(state)
    ↓
for role in participants:
    ↓
    构建 instruction (包含对话历史、共享知识)
    ↓
    structured_llm = base_llm.with_structured_output(TurnScore)
    ↓
    result = await structured_llm.ainvoke([SystemMessage, HumanMessage])
    ↓
    if 解析失败:
        fallback: 尝试文本解析
    if 仍失败:
        使用默认分数 (5分)
    ↓
    更新 current_scores[role]
    更新 cumulative_scores[role]
```

**AI调用分析**：
- 模型：通过 get_judge_llm 获取
- Prompt 来源：judge_system.md
- Structured Output：强制 TurnScore schema
- 无 Tool 调用

**潜在风险**：
- 不可预测 AI 行为：部分模型不支持 structured output
- 评分解析失败：需 fallback 处理

**可优化建议**：
- 可维护性：评分维度应提取为配置
- 可测试性：解析逻辑应独立测试

---

### 文件：backend/app/agents/context_manager.py

**模块归属**：AI 模块

**文件职责**：上下文滑动窗口 + 摘要压缩

**对外提供的能力**：
- 函数：`compress_context()` - 压缩旧对话
- 函数：`build_context_for_agent()` - 构建上下文块

**输入依赖**：
- import：langchain_core.messages (HumanMessage, SystemMessage)
- import：app.agents.llm (get_fact_checker_llm)
- import：app.config (get_settings)

**输出影响**：
- 将旧对话压缩为 memo 存入 shared_knowledge
- 保留最近 N 轮对话原文

**数据流分析**：
```
compress_context(dialogue_history, shared_knowledge)
    ↓
if len(history) <= keep_entries:
    return (shared_knowledge, history)
    ↓
old_entries = history[:-keep_entries]
recent_entries = history[-keep_entries:]
    ↓
for entry in old_entries:
    llm.ainvoke() → 生成摘要
    new_knowledge.append({"type": "memo", ...})
    ↓
return (new_knowledge, recent_entries)
```

**AI调用分析**：
- 模型：通过 get_fact_checker_llm 获取
- Prompt：内嵌 _MEMO_PROMPT
- 无 Tool 调用

**潜在风险**：
- 信息丢失：压缩可能丢失关键论据
- LLM 调用成本：每条旧消息都需调用 LLM

**可优化建议**：
- 性能：可批量压缩而非逐条
- 可配置：压缩策略应可配置

---

### 文件：backend/app/agents/llm.py

**模块归属**：AI 模块

**文件职责**：LLM 客户端工厂，统一创建入口

**对外提供的能力**：
- 函数：`create_llm()` - 创建 LLM 客户端
- 函数：`get_llm()` - 通用 LLM 获取
- 函数：`get_debater_llm()` - 辩手 LLM（别名）
- 函数：`get_judge_llm()` - 裁判 LLM（别名）
- 函数：`get_fact_checker_llm()` - 事实核查 LLM（别名）
- 函数：`_resolve_provider_info()` - 解析 Provider 信息

**输入依赖**：
- import：app.agents.llm_router (router)
- import：app.services.provider_service (provider_service)

**输出影响**：
- 创建并返回 BaseChatModel 实例
- 验证 API Key 存在

**数据流分析**：
```
create_llm(streaming, override)
    ↓
_resolve_provider_info(override)
    ├── 从 override 获取 provider_type, api_base_url, api_key
    ├── 如果有 provider_id，从 provider_service 查询
    └── 如果无 api_key，尝试默认 provider
    ↓
if not api_key:
    raise ValueError("缺少 API Key")
    ↓
llm_router.get_client(provider_type, model, api_key, ...)
```

**AI调用分析**：无直接调用，创建 LLM 实例

**潜在风险**：
- 强耦合：直接依赖 provider_service
- 错误处理：API Key 缺失时抛出异常

**可优化建议**：
- 可测试性：provider_service 应通过依赖注入

---

### 文件：backend/app/agents/llm_router.py

**模块归属**：AI 模块

**文件职责**：多 Provider 路由分发

**对外提供的能力**：
- 类：`LLMRouter` - 路由器类
  - 方法：`register_provider()` - 注册 Provider
  - 方法：`get_client()` - 获取客户端
- 变量：`router` - 全局路由器实例

**输入依赖**：
- import：app.agents.providers.base (BaseProviderClient)
- import：app.agents.providers.clients (OpenAIProviderClient, AnthropicProviderClient, GeminiProviderClient)

**输出影响**：
- 根据 provider_type 路由到对应 Provider
- 返回 BaseChatModel 实例

**数据流分析**：
```
LLMRouter.get_client(provider_type, model, api_key, ...)
    ↓
provider_impl = _registry.get(provider_type.lower())
    ↓
if not provider_impl:
    fallback to "openai"
    ↓
provider_impl.create_client(model, api_key, ...)
```

**AI调用分析**：无

**潜在风险**：
- 全局单例：router 作为模块级变量
- 隐式 fallback：未知 provider_type 自动回退到 openai

**可优化建议**：
- 可测试性：应支持依赖注入
- 可维护性：注册表应可配置

---

### 文件：backend/app/agents/providers/base.py

**模块归属**：AI 模块 / Provider 层

**文件职责**：Provider 抽象基类

**对外提供的能力**：
- 类：`BaseProviderClient` - 抽象基类
  - 抽象方法：`create_client()` - 创建客户端

**输入依赖**：
- import：abc (ABC, abstractmethod)
- import：langchain_core.language_models (BaseChatModel)

**输出影响**：定义 Provider 接口契约

**数据流分析**：无

**AI调用分析**：无

**潜在风险**：无

**可优化建议**：无

---

### 文件：backend/app/agents/providers/clients.py

**模块归属**：AI 模块 / Provider 层

**文件职责**：具体 Provider 实现

**对外提供的能力**：
- 类：`OpenAIProviderClient` - OpenAI 兼容客户端
- 类：`AnthropicProviderClient` - Anthropic 客户端
- 类：`GeminiProviderClient` - Google Gemini 客户端

**输入依赖**：
- import：langchain_openai (ChatOpenAI)
- import：langchain_anthropic (ChatAnthropic)
- import：langchain_google_genai (ChatGoogleGenerativeAI)

**输出影响**：
- 创建具体的 LangChain ChatModel 实例

**数据流分析**：
```
OpenAIProviderClient.create_client(model, api_key, api_base_url, ...)
    ↓
ChatOpenAI(model=model, api_key=api_key, base_url=api_base_url, ...)
```

**AI调用分析**：无

**潜在风险**：
- API Key 明文传递：在内存中

**可优化建议**：
- 安全性：考虑使用环境变量或密钥管理服务

---

### 文件：backend/app/agents/prompt_loader.py

**模块归属**：AI 模块

**文件职责**：Prompt 文件加载器

**对外提供的能力**：
- 函数：`load_prompt(filename)` - 加载 Prompt 文件
- 函数：`get_debater_system_prompt(role)` - 获取辩手 Prompt
- 函数：`get_judge_prompt()` - 获取裁判 Prompt

**输入依赖**：
- import：app.config (get_settings)

**输出影响**：
- 读取 prompts/ 目录下的 Markdown 文件

**数据流分析**：
```
get_debater_system_prompt(role)
    ↓
base = load_prompt("debater_system.md")
supplement = load_prompt(f"debater_{role}.md")
    ↓
if not supplement:
    fallback to "debater_proposer.md" or "debater_opposer.md"
    ↓
return f"{base}\n\n---\n\n{supplement}"
```

**AI调用分析**：无

**潜在风险**：
- 文件不存在：返回空字符串，可能导致 Prompt 不完整

**可优化建议**：
- 健壮性：文件不存在时应抛出异常或使用默认值

---

### 文件：backend/app/agents/events.py

**模块归属**：基础设施层

**文件职责**：事件广播接口，解耦 Agent 层与 API 层

**对外提供的能力**：
- 协议：`EventBroadcaster` - 广播器协议
- 函数：`set_broadcaster()` - 设置广播器
- 函数：`get_broadcaster()` - 获取广播器
- 函数：`broadcast_event()` - 广播事件

**输入依赖**：
- import：typing (Protocol, runtime_checkable)

**输出影响**：
- 提供 Agent 层与 WebSocket 层的解耦接口

**数据流分析**：
```
broadcast_event(session_id, message)
    ↓
if _broadcaster is not None:
    await _broadcaster.broadcast(session_id, message)
```

**AI调用分析**：无

**潜在风险**：
- 全局状态：_broadcaster 作为模块级变量
- 空指针：未设置 broadcaster 时静默失败

**可优化建议**：
- 健壮性：未设置 broadcaster 时应警告

---

### 文件：backend/app/agents/skills/search_tool.py

**模块归属**：AI 模块 / 工具层

**文件职责**：统一搜索工具

**对外提供的能力**：
- 函数：`web_search(query)` - LangChain Tool

**输入依赖**：
- import：langchain_core.tools (tool)
- import：app.search.factory (SearchProviderFactory)

**输出影响**：
- 执行网络搜索
- 返回格式化搜索结果

**数据流分析**：
```
web_search(query)
    ↓
SearchProviderFactory.search(query, num_results=5)
    ↓
格式化结果：
    "Source: {engine}\nTitle: {title}\nURL: {url}\nSummary: {snippet}"
```

**AI调用分析**：无

**潜在风险**：
- 搜索失败：返回错误消息，Agent 需处理

**可优化建议**：
- 可配置：搜索结果数量应可配置

---

## 三、API 层

---

### 文件：backend/app/api/websocket.py

**模块归属**：API 层

**文件职责**：WebSocket 端点，实时事件推送

**对外提供的能力**：
- 类：`ConnectionManager` - 连接管理器
  - 方法：`connect()` - 接受连接
  - 方法：`disconnect()` - 断开连接
  - 方法：`send()` - 发送消息
  - 方法：`broadcast()` - 广播消息
- 变量：`manager` - 全局连接管理器
- 端点：`debate_ws()` - WebSocket 端点

**输入依赖**：
- import：fastapi (APIRouter, WebSocket, WebSocketDisconnect)
- import：app.services.session_service
- import：app.db.database (get_session_factory)
- import：app.agents.runner (run_debate)
- import：app.services.intervention_manager (get_intervention_manager)

**输出影响**：
- 管理 WebSocket 连接
- 启动/停止辩论任务
- 处理用户介入

**数据流分析**：
```
WebSocket 连接 /api/ws/{session_id}
    ↓
manager.connect(session_id, websocket)
    ↓
循环接收消息：
    ├── action="start" → 启动 run_debate() 任务
    ├── action="stop" → 取消任务
    ├── action="ping" → 返回 pong
    └── action="intervene" → 添加介入消息
    ↓
WebSocketDisconnect → manager.disconnect()
```

**AI调用分析**：无

**潜在风险**：
- 内存泄漏：_debate_tasks 字典需清理
- 并发安全：多客户端同时操作同一 session

**可优化建议**：
- 可维护性：任务管理应抽取为独立服务

---

### 文件：backend/app/api/sessions.py

**模块归属**：API 层

**文件职责**：会话 CRUD REST API

**对外提供的能力**：
- 端点：`POST /api/sessions` - 创建会话
- 端点：`GET /api/sessions` - 列出会话
- 端点：`GET /api/sessions/{id}` - 获取会话
- 端点：`DELETE /api/sessions/{id}` - 删除会话
- 端点：`GET /api/sessions/{id}/export` - 导出会话

**输入依赖**：
- import：fastapi (APIRouter, Depends, HTTPException, Query, Response)
- import：sqlalchemy.ext.asyncio (AsyncSession)
- import：app.db.database (get_db)
- import：app.models.schemas
- import：app.services (session_service, export_service)

**输出影响**：
- 提供会话管理 API
- 支持导出 JSON/Markdown

**数据流分析**：
```
POST /api/sessions
    ↓
session_service.create_session(db, body)
    ↓
返回 SessionResponse
```

**AI调用分析**：无

**潜在风险**：无

**可优化建议**：无

---

## 四、服务层

---

### 文件：backend/app/services/session_service.py

**模块归属**：服务层

**文件职责**：会话持久化服务

**对外提供的能力**：
- 函数：`create_session()` - 创建会话
- 函数：`list_sessions()` - 列出会话
- 函数：`count_sessions()` - 统计会话数
- 函数：`get_session()` - 获取会话
- 函数：`get_session_record()` - 获取 ORM 记录
- 函数：`update_session_state()` - 更新状态
- 函数：`delete_session()` - 删除会话

**输入依赖**：
- import：sqlalchemy (select)
- import：app.db.models (SessionRecord)
- import：app.models.schemas (SessionCreate, SessionStatus)
- import：app.services.provider_service (provider_service)

**输出影响**：
- CRUD 操作 SQLite 数据库
- 解析 agent_configs 中的 API Key

**数据流分析**：
```
create_session(db, body)
    ↓
解析 agent_configs：
    for role, cfg in agent_configs:
        if provider_id:
            从 provider_service 获取 api_key
    ↓
创建 SessionRecord
    ↓
db.add(record) → db.commit()
```

**AI调用分析**：无

**潜在风险**：
- 循环导入风险：导入 provider_service
- API Key 处理：存储时剥离 api_key

**可优化建议**：
- 可维护性：API Key 解析逻辑应抽取

---

### 文件：backend/app/services/provider_service.py

**模块归属**：服务层

**文件职责**：Provider 配置管理，API Key 加密存储

**对外提供的能力**：
- 类：`ProviderService`
  - 方法：`list_configs()` - 列出配置（API Key 脱敏）
  - 方法：`list_configs_raw()` - 列出原始配置（含 API Key）
  - 方法：`get_default_config()` - 获取默认配置
  - 方法：`create_config()` - 创建配置
  - 方法：`update_config()` - 更新配置
  - 方法：`delete_config()` - 删除配置
- 变量：`provider_service` - 全局单例

**输入依赖**：
- import：json, threading, uuid
- import：app.config (get_settings)
- import：app.models.schemas (ModelConfigCreate, ModelConfigUpdate, ModelConfigResponse)

**输出影响**：
- 管理 data/providers.json 文件
- 线程安全读写

**数据流分析**：
```
ProviderService.__init__()
    ↓
初始化文件锁
确保 data/providers.json 存在
    ↓
create_config(config_in)
    ↓
加锁 → 读取文件 → 添加配置 → 写入文件 → 解锁
```

**AI调用分析**：无

**潜在风险**：
- 单文件存储：高并发瓶颈
- 无加密：API Key 明文存储（待实现加密）
- 全局单例：测试困难

**可优化建议**：
- 架构层：迁移到数据库
- 安全性：实现 Fernet 加密

---

### 文件：backend/app/services/export_service.py

**模块归属**：服务层

**文件职责**：导出服务，生成 JSON/Markdown

**对外提供的能力**：
- 函数：`export_json()` - 导出 JSON
- 函数：`export_markdown()` - 导出 Markdown

**输入依赖**：无外部依赖

**输出影响**：
- 生成格式化的导出内容

**数据流分析**：
```
export_markdown(session_data)
    ↓
构建 Markdown 文档：
    ├── 基本信息
    ├── 辩论全文
    ├── 最终轮评分
    └── 累积得分趋势
```

**AI调用分析**：无

**潜在风险**：无

**可优化建议**：无

---

### 文件：backend/app/services/intervention_manager.py

**模块归属**：服务层

**文件职责**：用户介入消息管理

**对外提供的能力**：
- 类：`InterventionManager`
  - 方法：`add_intervention()` - 添加介入
  - 方法：`pop_interventions()` - 弹出介入
  - 方法：`get_interventions()` - 获取介入
  - 方法：`clear_session()` - 清理会话
- 函数：`get_intervention_manager()` - 获取单例

**输入依赖**：
- import：asyncio, collections.defaultdict

**输出影响**：
- 线程安全的介入消息队列

**数据流分析**：
```
add_intervention(session_id, content)
    ↓
获取 session 级别的 asyncio.Lock
    ↓
加锁 → 追加到 _interventions[session_id] → 解锁
```

**AI调用分析**：无

**潜在风险**：
- 内存状态：重启丢失

**可优化建议**：
- 持久化：考虑存储到 Redis

---

## 五、搜索层

---

### 文件：backend/app/search/factory.py

**模块归属**：搜索层

**文件职责**：搜索 Provider 工厂，自动故障转移

**对外提供的能力**：
- 类：`ProviderInfo` - Provider 状态信息
- 类：`SearchProviderFactory`
  - 方法：`get_current_provider()` - 获取当前 Provider
  - 方法：`set_provider()` - 设置 Provider
  - 方法：`get_available_providers()` - 获取可用 Provider 列表
  - 方法：`get_provider()` - 获取最佳可用 Provider
  - 方法：`search()` - 执行搜索
  - 方法：`close()` - 清理资源

**输入依赖**：
- import：app.config (get_settings)
- import：app.search.base (SearchProvider, SearchResult)
- import：app.search.duckduckgo, searxng, tavily

**输出影响**：
- 管理搜索 Provider 实例
- 自动故障转移

**数据流分析**：
```
SearchProviderFactory.search(query)
    ↓
provider = await get_provider()
    ↓
尝试当前 Provider → 失败则 fallback
    ↓
return await provider.search(query)
```

**AI调用分析**：无

**潜在风险**：
- 类变量：_providers, _current_provider 作为类变量
- 单例模式：测试困难

**可优化建议**：
- 可测试性：改为实例模式

---

### 文件：backend/app/search/base.py

**模块归属**：搜索层

**文件职责**：搜索 Provider 抽象基类

**对外提供的能力**：
- 类：`SearchResult` - 搜索结果模型
- 类：`SearchProvider` - 抽象基类
  - 抽象方法：`search()` - 执行搜索
  - 抽象方法：`is_available()` - 健康检查

**输入依赖**：
- import：abc (ABC, abstractmethod)
- import：pydantic (BaseModel)

**输出影响**：定义搜索接口契约

**数据流分析**：无

**AI调用分析**：无

**潜在风险**：无

**可优化建议**：无

---

## 六、数据模型层

---

### 文件：backend/app/models/state.py

**模块归属**：数据模型层

**文件职责**：LangGraph 状态模型

**对外提供的能力**：
- 类：`DialogueEntry` - 对话条目
- 类型：`DialogueRole` - 角色类型
- 类型：`DialogueEntryDict` - 对话条目 TypedDict
- 类型：`SharedKnowledgeEntry` - 共享知识条目
- 类型：`TurnScore` - 轮次评分
- 类型：`RoleScores` - 角色评分

**输入依赖**：
- import：pydantic (BaseModel, Field)
- import：typing (Literal, TypedDict)

**输出影响**：
- 定义 LangGraph 状态结构

**数据流分析**：无

**AI调用分析**：无

**潜在风险**：无

**可优化建议**：无

---

### 文件：backend/app/models/schemas.py

**模块归属**：数据模型层

**文件职责**：API Request/Response Schema

**对外提供的能力**：
- 枚举：`ExportFormat`, `SessionStatus`
- 类：`SessionCreate` - 创建会话请求
- 类：`ModelConfigCreate` - 创建模型配置请求
- 类：`ModelConfigUpdate` - 更新模型配置请求
- 类：`SessionResponse` - 会话响应
- 类：`SessionListItem` - 会话列表项
- 类：`SessionListResponse` - 会话列表响应
- 类：`ModelConfigResponse` - 模型配置响应

**输入依赖**：
- import：pydantic (BaseModel, Field, field_validator)

**输出影响**：
- 定义 API 数据结构
- API Key 脱敏

**数据流分析**：无

**AI调用分析**：无

**潜在风险**：无

**可优化建议**：无

---

### 文件：backend/app/models/scoring.py

**模块归属**：数据模型层

**文件职责**：评分模型

**对外提供的能力**：
- 类：`DimensionScore` - 维度评分
- 类：`TurnScore` - 完整轮次评分
  - 属性：`average_score` - 平均分
  - 方法：`to_radar_dict()` - 转换为雷达图数据

**输入依赖**：
- import：pydantic (BaseModel, Field)

**输出影响**：
- 定义评分结构
- 用于 LLM Structured Output

**数据流分析**：无

**AI调用分析**：无

**潜在风险**：无

**可优化建议**：无

---

### 文件：backend/app/db/models.py

**模块归属**：数据模型层 / 基础设施层

**文件职责**：SQLAlchemy ORM 模型

**对外提供的能力**：
- 类：`SessionRecord` - 会话记录 ORM
- 函数：`_utcnow()` - 获取 UTC 时间
- 函数：`_gen_id()` - 生成 12 位 ID

**输入依赖**：
- import：sqlalchemy (JSON, DateTime, Integer, String, Text)
- import：app.db.database (Base)

**输出影响**：
- 定义数据库表结构

**数据流分析**：无

**AI调用分析**：无

**潜在风险**：无

**可优化建议**：无

---

### 文件：backend/app/db/database.py

**模块归属**：基础设施层

**文件职责**：SQLAlchemy 异步引擎配置

**对外提供的能力**：
- 类：`Base` - ORM 基类
- 函数：`get_session_factory()` - 获取会话工厂
- 函数：`get_db()` - FastAPI 依赖
- 函数：`init_db()` - 初始化数据库

**输入依赖**：
- import：sqlalchemy.ext.asyncio
- import：app.config (get_settings)

**输出影响**：
- 创建数据库引擎
- 创建表结构

**数据流分析**：无

**AI调用分析**：无

**潜在风险**：
- 全局变量：_engine, _session_factory

**可优化建议**：无

---

## 七、基础设施层

---

### 文件：backend/app/config.py

**模块归属**：基础设施层

**文件职责**：配置加载器

**对外提供的能力**：
- 类：`SearchConfig` - 搜索配置
- 类：`ContextWindowConfig` - 上下文窗口配置
- 类：`DebateConfig` - 辩论配置
- 类：`EnvSettings` - 环境变量配置
- 类：`Settings` - 统一配置
- 函数：`get_settings()` - 获取配置单例

**输入依赖**：
- import：yaml, pydantic, dotenv

**输出影响**：
- 历史版本中曾加载 `.env` 和 `config.yaml`
- 当前版本已统一改为读取 `runtime/config.json`

**数据流分析**：
```text
历史版本：
Settings.__init__()
    ↓
EnvSettings() → 加载 .env
_load_yaml_config() → 加载 config.yaml
    ↓
self.search = SearchConfig(yaml.get("search"))
self.debate = DebateConfig(yaml.get("debate"))

当前版本：
Settings.__init__()
    ↓
load_runtime_config() → 读取 runtime/config.json
    ↓
self.search / self.debate / self.env / self.auth / self.logging
```

**AI调用分析**：无

**潜在风险**：
- 单例模式：测试困难

**可优化建议**：
- 可测试性：支持配置覆盖

---

### 文件：backend/app/constants.py

**模块归属**：基础设施层

**文件职责**：共享常量

**对外提供的能力**：
- 变量：`ROLE_NAMES` - 角色显示名称
- 变量：`ROLE_LABELS` - 角色标签

**输入依赖**：无

**输出影响**：提供角色名称映射

**数据流分析**：无

**AI调用分析**：无

**潜在风险**：无

**可优化建议**：无

---

## 八、前端核心模块

---

### 文件：frontend/src/stores/debateStore.ts

**模块归属**：前端状态层

**文件职责**：Zustand 全局状态管理

**对外提供的能力**：
- 接口：`DebateState` - 状态接口
- Hook：`useDebateStore` - 状态 Hook
- Actions：
  - `setSessions`, `setCurrentSession`, `setCurrentSessionId`
  - `setConnected`, `setDebating`, `setPhase`
  - `appendDialogueEntry`, `startStreaming`, `appendStreamToken`, `endStreaming`
  - `updateCurrentScores`, `updateCumulativeScores`, `advanceTurn`
  - `setSearchResults`
  - `completeDebate`, `reset`

**输入依赖**：
- import：zustand
- import：../types

**输出影响**：
- 管理所有辩论相关状态
- 提供状态更新方法

**数据流分析**：
```
WebSocket 事件 → handleMessage → getStore().setXXX()
    ↓
状态更新 → React 重渲染
```

**AI调用分析**：无

**潜在风险**：
- 闭包陷阱：WebSocket 回调需使用 getState()

**可优化建议**：
- 可维护性：可拆分为多个 store

---

### 文件：frontend/src/hooks/useDebateWebSocket.ts

**模块归属**：前端 Hooks 层

**文件职责**：WebSocket 生命周期管理

**对外提供的能力**：
- Hook：`useDebateWebSocket(sessionId)`
  - 返回：`{ startDebate, stopDebate, sendIntervention }`

**输入依赖**：
- import：react (useEffect, useRef, useCallback)
- import：../stores/debateStore
- import：../types

**输出影响**：
- 管理 WebSocket 连接
- 处理重连逻辑
- 分发事件到 store

**数据流分析**：
```
useDebateWebSocket(sessionId)
    ↓
创建 WebSocket 连接
    ↓
setupSocket():
    onopen → setConnected(true)
    onmessage → handleMessage(msg) → store.setXXX()
    onclose → scheduleReconnect()
    ↓
返回控制方法
```

**AI调用分析**：无

**潜在风险**：
- 内存泄漏：需清理定时器
- 闭包陷阱：使用 getState() 而非 hook 返回值

**可优化建议**：
- 可维护性：重连策略可配置

---

### 文件：frontend/src/api/client.ts

**模块归属**：前端 API 层

**文件职责**：API 客户端封装

**对外提供的能力**：
- 对象：`api`
  - `sessions.list()`, `sessions.create()`, `sessions.get()`, `sessions.delete()`, `sessions.exportJson()`, `sessions.exportMarkdown()`
  - `models.list()`, `models.create()`, `models.update()`, `models.delete()`
  - `health.check()`, `health.searchCheck()`
  - `log.getLevel()`, `log.setLevel()`, `log.getLevels()`
  - `search.getConfig()`, `search.setProvider()`, `search.getProviders()`, `search.getHealth()`

**输入依赖**：
- import：../types

**输出影响**：
- 封装所有 REST API 调用

**数据流分析**：
```
api.sessions.create(payload)
    ↓
fetch('/api/sessions', {method: 'POST', body: JSON.stringify(payload)})
    ↓
return res.json()
```

**AI调用分析**：无

**潜在风险**：
- 错误处理：统一抛出 Error

**可优化建议**：
- 可维护性：可添加请求拦截器

---

### 文件：frontend/src/types/index.ts

**模块归属**：前端类型层

**文件职责**：TypeScript 类型定义

**对外提供的能力**：
- 类型：`LogLevel`, `DisplaySettings`
- 类型：`DimensionScore`, `TurnScore`, `SCORE_DIMENSIONS`
- 类型：`DialogueEntry`, `SearchResult`
- 类型：`Session`, `SessionStatus`, `SessionListItem`, `SessionCreatePayload`
- 类型：`ModelConfig`, `ModelConfigCreatePayload`, `ProviderFormData`, `AgentConfigResult`
- 类型：`DebatePhase`, `WSMessageType`, `WSMessage`

**输入依赖**：无

**输出影响**：
- 定义所有前端类型
- 与后端 Schema 对应

**数据流分析**：无

**AI调用分析**：无

**潜在风险**：
- 类型同步：需与后端 Schema 保持一致

**可优化建议**：
- 可维护性：可考虑自动生成类型

---

### 文件：frontend/src/components/ChatPanel.tsx

**模块归属**：前端 UI 层

**文件职责**：主聊天面板

**对外提供的能力**：
- 组件：`ChatPanel` - 默认导出

**输入依赖**：
- import：react (useEffect, useRef, useMemo)
- import：framer-motion (motion)
- import：../stores/debateStore, settingsStore
- import：./chat/MessageRow, DebateControls, StatusBanner
- import：../utils/groupDialogue

**输出影响**：
- 渲染对话历史
- 渲染状态横幅
- 渲染控制按钮

**数据流分析**：
```
ChatPanel()
    ↓
读取 currentSession, streamingRole, streamingContent
    ↓
groupDialogue(allEntries) → rows
    ↓
渲染 MessageRow 列表
```

**AI调用分析**：无

**潜在风险**：无

**可优化建议**：无

---

### 文件：frontend/src/components/HomeView.tsx

**模块归属**：前端 UI 层

**文件职责**：首页视图，创建辩论入口

**对外提供的能力**：
- 组件：`HomeView` - 默认导出

**输入依赖**：
- import：react (useState)
- import：framer-motion (motion, AnimatePresence)
- import：../stores/debateStore
- import：../api/client
- import：./shared/AgentConfigPanel
- import：../hooks/useAgentConfigs

**输出影响**：
- 渲染辩题输入框
- 渲染 Agent 配置面板
- 创建会话

**数据流分析**：
```
handleCreateDebate()
    ↓
buildAgentConfigs() → agentConfigs
    ↓
api.sessions.create({topic, max_turns, agent_configs})
    ↓
setCurrentSession(session)
setCurrentSessionId(session.id)
```

**AI调用分析**：无

**潜在风险**：无

**可优化建议**：无

---

## 九、认证模块 (Auth)

---

### 文件：backend/app/auth/__init__.py

**模块归属**：认证层

**文件职责**：认证模块入口，导出公共 API

**对外提供的能力**：
- 函数：`create_access_token` - 创建 JWT token
- 函数：`decode_access_token` - 验证 JWT token
- 函数：`hash_password` - 密码哈希
- 函数：`verify_password` - 密码验证
- 函数：`get_current_user` - 获取当前用户（强制认证）
- 函数：`get_current_user_optional` - 获取当前用户（可选认证）

**输入依赖**：
- import：app.auth.jwt
- import：app.auth.password
- import：app.auth.dependencies

**输出影响**：
- 提供统一的认证 API

**数据流分析**：无

**AI调用分析**：无

**潜在风险**：无

**可优化建议**：无

---

### 文件：backend/app/auth/jwt.py

**模块归属**：认证层

**文件职责**：JWT token 生成和验证

**对外提供的能力**：
- 函数：`create_access_token(data, expires_delta)` - 创建 JWT token
- 函数：`decode_access_token(token)` - 验证并解析 JWT token

**输入依赖**：
- import：datetime, jose (jwt, JWTError)
- import：app.config (get_settings)

**输出影响**：
- 生成带有过期时间的 JWT token
- 验证 token 签名和有效期

**数据流分析**：
```
create_access_token({"sub": user_id})
    ↓
settings.jwt_secret_key + HS256 签名
    ↓
返回 JWT token 字符串

decode_access_token(token)
    ↓
验证签名 + 解析 payload
    ↓
返回 {"sub": user_id} 或 None
```

**AI调用分析**：无

**潜在风险**：
- 密钥管理：JWT_SECRET_KEY 需要安全存储

**可优化建议**：
- 添加 token 刷新机制

---

### 文件：backend/app/auth/password.py

**模块归属**：认证层

**文件职责**：密码哈希和验证

**对外提供的能力**：
- 函数：`hash_password(password)` - 使用 bcrypt 哈希密码
- 函数：`verify_password(plain_password, hashed_password)` - 验证密码

**输入依赖**：
- import：passlib.context (CryptContext)

**输出影响**：
- 提供安全的密码存储和验证

**数据流分析**：
```
hash_password("user_password")
    ↓
bcrypt 哈希（自动加盐）
    ↓
返回哈希字符串

verify_password("input", "stored_hash")
    ↓
bcrypt 验证
    ↓
返回 True/False
```

**AI调用分析**：无

**潜在风险**：无

**可优化建议**：无

---

### 文件：backend/app/auth/dependencies.py

**模块归属**：认证层

**文件职责**：FastAPI 认证依赖注入

**对外提供的能力**：
- 函数：`get_current_user_optional` - 可选认证（返回 UserRecord | None）
- 函数：`get_current_user` - 强制认证（返回 UserRecord | None）
- 函数：`get_current_user_ws` - WebSocket 认证
- 类型别名：`OptionalUser`, `CurrentUser`, `WebSocketUser`

**输入依赖**：
- import：fastapi (Depends, HTTPException, Query)
- import：fastapi.security (HTTPBearer)
- import：sqlalchemy.ext.asyncio (AsyncSession)
- import：app.auth.jwt (decode_access_token)
- import：app.db.database (get_db)
- import：app.db.models (UserRecord)

**输出影响**：
- 提供 FastAPI Depends 可注入的认证依赖
- 支持可选认证模式（AUTH_ENABLED 环境变量）

**数据流分析**：
```
get_current_user(credentials, db)
    ↓
if not AUTH_ENABLED:
    return None
    ↓
decode_access_token(credentials.credentials)
    ↓
查询 UserRecord
    ↓
返回 UserRecord 或抛出 401
```

**AI调用分析**：无

**潜在风险**：
- 类型安全：返回类型为 `UserRecord | None`，调用方需处理 None

**可优化建议**：无

---

## 十、依赖注入模块

---

### 文件：backend/app/dependencies.py

**模块归属**：基础设施层

**文件职责**：依赖注入容器，管理单例服务

**对外提供的能力**：
- 函数：`get_provider_service()` - 获取 ProviderService 单例
- 函数：`get_llm_router()` - 获取 LLMRouter 单例
- 函数：`get_search_factory()` - 获取 SearchProviderFactory 单例
- 函数：`get_intervention_manager()` - 获取 InterventionManager 单例
- 函数：`clear_dependency_cache()` - 清除所有缓存（测试用）

**输入依赖**：
- import：functools (lru_cache)
- 延迟导入各服务类

**输出影响**：
- 提供统一的服务实例获取入口
- 支持测试时重置状态

**数据流分析**：
```
@lru_cache()
get_provider_service()
    ↓
延迟导入 ProviderService
    ↓
创建并缓存实例
    ↓
返回单例
```

**AI调用分析**：无

**潜在风险**：
- 线程安全：lru_cache 在多线程首次调用时有竞态条件

**可优化建议**：
- 添加线程锁保护首次创建

---

## 十一、用户 API 模块

---

### 文件：backend/app/api/users.py

**模块归属**：API 层

**文件职责**：用户认证和管理 API

**对外提供的能力**：
- 端点：`POST /api/users/register` - 用户注册
- 端点：`POST /api/users/login` - 用户登录（返回 JWT token）
- 端点：`GET /api/users/me` - 获取当前用户信息
- 端点：`GET /api/users/auth/status` - 获取认证状态

**输入依赖**：
- import：fastapi (APIRouter, Depends, HTTPException)
- import：sqlalchemy.ext.asyncio (AsyncSession)
- import：app.auth.* (create_access_token, hash_password, verify_password, get_current_user_optional)
- import：app.db.database (get_db)
- import：app.db.models (UserRecord)
- import：app.models.schemas (UserRegister, UserLogin, UserResponse, TokenResponse)

**输出影响**：
- 提供用户注册、登录、信息查询 API
- 返回 JWT token 用于后续认证

**数据流分析**：
```
POST /api/users/register
    ↓
hash_password(password)
    ↓
创建 UserRecord
    ↓
返回 UserResponse

POST /api/users/login
    ↓
verify_password(password, stored_hash)
    ↓
create_access_token({"sub": user.id})
    ↓
返回 TokenResponse
```

**AI调用分析**：无

**潜在风险**：
- 密码强度：未强制密码复杂度要求

**可优化建议**：
- 添加密码强度验证
- 添加邮箱验证

---

## 十二、数据迁移脚本

---

### 文件：backend/scripts/migrate_providers_to_db.py

**模块归属**：脚本层

**历史说明**：该脚本已从当前代码库移除，以下内容仅保留其历史职责说明。

**文件职责**：将 Provider 配置从 JSON 文件迁移到数据库

**对外提供的能力**：
- 函数：`main()` - 执行迁移

**输入依赖**：
- import：asyncio, json
- import：cryptography.fernet (Fernet)
- import：sqlalchemy (select)
- import：app.db.database (get_session_factory)
- import：app.db.models (ProviderRecord)

**输出影响**：
- 读取 data/providers.json
- 写入 providers 表
- 备份原 JSON 文件

**数据流分析**：
```
main()
    ↓
读取 providers.json
    ↓
for each provider:
    ├── 加密 api_key (Fernet)
    └── 创建 ProviderRecord
    ↓
写入数据库
    ↓
备份 providers.json → providers.json.bak
```

**AI调用分析**：无

**潜在风险**：
- 迁移失败无回滚

**可优化建议**：
- 添加事务和回滚机制

---

*文档版本：1.1*
*最后更新：2026-03-17*
