# 项目愿景
开发一个名为 "Elenchus" 的多智能体辩论框架。系统需要控制多个 AI Agent 围绕特定议题进行有深度、有逻辑、基于事实的对抗性辩论，并由独立的裁判 Agent 进行多维度量化评分。

---

# 技术栈

| 层次 | 选型 |
|------|------|
| **后端框架** | Python 3.11+, FastAPI (REST + WebSocket), Uvicorn |
| **AI 编排** | LangGraph (状态机驱动多智能体), LangChain |
| **LLM 路由** | **LiteLLM** — 统一接入 100+ 提供商（OpenAI、Anthropic、Ollama、Azure、DeepSeek、Groq 等），单一 `ChatLiteLLM` 接口，无需维护多套客户端 |
| **数据验证** | Pydantic v2 (模型、Structured Output), pydantic-settings (.env 加载) |
| **数据持久化** | SQLite + SQLAlchemy (async), aiosqlite |
| **前端** | React 18 + Vite + TypeScript, Tailwind CSS v4, Zustand (状态管理), Framer Motion (动画) |
| **图表** | ECharts 或 Recharts（雷达图 + 趋势图） |
| **搜索** | SearXNG（本地部署，主力）→ Tavily（云端备用），SearchProvider 抽象层自动降级 |
| **后续扩展** | 代码结构保持高度解耦，以便 Tauri 打包为桌面应用 |

---

# 核心系统架构

## 1. 核心数据结构 (GraphState)
`GraphState` 是流经 LangGraph 各节点的单一数据源，定义于 `backend/app/models/state.py`：

- `session_id`, `topic`, `participants`（动态列表，不硬编码正反方）
- `current_turn`, `max_turns`, `current_speaker`, `current_speaker_index`
- `dialogue_history: Annotated[list[DialogueEntry], add]`（使用 LangGraph `add` reducer 累积追加）
- `context_summary`（压缩后的历史摘要）, `search_context`（当前轮检索结果）
- `current_scores`, `cumulative_scores`（评分数据）
- `status`, `error`

## 2. 智能体节点 (Nodes)
实现于 `backend/app/agents/`：

| 节点 | 文件 | 职责 |
|------|------|------|
| `manage_context` | `context_manager.py` | 滑动窗口 + LLM 摘要压缩历史对话 |
| `proposer_speaks` / `opposer_speaks` | `debater.py` | 根据角色和轮次生成论点（开场/反驳），自动提取 URL 引用 |
| `fact_check_proposer` / `fact_check_opposer` | `fact_checker.py` | LLM 提取可验证声明 → 搜索 → 去重后注入 `search_context` |
| `judge` | `judge.py` | 逐一评分各辩手，解析失败自动重试，维护 `cumulative_scores` 趋势 |
| `advance_turn` | `graph.py` | 推进轮次计数，触发 `should_continue` 条件边 |

## 3. LangGraph 辩论图
定义于 `backend/app/agents/graph.py`：

```
START
  → manage_context → set_proposer → proposer_speaks → fact_check_proposer
  → set_opposer   → opposer_speaks → fact_check_opposer
  → judge → advance_turn
       ├─[continue]→ manage_context  (下一轮)
       └─[end]     → END
```

编译后的图通过 `compile_debate_graph()` 获取，由 `runner.py` 以 `astream()` 流式执行。

## 4. LLM 配置管理（LiteLLM）

### 4.1 统一路由
所有 LLM 调用均通过 `langchain-litellm` 的 `ChatLiteLLM` 完成，实现于 `backend/app/agents/llm.py`。

**模型命名约定**（`provider/model-name`）：
```yaml
"openai/gpt-4o"                   # OpenAI
"anthropic/claude-sonnet-4-20250514"  # Anthropic
"ollama/qwen2.5:32b"              # Ollama 本地
"azure/<deployment>"              # Azure OpenAI
"groq/llama-3.3-70b-versatile"   # Groq
"deepseek/deepseek-chat"          # DeepSeek
```

### 4.2 配置优先级链
```
per-agent config.yaml (api_base_url / api_key)
        ↓
.env 全局 (LiteLLM 规范全局环境变量，如 OPENAI_API_KEY, DEEPSEEK_API_KEY, OLLAMA_API_BASE 等)
```

### 4.3 双层配置文件
- **`.env`**（敏感信息）：按 LiteLLM 规范配置的全局路由 Key 和 Base，数据库 URL、SearXNG 地址。
- **`config.yaml`**（应用配置）：每个 Agent 的模型、温度、token 上限、可选的 `api_base_url`/`api_key` 覆盖。

典型混合部署示例：
```yaml
agents:
  debater:
    model: "ollama/qwen2.5:32b"
    api_base_url: "http://localhost:11434"
    api_key: "ollama"
  judge:
    model: "anthropic/claude-opus-4-5"
    # 使用 .env 里的 ANTHROPIC_API_KEY
```

## 5. 搜索引擎架构

### 5.1 主力：本地 SearXNG
- Docker 部署：`docker run -p 8080:8080 searxng/searxng`
- 零 API 费用，无速率限制，多引擎聚合（Google/Bing/DuckDuckGo 等）
- 通过 `SEARXNG_BASE_URL` 环境变量配置（默认 `http://localhost:8080`）

### 5.2 SearchProvider 抽象层
实现于 `backend/app/search/`：
- `base.py`：`SearchProvider` 抽象接口 + `SearchResult` 统一数据格式
- `searxng.py`：SearXNG JSON API 实现
- `tavily.py`：Tavily Deep Search 备用实现
- `factory.py`：`SearchProviderFactory` — 自动检测可用性，SearXNG → Tavily 自动降级，错误时重试备用

## 6. 上下文窗口管理
实现于 `backend/app/agents/context_manager.py`：
- **滑动窗口**：保留最近 N 轮（默认 3 轮）完整对话
- **LLM 摘要压缩**：超出窗口的早期对话 → LLM 生成要点摘要存入 `context_summary`
- **Context 组装**：每次 Agent 发言前，将摘要 + 近期对话 + 搜索结果拼装为结构化 context block

## 7. 评分维度 (Pydantic Schema)
定义于 `backend/app/models/scoring.py`，裁判必须用 JSON 输出：

| 字段 | 中文 | 说明 |
|------|------|------|
| `logical_rigor` | 逻辑严密度 | 是否存在逻辑谬误、以偏概全 |
| `evidence_quality` | 证据质量 | 事实/数据/引用是否可由 `search_context` 验证 |
| `rebuttal_strength` | 反驳力度 | 是否精准打击对方上一轮核心论点 |
| `consistency` | 前后自洽 | 论点是否与己方历史发言一致 |
| `persuasiveness` | 说服力 | 语言感染力与结构清晰度 |
| `overall_comment` | 整体评语 | 裁判对本轮的文字点评 |

每个维度均包含 `score`（1-10）和 `rationale`（理由文字）。

## 8. REST API
实现于 `backend/app/api/sessions.py`（由 SQLAlchemy async 持久化）：

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/sessions` | POST | 创建辩论 Session |
| `/api/sessions` | GET | 列出所有 Session |
| `/api/sessions/{id}` | GET | 获取 Session 完整数据 |
| `/api/sessions/{id}` | DELETE | 删除 Session |
| `/api/sessions/{id}/export?format=json\|markdown` | GET | 导出（含评分理由、搜索上下文全量元数据） |
| `/api/ws/{session_id}` | WebSocket | 实时辩论事件流 |
| `/health` | GET | 服务健康检查 |
| `/health/search` | GET | 搜索 Provider 可用性检查 |

## 9. WebSocket 消息协议
定义于 `backend/app/api/websocket.py`：

**Client → Server：**
```json
{ "action": "start", "topic": "...", "max_turns": 5, "participants": ["proposer","opposer"] }
{ "action": "stop" }
{ "action": "ping" }
```

**Server → Client（13 种消息类型）：**
```json
{ "type": "system",          "content": "..." }
{ "type": "status",          "content": "...", "phase": "...", "node": "..." }
{ "type": "speech_end",      "role": "...",    "content": "...", "citations": [...] }
{ "type": "fact_check_result","results": [...], "count": 0 }
{ "type": "judge_score",     "role": "...",    "scores": {...} }
{ "type": "turn_complete",   "turn": 3,        "current_scores": {...}, "cumulative_scores": {...} }
{ "type": "debate_complete", "final_scores": {...}, "total_turns": 5 }
{ "type": "error",           "content": "..." }
{ "type": "pong" }
```

## 10. 错误处理
- **LLM 调用**：LiteLLM 内置重试（`max_retries` 可配置），失败后推送 `error` WebSocket 消息，不中断辩论
- **搜索**：SearXNG 不可用 → 自动降级 Tavily → 均不可用则跳过事实核查并标注
- **裁判评分解析失败**：重试一次附加严格格式提示；仍失败则使用默认分数 5 分
- **WebSocket 断连**：前端需实现指数退避重连（Step 4 实现）
- **DB 持久化**：Runner 每个节点完成后写入状态快照，支持断线续联

## 11. Prompt 文件
存于 `backend/prompts/`，所有 Prompt 均为独立 Markdown 文件支持热更换：
- `debater_system.md`：辩手通用规范
- `debater_proposer.md`：正方特有指令
- `debater_opposer.md`：反方特有指令
- `fact_checker_system.md`：声明提取与搜索策略
- `judge_system.md`：评分纪律与输出格式约束

---

# 前端 UI/UX 要求
- **暗色模式优先**：深色极简风格，类似高阶数据看板
- **实时流式渲染**：WebSocket 打字机效果，平滑流畅
- **数据可视化**：侧边栏 5 维度雷达图（实时动态更新）+ 累积得分趋势图
- **状态指示器**：展示"正在检索事实…"、"裁判评分中…"等阶段提示
- **结构化导出**：前端按钮触发后端 API 下载 Markdown/JSON

---

# 执行进度

| 步骤 | 状态 | 说明 |
|------|------|------|
| **Step 1: 基础骨架搭建** | ✅ 已完成 | 前后端目录结构、依赖、配置、基础 UI 组件 |
| **Step 2: 后端核心 Model 与 API** | ✅ 已完成 | Session CRUD (SQLAlchemy)、WebSocket协议、搜索 Provider、导出服务 |
| **Step 3: LangGraph 状态机** | ✅ 已完成 | 9 节点辩论图、所有 Agent 节点、Runner、CLI 验证脚本 |
| **LiteLLM 集成** | ✅ 已完成 | 替换 OpenAI/Anthropic 双客户端，统一为 `ChatLiteLLM`，支持 100+ 提供商 |
| **Step 4: 前端核心 UI** | 🔄 **下一步** | 聊天界面、WebSocket 接入、打字机效果、状态指示器 |
| **Step 5: 可视化与导出** | ⏳ 待开发 | 雷达图、趋势图、导出按钮 |
| **Step 6: Prompt 调优与联调** | ⏳ 待开发 | Prompt 迭代、全流程压测 |

---

# 项目结构
```
Elenchus/
├── system_instructions.md
├── backend/
│   ├── .env / .env.example
│   ├── config.yaml            # LiteLLM 模型配置
│   ├── requirements.txt       # langchain-litellm, litellm, langgraph...
│   ├── cli_debate.py          # CLI 验证脚本 (Step 3.1)
│   └── app/
│       ├── main.py            # FastAPI 入口，CORS，生命周期
│       ├── config.py          # .env + config.yaml 统一加载
│       ├── agents/
│       │   ├── llm.py         # ChatLiteLLM 工厂（优先级链）
│       │   ├── prompt_loader.py
│       │   ├── context_manager.py
│       │   ├── debater.py
│       │   ├── fact_checker.py
│       │   ├── judge.py
│       │   ├── graph.py       # LangGraph 辩论状态机
│       │   └── runner.py      # 执行器 + WS 事件推送 + DB 持久化
│       ├── api/
│       │   ├── sessions.py    # Session CRUD REST API
│       │   └── websocket.py   # WS 端点 + ConnectionManager
│       ├── db/
│       │   ├── database.py    # SQLAlchemy async 引擎
│       │   └── models.py      # SessionRecord ORM
│       ├── models/
│       │   ├── state.py       # GraphState / DialogueEntry
│       │   ├── scoring.py     # TurnScore / DimensionScore
│       │   └── schemas.py     # REST API Pydantic 模型
│       ├── search/
│       │   ├── base.py        # SearchProvider 抽象
│       │   ├── searxng.py     # SearXNG 实现
│       │   ├── tavily.py      # Tavily 备用
│       │   └── factory.py     # 自动降级工厂
│       └── services/
│           ├── session_service.py  # DB CRUD 服务层
│           └── export_service.py  # JSON/Markdown 导出
└── frontend/
    └── src/
        ├── App.tsx
        ├── index.css          # 暗色设计系统
        ├── types/index.ts
        ├── stores/debateStore.ts  # Zustand 状态管理
        └── components/
            ├── Header.tsx
            ├── ChatPanel.tsx  # 骨架（Step 4 填充）
            └── ScorePanel.tsx # 骨架（Step 5 填充）
```