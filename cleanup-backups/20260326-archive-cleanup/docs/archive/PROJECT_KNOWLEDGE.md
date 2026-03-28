# Elenchus 项目结构认知文档

> 本文档为项目的「长期记忆层」，旨在帮助后续模型快速理解项目全貌。
> 生成时间：2026-03-17
> 文档版本：1.1
> 项目类型：AI 多智能体辩论框架

---

## 一、项目架构概览

### 1.1 架构类型判断

**混合架构**：LangGraph Agent Workflow + REST API + WebSocket 实时通信

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (React 19)                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │  Zustand    │  │  WebSocket  │  │  UI Components          │  │
│  │  Stores     │◄─│  Hook       │  │  (ChatPanel/HomeView)   │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└───────────────────────────────┬─────────────────────────────────┘
                                │ HTTP + WebSocket + JWT Auth
┌───────────────────────────────▼─────────────────────────────────┐
│                     Backend (FastAPI)                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │  REST API   │  │  WebSocket  │  │  Services Layer         │  │
│  │  + JWT Auth │  │  + JWT Auth │  │  (DI Container)         │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└───────────────────────────────┬─────────────────────────────────┘
                                │
┌───────────────────────────────▼─────────────────────────────────┐
│                   LangGraph Agent Layer                          │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    DebateGraphState                          ││
│  │  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐  ││
│  │  │ Debater  │◄─►│  Judge   │◄─►│ Context  │◄─►│  Tool    │  ││
│  │  │ (Proposer│   │ (Scoring)│   │ Manager  │   │ Executor │  ││
│  │  │  Opposer)│   └──────────┘   └──────────┘   └──────────┘  ││
│  │  └──────────┘                                                 ││
│  └─────────────────────────────────────────────────────────────┘│
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │  LLM Router │  │  Providers  │  │  Search Tools           │  │
│  │  (Multi-LLM)│  │  (OpenAI/   │  │  (DuckDuckGo/SearXNG/   │  │
│  │             │  │   Anthropic)│  │   Tavily)               │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                                │
┌───────────────────────────────▼─────────────────────────────────┐
│                     Data Layer                                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │  SQLite     │  │  Providers  │  │  Prompts                │  │
│  │  (Sessions  │  │  (DB Store  │  │  (Markdown Files)       │  │
│  │   + Users)  │  │   + Fernet) │  │                         │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 技术栈

| 层级 | 技术选型 |
|------|----------|
| 前端框架 | React 19 + TypeScript 5.9 |
| 前端构建 | Vite 7 |
| 前端状态 | Zustand 5 (含 persist 中间件) |
| 前端样式 | Tailwind CSS 4 |
| 前端动画 | Framer Motion |
| 后端框架 | FastAPI 0.115 |
| Agent 编排 | LangGraph 0.2 |
| LLM 集成 | LangChain (OpenAI/Anthropic/Google) |
| 数据库 | SQLite + SQLAlchemy 2.0 (Async) |
| 实时通信 | WebSocket + JWT 认证 |
| 认证授权 | JWT (python-jose) + bcrypt |
| 加密 | Fernet (cryptography) |
| 依赖注入 | FastAPI Depends + lru_cache |
| 日志 | Python logging + TimedRotatingFileHandler |

---

## 二、模块级结构树（按功能划分）

### 2.1 模块总览

```
Elenchus/
│
├── 🎯 核心模块 (Core Modules)
│   ├── backend/app/agents/graph.py          # LangGraph 状态机主图
│   ├── backend/app/agents/runner.py         # 辩论执行器
│   ├── backend/app/agents/debater.py        # 辩手节点逻辑
│   └── backend/app/agents/judge.py          # 裁判节点逻辑
│
├── 🤖 AI/Agent 模块
│   ├── backend/app/agents/llm.py            # LLM 工厂
│   ├── backend/app/agents/llm_router.py     # LLM 路由中心
│   ├── backend/app/agents/providers/        # Provider 客户端实现
│   │   ├── base.py                          # 抽象基类
│   │   └── clients.py                       # OpenAI/Anthropic/Gemini
│   ├── backend/app/agents/context_manager.py # 上下文压缩
│   ├── backend/app/agents/prompt_loader.py  # Prompt 加载器
│   └── backend/app/agents/skills/           # 工具技能库
│       └── search_tool.py                   # 统一搜索工具
│
├── 🌐 API 层
│   ├── backend/app/main.py                  # FastAPI 入口
│   ├── backend/app/api/sessions.py          # 会话 CRUD
│   ├── backend/app/api/websocket.py         # WebSocket 端点
│   ├── backend/app/api/models.py            # 模型配置 API
│   ├── backend/app/api/log.py               # 日志配置 API
│   └── backend/app/api/search.py            # 搜索配置 API
│
├── 📦 服务层 (Services)
│   ├── backend/app/services/session_service.py   # 会话持久化
│   ├── backend/app/services/provider_service.py  # Provider 配置管理 (数据库存储)
│   ├── backend/app/services/export_service.py    # 导出服务
│   ├── backend/app/services/intervention_manager.py # 用户介入管理
│   └── backend/app/services/log_service.py       # 日志配置服务
│
├── 🔐 认证层 (Auth)
│   ├── backend/app/auth/__init__.py          # 认证模块入口
│   ├── backend/app/auth/jwt.py               # JWT token 生成/验证
│   ├── backend/app/auth/password.py          # bcrypt 密码哈希
│   └── backend/app/auth/dependencies.py      # FastAPI 认证依赖注入
│
├── 🔧 依赖注入 (Dependencies)
│   └── backend/app/dependencies.py           # DI 容器 (lru_cache 单例)
│
├── 🔍 搜索层 (Search)
│   ├── backend/app/search/factory.py        # 搜索工厂（单例）
│   ├── backend/app/search/base.py           # 搜索基类
│   ├── backend/app/search/duckduckgo.py     # DuckDuckGo 搜索
│   ├── backend/app/search/searxng.py        # SearXNG 搜索
│   └── backend/app/search/tavily.py         # Tavily 搜索
│
├── 📊 数据模型层 (Models)
│   ├── backend/app/models/state.py          # LangGraph 状态模型
│   ├── backend/app/models/schemas.py        # API Schema
│   ├── backend/app/models/scoring.py        # 评分模型
│   └── backend/app/db/models.py             # ORM 模型
│
├── 🗄️ 基础设施层 (Infrastructure)
│   ├── backend/app/config.py                # 配置加载器
│   ├── backend/app/constants.py             # 共享常量
│   ├── backend/app/db/database.py           # 数据库引擎
│   └── backend/app/agents/events.py         # 事件广播接口
│
├── 🎨 前端 UI 层
│   ├── frontend/src/App.tsx                 # 应用入口
│   ├── frontend/src/components/
│   │   ├── ChatPanel.tsx                    # 主聊天面板
│   │   ├── HomeView.tsx                     # 首页视图
│   │   ├── ScorePanel.tsx                   # 评分面板
│   │   ├── chat/                            # 聊天相关组件
│   │   │   ├── DebateControls.tsx           # 辩论控制
│   │   │   ├── MessageRow.tsx               # 消息行
│   │   │   └── StatusBanner.tsx             # 状态横幅
│   │   ├── sidebar/                         # 侧边栏组件
│   │   │   ├── SessionList.tsx              # 会话列表
│   │   │   ├── SettingsPanel.tsx            # 设置面板
│   │   │   ├── ModelConfigManager.tsx       # 模型配置管理
│   │   │   ├── ProviderForm.tsx             # Provider 表单
│   │   │   ├── ProviderSidebar.tsx          # Provider 侧边栏
│   │   │   ├── SearchConfigTab.tsx          # 搜索配置标签
│   │   └── shared/                          # 共享组件
│   │       ├── AgentConfigPanel.tsx         # Agent 配置面板
│   │       ├── BackendHealthCheck.tsx       # 后端健康检查
│   │       ├── CustomSelect.tsx             # 自定义选择器
│   │       ├── ErrorBoundary.tsx            # 错误边界
│   │       └── ToastContainer.tsx           # Toast 容器
│   ├── frontend/src/stores/
│   │   ├── debateStore.ts                   # 辩论状态
│   │   ├── settingsStore.ts                 # 设置状态 (含 persist)
│   │   └── themeStore.ts                    # 主题状态
│   ├── frontend/src/hooks/
│   │   ├── useDebateWebSocket.ts            # WebSocket Hook
│   │   ├── useAgentConfigs.ts               # Agent 配置 Hook
│   │   ├── useModelConfigManager.ts         # 模型配置管理 Hook
│   │   ├── useSessionCreate.ts              # 会话创建 Hook
│   │   └── useToastState.ts                 # Toast 状态 Hook
│   ├── frontend/src/api/client.ts           # API 客户端
│   ├── frontend/src/types/index.ts          # TypeScript 类型
│   └── frontend/src/utils/                  # 工具函数
│
├── 📝 Prompts (提示词模板)
│   ├── backend/prompts/debater_system.md    # 辩手核心设定
│   ├── backend/prompts/debater_proposer.md  # 正方补充设定
│   ├── backend/prompts/debater_opposer.md   # 反方补充设定
│   ├── backend/prompts/judge_system.md      # 裁判系统设定
│   └── backend/prompts/fact_checker_system.md # 事实核查设定
│
└── 🧪 测试与脚本
    ├── backend/tests/                       # 测试套件
    └── backend/scripts/cli_debate.py        # CLI 辩论脚本
```

### 2.2 模块职责速查表

| 模块类型 | 模块名称 | 核心职责 |
|----------|----------|----------|
| 核心模块 | graph.py | LangGraph 状态机定义，辩论流程编排，显式节点追踪 |
| 核心模块 | runner.py | 执行辩论图，流式推送事件，持久化状态 |
| 核心模块 | debater.py | 辩手节点：生成辩论论点 |
| 核心模块 | judge.py | 裁判节点：五维度评分 |
| AI模块 | llm.py | LLM 客户端工厂，统一创建入口（异步） |
| AI模块 | llm_router.py | 多 Provider 路由分发 |
| AI模块 | context_manager.py | 上下文滑动窗口 + 摘要压缩 |
| AI模块 | events.py | 事件广播协议，解耦 Agent 与 WebSocket |
| AI模块 | prompt_loader.py | Prompt 文件加载器 |
| AI模块 | skills/search_tool.py | 统一搜索工具 (LangChain @tool) |
| API层 | main.py | FastAPI 应用入口，生命周期管理 |
| API层 | websocket.py | WebSocket 连接管理，实时事件推送，JWT 认证 |
| API层 | sessions.py | 会话 CRUD REST API，用户隔离 |
| API层 | models.py | Provider 配置 REST API |
| API层 | users.py | 用户认证 API (注册/登录/用户信息) |
| API层 | log.py | 日志配置 REST API |
| API层 | search.py | 搜索配置 REST API |
| 服务层 | session_service.py | 会话 CRUD，状态快照持久化，用户隔离 |
| 服务层 | provider_service.py | Provider 配置管理 (数据库存储 + Fernet 加密) |
| 服务层 | export_service.py | 导出服务 (JSON/Markdown) |
| 服务层 | intervention_manager.py | 用户介入消息管理 (线程安全锁机制) |
| 服务层 | log_service.py | 日志管理器 (单例模式，支持动态级别) |
| 认证层 | auth/jwt.py | JWT token 生成和验证 |
| 认证层 | auth/password.py | bcrypt 密码哈希和验证 |
| 认证层 | auth/dependencies.py | FastAPI 认证依赖注入 (可选认证模式) |
| 依赖注入 | dependencies.py | DI 容器 (lru_cache 单例管理) |
| 搜索层 | factory.py | 搜索 Provider 工厂，自动故障转移 |
| 搜索层 | base.py | 搜索 Provider 抽象基类 |
| 搜索层 | duckduckgo.py | DuckDuckGo 搜索实现 |
| 搜索层 | searxng.py | SearXNG 搜索实现 |
| 搜索层 | tavily.py | Tavily 搜索实现 |
| 数据模型 | db/models.py | 历史上承载过 ORM 模型；当前主要保留 `_gen_id()`、`_utcnow()` 等共享辅助函数 |
| 前端 | debateStore.ts | Zustand 全局状态管理 |
| 前端 | settingsStore.ts | Zustand 设置状态 (含 persist) |
| 前端 | useDebateWebSocket.ts | WebSocket 生命周期管理 |

---

## 三、系统主流程说明

### 3.1 辩论执行主流程

```
用户创建会话 → REST API 创建 SessionRecord
        ↓
用户点击「开始辩论」→ WebSocket 发送 {action: "start"}
        ↓
后端启动 run_debate() 任务
        ↓
┌─────────────────────────────────────────────────────────────┐
│ LangGraph 状态机循环                                          │
│                                                              │
│  manage_context → set_speaker → speaker ↔ tool_executor     │
│        ↑                              ↓                      │
│        │                         [next_speaker]              │
│        │                              ↓                      │
│        │                          judge → advance_turn       │
│        │                              ↓                      │
│        └──────────── [continue] ←───────────                 │
│                                 ↓ [end]                      │
│                              END                             │
└─────────────────────────────────────────────────────────────┘
        ↓
每个节点执行后：
  1. broadcast_event() → WebSocket 推送事件
  2. _persist_state() → SQLite 持久化
        ↓
辩论结束 → 推送 debate_complete 事件
```

### 3.2 数据流向

```
前端用户输入
    ↓
SessionCreate API
    ↓
session_service.create_session()
    ├── 解析 agent_configs，从 provider_service 获取 api_key
    ├── 创建 SessionRecord (SQLite)
    └── 返回 session_id
    ↓
WebSocket 连接 /api/ws/{session_id}
    ↓
前端发送 {action: "start"}
    ↓
后端启动 run_debate() asyncio.Task
    ↓
LangGraph 执行：
    ├── debater_speak() → LLM 调用 → 生成论点
    ├── tool_executor → web_search → 搜索结果
    ├── judge_score() → LLM 调用 → 结构化评分
    └── 每步 → broadcast_event() → WebSocket
    ↓
前端 useDebateWebSocket 接收事件
    ↓
Zustand store 更新
    ↓
UI 重渲染 (ChatPanel/MessageRow/ScorePanel)
```

---

## 四、关键模块详解

### 4.1 LangGraph 状态机 (graph.py)

**状态定义**：
```python
class DebateGraphState(TypedDict, total=False):
    session_id: str
    topic: str
    participants: list[str]
    current_turn: int
    max_turns: int
    current_speaker: str
    current_speaker_index: int
    dialogue_history: Annotated[list[DialogueEntryDict], add]  # 累加器
    shared_knowledge: Annotated[list[SharedKnowledgeEntry], add]  # 累加器
    messages: Annotated[list[BaseMessage], add_messages]  # LangChain 消息
    current_scores: dict[str, Any]
    cumulative_scores: dict[str, Any]
    status: Literal['in_progress', 'completed', 'error']
    error: str | None
    agent_configs: dict[str, dict[str, Any]]
    last_executed_node: str  # 新增：显式节点追踪
```

**节点函数**：
| 节点 | 函数 | 职责 |
|------|------|------|
| manage_context | node_manage_context | 压缩旧对话，注入用户介入 |
| set_speaker | node_set_speaker | 确定下一个发言人 |
| speaker | node_debater_speak | 调用 LLM 生成论点 |
| tool_executor | node_tool_executor | 执行工具调用（搜索） |
| judge | node_judge_score | 五维度评分 |
| advance_turn | node_advance_turn | 增加轮次，清理消息 |

**条件边**：
- `should_execute_tools`: 检查是否需要执行工具
- `should_continue`: 检查是否继续下一轮

### 4.2 LLM 路由系统

**架构**：
```
llm.py (工厂)
    ↓
llm_router.py (路由)
    ↓
providers/clients.py (具体实现)
    ├── OpenAIProviderClient → ChatOpenAI
    ├── AnthropicProviderClient → ChatAnthropic
    └── GeminiProviderClient → ChatGoogleGenerativeAI
```

**OpenAI 兼容 API 支持**：通过设置 `provider_type="openai"` 并配置 `api_base_url`，可以支持 DeepSeek、Groq、Ollama 等 OpenAI 兼容的 API。

**API Key 解析优先级**：
1. agent_configs 中的 api_key（最高优先级）
2. provider_id 对应的 provider_service 配置
3. 默认 provider 配置

### 4.3 WebSocket 协议

**服务端 → 客户端**：
| type | 说明 |
|------|------|
| system | 系统消息 |
| status | 状态更新（phase, node） |
| speech_start | 发言开始 |
| speech_end | 发言结束（完整内容） |
| fact_check_result | 搜索结果 |
| judge_score | 裁判评分 |
| turn_complete | 轮次完成 |
| debate_complete | 辩论结束 |
| error | 错误消息 |
| audience_message | 观众介入消息 |

**客户端 → 服务端**：
| action | 说明 |
|--------|------|
| start | 开始辩论 |
| stop | 终止辩论 |
| ping | 心跳 |
| intervene | 用户介入 |

---

## 五、AI 调用分析

### 5.1 LLM 调用点

| 调用位置 | 模型用途 | Prompt 来源 | 是否有 Tool |
|----------|----------|-------------|-------------|
| debater_speak() | 生成辩论论点 | debater_system.md + debater_{role}.md | web_search |
| judge_score() | 五维度评分 | judge_system.md | 无 |
| compress_context() | 上下文摘要压缩 | 内嵌 prompt | 无 |

### 5.2 Prompt 管理

**Prompt 文件结构**：
```
backend/prompts/
├── debater_system.md      # 辩手核心设定（思维方式、发言原则）
├── debater_proposer.md    # 正方补充设定
├── debater_opposer.md     # 反方补充设定
├── judge_system.md        # 裁判评分标准（五维度定义）
└── fact_checker_system.md # 事实核查设定
```

**Prompt 加载机制**：
- `prompt_loader.py` 提供热加载（无缓存）
- 支持 role 扩展（proposer_1, proposer_2...）

### 5.3 AI 行为风险点

| 风险类型 | 位置 | 描述 |
|----------|------|------|
| 评分解析失败 | judge.py | 部分模型不支持 structured output，需 fallback |
| 上下文压缩失败 | context_manager.py | LLM 压缩可能丢失关键信息 |
| 搜索结果幻觉 | debater.py | Agent 可能误用搜索结果 |

---

## 六、潜在风险与技术债

### 6.1 架构层面

| 风险 | 位置 | 影响 | 状态 |
|------|------|------|------|
| 单体数据库 | database.py | 无法水平扩展 | 待改进（考虑 PostgreSQL） |
| 内存状态 | intervention_manager.py | 重启丢失 | 待改进（考虑 Redis） |
| Provider 存储 | provider_service.py | 高并发瓶颈 | ✅ 已迁移到数据库 |
| 全局单例 | 多处 | 测试困难 | ✅ 已重构为依赖注入 |

### 6.2 代码层面

| 风险 | 位置 | 描述 | 状态 |
|------|------|------|------|
| 隐式状态推断 | runner.py | `_infer_node()` 通过状态推断节点 | ✅ 已改为显式追踪 |
| 魔法字符串 | graph.py | "duckduckgo", "searxng" 等 | 待改进 |
| 循环导入风险 | session_service.py 导入 provider_service | 需注意导入顺序 | ✅ 已通过 DI 解决 |
| 类型安全 | auth/dependencies.py | `type: ignore` 绕过检查 | ✅ 已修复 |

### 6.3 安全层面

| 风险 | 位置 | 描述 | 状态 |
|------|------|------|------|
| 无认证保护 | API 端点 | 所有 API 无认证 | ✅ 已实现 JWT 认证 |
| API Key 明文存储 | provider_service.py | 密钥未加密 | ✅ 已实现 Fernet 加密 |
| 加密密钥管理 | provider_service.py | 自动生成临时密钥 | ✅ 已强制要求配置 |
| WebSocket 无认证 | websocket.py | 连接无身份验证 | ✅ 已实现 JWT 认证 |

### 6.4 前端层面

| 风险 | 位置 | 描述 |
|------|------|------|
| 状态同步 | useDebateWebSocket.ts | 使用 getState() 避免闭包陷阱 |
| 重复消息 | debateStore.ts | endStreaming 有去重逻辑，但依赖 timestamp |

---

## 七、扩展点与插件机制

### 7.1 添加新 LLM Provider

1. 在 `backend/app/agents/providers/clients.py` 实现 `BaseProviderClient` 子类
2. 在 `llm_router.py` 的 `_registry` 中注册
3. 前端 `ModelConfigManager.tsx` 添加 provider_type 选项

### 7.2 添加新辩论工具

1. 在 `backend/app/agents/skills/` 创建工具文件
2. 使用 `@tool` 装饰器定义工具函数
3. 在 `skills/__init__.py` 的 `get_all_skills()` 中注册

### 7.3 添加新搜索 Provider

1. 在 `backend/app/search/` 实现 `SearchProvider` 子类
2. 在 `factory.py` 中初始化并添加到 fallback 顺序

---

## 八、配置指南

### 8.1 运行时配置（当前以 `runtime/config.json` 为准）

> 历史说明：本节原先按 `.env` / `config.yaml` 分开整理，当前运行时已统一为 `runtime/config.json`。旧文件仅可能在首次启动时作为导入来源。

| 路径 | 键 | 说明 |
|------|----|------|
| `runtime/config.json` | `auth.enabled` | 是否启用认证 |
| `runtime/config.json` | `auth.jwt_secret_key` | JWT 签名密钥 |
| `runtime/config.json` | `auth.jwt_expire_minutes` | JWT 过期时间（分钟） |
| `runtime/config.json` | `server.database_url` | SQLite 数据库路径 |
| `runtime/config.json` | `server.host` / `server.port` | 后端监听地址与端口 |
| `runtime/config.json` | `server.cors_origins` | 允许跨域源 |
| `runtime/config.json` | `search.provider` | 当前搜索 Provider |
| `runtime/config.json` | `search.searxng.base_url` | SearXNG 地址 |
| `runtime/config.json` | `search.tavily.api_key` | Tavily API Key |
| `runtime/config.json` | `debate.default_max_turns` | 默认辩论轮数 |
| `runtime/config.json` | `logging.level` | 日志级别 |

### 8.2 生成加密密钥

```bash
# 生成 Fernet 加密密钥
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

# 生成 JWT 密钥（至少 32 字符）
openssl rand -hex 32
```

### 8.3 历史配置拆分说明

历史版本曾将搜索、辩论、日志和部分认证参数分别存放在 `.env`、`config.yaml`、`log_config.json` 等文件中；当前这些配置都已统一收敛到 `runtime/config.json`，以避免多处来源并存。

---

## 九、测试策略

### 9.1 现有测试

| 测试文件 | 测试内容 |
|----------|----------|
| test_graph.py | LangGraph 状态机测试 |
| test_session_service.py | 会话服务测试 |
| manual_test_debate.py | 手动辩论测试 |
| manual_test_search.py | 手动搜索测试 |

### 9.2 测试命令

```bash
cd backend
pytest                          # 运行全部测试
pytest tests/test_graph.py -v   # 详细输出
```

---

## 十、路线图与未来重构建议

### 10.1 已完成的改进（v1.1）

| 改进项 | 状态 | 收益 |
|--------|------|------|
| Provider 存储迁移到数据库 | ✅ 完成 | 高并发支持、事务安全、Fernet 加密 |
| 依赖注入重构 | ✅ 完成 | 可测试性、解耦、支持多实例 |
| 显式节点状态追踪 | ✅ 完成 | 可维护性、调试便利 |
| JWT 认证授权机制 | ✅ 完成 | 安全性、用户隔离、可选认证模式 |
| WebSocket 认证 | ✅ 完成 | 安全性、复用认证依赖 |
| API Key 强制加密 | ✅ 完成 | 数据安全、防止密钥丢失 |

### 10.2 路线图（来自 README）

- [ ] Vector Memory (RAG)：将 shared_knowledge 存入向量数据库
- [ ] Human-in-the-Loop：支持人工介入暂停和评判
- [ ] 异步事件总线：Redis Pub/Sub + Celery
- [ ] 多辩手支持：扩展到 3+ 角色
- [ ] 可视化图谱：展示辩论逻辑结构
- [ ] 插件系统：支持加载自定义技能插件

### 10.3 LangGraph 重构评估

#### 评估结论
**可行性：高** - 当前工作流相对简单，可以重构到自建后端工作流。

#### 当前 LangGraph 使用情况
- **核心模块**：[graph.py](../../backend/app/agents/graph.py) - StateGraph 状态机定义
- **执行模块**：[runner.py](../../backend/app/agents/runner.py) - astream() 流式执行
- **节点数量**：6 个节点（manage_context、set_speaker、speaker、tool_executor、judge、advance_turn）
- **业务逻辑**：已良好解耦，debater_speak()、judge_score() 等独立可复用

#### 重构方案
**推荐：分阶段重构**
1. **阶段 1**：保留 LangGraph，提取状态合并逻辑
2. **阶段 2**：实现双引擎支持（配置开关切换）
3. **阶段 3**：根据实际稳定性决定是否完全移除

#### 重构收益与成本
| 收益 | 成本 |
|------|------|
| 减少依赖（移除 langgraph、langchain 可选） | 开发工作量约 200-300 行代码 |
| 完全掌控工作流执行逻辑 | 需重写工作流测试 |
| 调试便利（自定义日志、断点） | 需自行维护工作流引擎 |
| 性能优化（移除抽象层开销） | 无法直接使用 LangGraph 新特性 |

### 10.4 后续重构建议

| 优先级 | 建议 | 收益 |
|--------|------|------|
| 高 | PostgreSQL 迁移 | 更高并发、连接池 |
| 高 | API 限流 | 防止滥用 |
| 中 | WebSocket 连接状态外部化 (Redis) | 多实例部署 |
| 中 | 监控和可观测性 (Prometheus) | 运维友好 |
| 低 | 微服务拆分 | 独立扩展 |

---

*文档版本：1.1*
*最后更新：2026-03-17*
