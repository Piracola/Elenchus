# Elenchus - AI Debate Framework 🏛️

**Elenchus** (取自苏格拉底的“反诘法”) 是一个基于多智能体 (Multi-Agent) 架构的自动化辩论引擎。它允许多个 AI 代理分别扮演正方、反方、事实核查员以及裁判的角色，对指定辩题展开结构化的激烈交锋。

本项目采用了现代化的全栈架构，后端基于 LangGraph 与 FastAPI 构建核心流转，前端基于 React (TypeScript) 构建极具质感的现代 UI（Glassmorphism 玻璃态设计风格），并通过 WebSocket 实现辩论过程的实时流式推送。

## ✨ 核心特性

- **🎭 多角色智能体联合运作**：
  - **辩手 (Proposer / Opposer)**：根据历史对话及自身立场进行辩护、反驳与防守。
  - **事实核查员 (Fact Checker)**：在每轮发言结束后，敏锐提取发言中的可验证条目（Factual Claims），调用第三方搜索引擎（SearXNG / Tavily）进行真实性审查，并将可证伪的网页摘要注入到后续的辩论上下文中。
  - **裁判 (Judge)**：基于 LLM 的结构化输出（Structured Outputs），从逻辑严密性、证据质量、反驳力度、前后自洽、说服力等 5 个维度对双方进行极其细致的图谱化评分。
  
- **🧬 LangGraph 状态机编排**：系统的底层运转逻辑被抽象为状态机有向图 (State Graph)，保证了复杂工作流的长程稳定性、状态快门保存 (Snapshot) 和高容错的多轮流转。
- **🌐 灵活强大的动态模型路由 (Powered by LiteLLM)**：摒弃了被单一厂商绑定的传统做法，底层全盘采用 LiteLLM 进行路由，原生支持超过 100+ 模型提供商（OpenAI, Anthropic, DeepSeek, Groq, 乃至完全离线的 Ollama 模型）。更强大的是，您可以**同时为不同职责的 Agent 配置不同的底层语言模型**（例如用便宜的开源小模型做总结与核查，用顶级闭源大模型做打分裁判）。
- **🎨 进阶的 UI 参数“实时覆盖”**：前端支持“抽屉式”控制台弹出，在创建任一个辩论房间（Session）之前，操作者可为四位代理角色即时填入与配置不同的 API Key、Base URL 以及模型代号进行降维打击式覆盖。
- **📊 WebSocket 推流与可视化**：将庞大、耗时的分析和打分转化为细密的过程进度反馈，并在前端渲染雷达图供用户观测战况。最后支持将记录通过结构化的 `JSON` 或排版精美的 `Markdown` 一键冷导出。

---

## 🏗️ 核心架构组件

**后端 (Backend)**
* **Python 3.10+**
* **LangGraph & LangChain**: 工作流总线、提示词编排及图节点执行
* **FastAPI**: 提供 REST API 增删改查支持与高性能的 WebSocket 实况长连接
* **SQLAlchemy (Async)** + **SQLite (aiosqlite)**: 完全异步的数据持久化落盘机制
* **LiteLLM**: 无痛跨厂商 LLM 网关适配器

**前端 (Frontend)**
* **React 18** + **TypeScript**
* **Vite**: 极速打包构建与开发服务器基座
* **Framer Motion**: 将枯燥的对话演变为极具流动感与空间感的界面微动画
* **Zustand**: 轻量即插即用的全局状态仓库

---

## 🚀 快速启动与私有化部署

### 1. 后端依赖与启动

1. 进入后端目录：`cd backend`
2. 创建并激活您的虚拟环境 (Virtual Environment)：
   ```bash
   python -m venv venv
   .\venv\Scripts\activate  # Windows
   # source venv/bin/activate (如果您在 macOS/Linux 设备上)
   ```
3. 灌入核心依赖：
   ```bash
   pip install -r requirements.txt
   ```
4. 环境变量配置：
   将 `backend/.env.example` 复制一份并重命名为 `backend/.env`，然后在其中填入您购买或准备好的主流 API Keys：
   ```dotenv
   OPENAI_API_KEY=sk-...
   ANTHROPIC_API_KEY=sk-ant-...
   # 这仅仅是个后备依赖，您也可以保持空白，仅通过 UI 前端注入配置！
   ```
5. 唤醒 API 核心引擎：
   ```bash
   python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
   ```
   > 核心引擎将挂载运行于 `http://localhost:8000`
   > API 调用详单 (Swagger Docs) 将会在 `http://localhost:8000/docs` 动态展示

### 2. 前端控制台渲染

1. 新开一个终端，并进入前端目录：`cd frontend`
2. 获取依赖：`npm install`
3. 挂载 React 渲染引擎：`npm run dev`
   > 浏览器默认的 UI 工作台热入口位于 `http://localhost:5173`

---

## 🎛️ 如何实现“千人千面 的大模型自由”？

本框架设计了三重优先级以保证您的极客掌控欲：
1. **统一缺省后备 (`.env`)**：项目会在环境内悄悄寻找所有带规范前缀的 Key 环境变量。
2. **硬编码偏好配置 (`config.yaml`)**：你可以前往后端的配置文件中锁定默认策略，比如配置裁判锁定 `anthropic/claude-3-5-sonnet`，核查员强绑定使用本地模型进行降本增效。
3. **✨前端 UI 动态覆写控制 (最高优先级)**：点击工作台底部的 "**✨ 进阶模型配置**" 发光按钮，为将要上场的每一个“灵魂数字人”实时写死它们所附体的服务商源址和对应的安全密匙（支持填入如 Ollama 本地推理服务网址 `http://localhost:11434` 等私人局域网地址）。

---

## 📝 证书与感谢
构建用于深刻探索 AI Agentic 的群智边界。致敬前人，启迪来者。
