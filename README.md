# Elenchus - AI 多智能体辩论框架 🏛️

<p align="center">
  <b>基于 LangGraph 的多智能体自动化辩论引擎</b><br/>
  <i>让多个 AI 代理扮演不同角色，对指定辩题展开结构化实时博弈</i>
</p>

<p align="center">
  <a href="#-快速开始">快速开始</a> •
  <a href="#-核心特性">核心特性</a> •
  <a href="#-项目结构">项目结构</a> •
  <a href="#-配置指南">配置指南</a> •
  <a href="#-api-文档">API 文档</a> •
  <a href="#-开发指南">开发指南</a>
</p>

***

## 📖 什么是 Elenchus？

**Elenchus**（取自苏格拉底的"反诘法"）是一个创新的 AI 多智能体辩论框架。它模拟真实的辩论场景，让多个 AI 代理分别扮演不同立场的辩手和裁判角色，通过结构化流程展开深度思辨。

> 💡 **适用场景**：学术讨论、观点碰撞、决策辅助、教育训练、内容创作

***

## 🚀 快速开始

### 方式一：一键启动（推荐）

<details>
<summary><b>Windows</b></summary>

```powershell
# PowerShell（推荐）
.\start.ps1

# CMD
start.bat
```

</details>

<details>
<summary><b>macOS / Linux</b></summary>

```bash
./start.sh
```

</details>

一键启动会自动完成：

- ✅ 环境检查（Python 3.10+、Node.js 18+）
- ✅ 创建虚拟环境并安装后端依赖
- ✅ 生成加密主密钥（`PROVIDERS_ENCRYPTION_KEY`）
- ✅ 安装前端依赖
- ✅ 同时启动后端（`http://localhost:8000`）和前端（`http://localhost:5173`）
- ✅ 自动打开浏览器访问 UI

**启动选项：**

```bash
# 仅启动后端
.\start.ps1 -BackendOnly

# 仅启动前端
.\start.ps1 -FrontendOnly

# 跳过依赖安装（加速二次启动）
.\start.ps1 -SkipInstall
```

### 方式二：手动启动

#### 后端

```bash
cd backend

# 创建虚拟环境
python -m venv venv
source venv/bin/activate  # Linux/macOS
# 或: .\venv\Scripts\activate  # Windows

# 安装依赖
pip install -r requirements.txt

# 初始化配置
cp .env.example .env

# 启动服务
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

#### 前端

```bash
cd frontend
npm install
npm run dev
```

***

## ✨ 核心特性

### 🎭 多角色协同辩论

- **正方（Proposer）**：阐述观点、提供论据
- **反方（Opposer）**：质疑反驳、提出异议
- **裁判（Judge）**：基于 5 个维度进行客观评分
  - 逻辑严密性
  - 证据质量
  - 反驳力度
  - 自洽性
  - 说服力

### 🧠 LangGraph 状态机编排

底层采用 LangGraph 有向图构建辩论流程：

```
manage_context → set_speaker → speaker ↔ tool_executor → judge → advance_turn → (loop or END)
```

状态通过 `DebateGraphState` 流转，确保长程对话的稳定性和可追溯性。

### 🔌 灵活的 LLM 路由

支持多提供商动态切换，每个 Agent 可独立配置：

| 提供商       | 说明                         |
| --------- | -------------------------- |
| OpenAI    | GPT-4o / GPT-4-turbo 等     |
| Anthropic | Claude 3.5 Sonnet / Opus 等 |
| Google    | Gemini Pro / Ultra 等       |
| DeepSeek  | DeepSeek Chat / Coder 等    |
| Groq      | Llama / Mixtral 高速推理       |
| Ollama    | 本地开源模型部署                   |

**安全存储**：API Keys 通过 Fernet 加密存储于 `backend/data/providers.json`

### 🔍 实时事实核查

内置双搜索引擎自动验证观点：

- **SearXNG**（优先）：自建聚合搜索，无 API 限制
- **Tavily**（备选）：AI 专用搜索引擎

搜索结果自动注入 `shared_knowledge`，供后续辩论引用。

### 🎨 现代化前端技术栈

- **React 19** + **TypeScript 5.9** + **Vite 7**
- **Tailwind CSS v4** 原子化样式
- **Framer Motion** 流畅交互动效
- **ECharts** 雷达图实时评分可视化
- **Zustand** 轻量级状态管理

### 📡 WebSocket 实时推送

辩论过程通过 WebSocket 流式推送：

- `speech_start` / `speech_end` — 发言开始/结束
- `judge_score` — 裁判打分（含 5 维度评分）
- `turn_complete` — 轮次完成
- `session_end` — 辩论结束

### 📥 导出与分享

支持一键导出辩论记录：

- **JSON**：结构化原始数据，便于分析
- **Markdown**：排版精美的可读文本，便于分享

***

## 🏗️ 项目结构

```
elenchus/
├── 📁 backend/                 # FastAPI 后端服务
│   ├── 📁 app/
│   │   ├── 📁 agents/          # LangGraph 智能体编排
│   │   │   ├── graph.py           # 状态机主图定义
│   │   │   ├── runner.py          # 状态流执行器
│   │   │   ├── debater.py         # 辩手节点逻辑
│   │   │   ├── judge.py           # 裁判节点逻辑
│   │   │   ├── context_manager.py # 上下文压缩
│   │   │   ├── llm_router.py      # LLM 路由中心
│   │   │   ├── llm.py             # LLM 工厂
│   │   │   ├── prompt_loader.py   # 提示词加载
│   │   │   ├── constants.py       # 共享常量
│   │   │   └── 📁 skills/         # 工具技能库
│   │   │       ├── searxng_tool.py
│   │   │       └── tavily_tool.py
│   │   ├── 📁 api/             # REST API 路由
│   │   │   ├── sessions.py        # 会话管理 API
│   │   │   ├── websocket.py       # WebSocket 处理
│   │   │   └── models.py          # 模型配置 API
│   │   ├── 📁 services/        # 业务逻辑层
│   │   │   ├── provider_service.py  # 密钥管理（加密）
│   │   │   ├── session_service.py   # 会话持久化
│   │   │   ├── export_service.py    # 导出服务
│   │   │   └── crypto.py            # 加密工具
│   │   ├── 📁 search/          # 搜索引擎接口
│   │   │   ├── factory.py         # 搜索工厂（单例）
│   │   │   ├── searxng.py
│   │   │   └── tavily.py
│   │   ├── 📁 models/          # Pydantic 数据模型
│   │   ├── 📁 db/              # 数据库 ORM
│   │   └── main.py             # FastAPI 入口
│   ├── 📁 tests/               # 测试套件
│   ├── 📁 prompts/             # 提示词模板
│   ├── config.yaml             # 应用行为配置
│   ├── requirements.txt        # Python 依赖
│   └── .env.example            # 环境变量模板
│
├── 📁 frontend/                # React 前端应用
│   ├── 📁 src/
│   │   ├── 📁 components/      # React 组件
│   │   │   ├── 📁 chat/           # 聊天相关组件
│   │   │   ├── 📁 sidebar/        # 侧边栏组件
│   │   │   └── 📁 shared/         # 共享组件
│   │   ├── 📁 stores/          # Zustand 状态仓库
│   │   ├── 📁 hooks/           # 自定义 Hooks
│   │   ├── 📁 api/             # API 客户端
│   │   ├── 📁 utils/           # 工具函数
│   │   ├── 📁 types/           # TypeScript 类型
│   │   └── App.tsx             # 应用入口
│   ├── package.json
│   └── vite.config.ts
│
├── 📁 docs/                    # 文档资料
│   └── Elenchus Architecture.md
├── start.sh / start.ps1        # 一键启动脚本
└── README.md                   # 项目说明
```

***

## ⚙️ 配置指南

### 环境变量 (`backend/.env`)

| 变量名                        | 说明                  | 必需 | 默认值                                 |
| -------------------------- | ------------------- | -- | ----------------------------------- |
| `PROVIDERS_ENCRYPTION_KEY` | API 密钥加密主密钥         | ✅  | -                                   |
| `DATABASE_URL`             | SQLite 数据库路径        | ❌  | `sqlite+aiosqlite:///./elenchus.db` |
| `SEARXNG_BASE_URL`         | SearXNG 搜索地址        | ❌  | `http://localhost:8080`             |
| `TAVILY_API_KEY`           | Tavily API 密钥（备选搜索） | ❌  | -                                   |
| `HOST`                     | 后端监听地址              | ❌  | `0.0.0.0`                           |
| `PORT`                     | 后端监听端口              | ❌  | `8000`                              |
| `CORS_ORIGINS`             | 允许的跨域源              | ❌  | `http://localhost:5173`             |

**生成加密主密钥：**

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

### 应用配置 (`backend/config.yaml`)

```yaml
# 搜索引擎配置
search:
  provider: "searxng"              # searxng | tavily
  max_results_per_query: 5

# 辩论流程配置
debate:
  default_max_turns: 5             # 默认辩论轮数
  context_window:
    recent_turns_to_keep: 3        # 保留最近轮数
    enable_summary_compression: true  # 启用上下文压缩
  retry:
    max_retries: 3                 # 重试次数
    base_delay_seconds: 1.0        # 基础延迟
```

### 🔐 LLM 提供商配置

API Keys **不再通过** **`.env`** **配置**，而是通过前端 UI 管理：

1. 访问 `http://localhost:5173`
2. 点击 **"模型配置"** 按钮
3. 添加/编辑提供商配置：
   - `provider_id`：唯一标识（如 `openai-main`）
   - `provider_type`：提供商类型
   - `api_key`：API 密钥（加密存储）
   - `base_url`：自定义 API 地址（可选）
   - `default_model`：默认模型
4. 创建辩论时，为每个 Agent 选择对应的提供商配置

***

## 📡 API 文档

启动服务后访问：`http://localhost:8000/docs`

### 创建辩论会话

```http
POST /api/sessions
Content-Type: application/json

{
  "topic": "人工智能是否威胁人类未来？",
  "participants": ["Alice", "Bob"],
  "agent_configs": {
    "Alice": {
      "provider_id": "openai-main",
      "model": "gpt-4o",
      "provider_type": "openai"
    },
    "Bob": {
      "provider_id": "anthropic-main",
      "model": "claude-3-5-sonnet",
      "provider_type": "anthropic"
    }
  },
  "max_turns": 5
}
```

### WebSocket 连接

```javascript
const ws = new WebSocket('ws://localhost:8000/api/ws/{session_id}');

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  switch (data.type) {
    case 'speech_end':
      console.log('发言完成:', data.payload);
      break;
    case 'judge_score':
      console.log('裁判评分:', data.payload.scores);
      break;
    case 'session_end':
      console.log('辩论结束');
      break;
  }
};

// 开始辩论
ws.onopen = () => {
  ws.send(JSON.stringify({ action: 'start' }));
};
```

### 导出辩论记录

```http
POST /api/sessions/{session_id}/export
Content-Type: application/json

{
  "format": "markdown"  // 或 "json"
}
```

***

## 🧪 测试

```bash
cd backend

# 运行全部测试
pytest

# 运行指定测试文件
pytest tests/test_graph.py
pytest tests/test_session_service.py

# 详细输出
pytest -v
```

***

## 🛠️ 开发指南

### 常用命令

| 命令                                        | 说明           |
| ----------------------------------------- | ------------ |
| `npm run dev`                             | 启动前端开发服务器    |
| `npm run build`                           | 构建前端生产包      |
| `npm run lint`                            | 运行 ESLint 检查 |
| `pytest`                                  | 运行后端测试       |
| `python -m uvicorn app.main:app --reload` | 热重载后端        |

### 添加新的 LLM 提供商

1. 在 `backend/app/agents/providers/` 中实现 `BaseProviderClient` 子类
2. 在 `backend/app/agents/llm_router.py` 的 `_registry` 中注册
3. 在前端的 `ModelConfigManager` 中添加提供商类型选项

### 添加新的辩论工具

1. 在 `backend/app/agents/skills/` 中创建工具文件
2. 使用 `@tool` 装饰器定义工具函数
3. 在 `skills/__init__.py` 的 `get_all_skills()` 中注册
4. 重启服务即可使用

### 前端开发

**状态管理：**

```typescript
// stores/debateStore.ts
import { create } from 'zustand';

interface DebateStore {
  sessions: Session[];
  currentSession: Session | null;
  addSession: (session: Session) => void;
}

export const useDebateStore = create<DebateStore>((set) => ({
  sessions: [],
  currentSession: null,
  addSession: (session) => set((state) => ({
    sessions: [...state.sessions, session]
  })),
}));
```

**使用 WebSocket：**

```typescript
import { useDebateWebSocket } from '@/hooks/useDebateWebSocket';

function MyComponent() {
  const { sendMessage, isConnected } = useDebateWebSocket(sessionId);
  
  const startDebate = () => {
    sendMessage({ action: 'start' });
  };
  
  return <button onClick={startDebate}>开始辩论</button>;
}
```

***

## ❓ 常见问题

**Q: 启动时报错 "PROVIDERS\_ENCRYPTION\_KEY not found"？**\
A: 运行一键启动脚本会自动生成，或手动执行：

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

将输出写入 `backend/.env` 文件。

**Q: 如何接入自己的 SearXNG？**\
A: 在 `backend/.env` 中设置 `SEARXNG_BASE_URL=http://your-searxng-instance:8080`

**Q: 支持哪些模型提供商？**\
A: OpenAI、Anthropic、Google Gemini、DeepSeek、Groq、Ollama。可通过扩展 `llm_router.py` 添加更多。

**Q: 如何修改辩论轮数？**\
A: 创建会话时在请求体中指定 `max_turns`，或修改 `config.yaml` 中的 `default_max_turns`。

**Q: 前端端口冲突怎么办？**\
A: 修改 `frontend/vite.config.ts` 中的 `server.port`，并同步更新 `backend/.env` 的 `CORS_ORIGINS`。

***

## 🗺️ 路线图

- [ ] **Vector Memory (RAG)**：将 `shared_knowledge` 存入向量数据库，支持精准检索
- [ ] **Human-in-the-Loop**：支持人工介入暂停和评判
- [ ] **异步事件总线**：使用 Redis Pub/Sub + Celery 解耦 WebSocket 与计算
- [ ] **多辩手支持**：扩展参与者到 3+ 角色辩论
- [ ] **可视化图谱**：展示辩论逻辑结构图
- [ ] **插件系统**：支持加载自定义技能插件

***

## 🤝 贡献

欢迎提交 Issue 和 PR！请确保：

1. 代码符合现有风格
2. 添加必要的测试
3. 更新相关文档
4. 通过 `pytest` 和 `npm run lint` 检查

***

## 📄 许可证

MIT License

***

## 🙏 致谢

构建用于探索 AI Agentic 群智边界的实验框架。致敬前人，启迪来者。

<p align="center">
  <sub>Built with ❤️ using Python, FastAPI, LangGraph, React, and Vite</sub>
</p>
