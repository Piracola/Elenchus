# Elenchus

Elenchus 是一个基于 `LangGraph + FastAPI + React 19` 的多智能体辩论实验平台，用来观察不同辩论流程、提示词和运行时编排如何影响一场辩论。

当前主线包含两套明确分离的模式：

- `标准辩论模式`：保留裁判评分、陪审团评议、搜索增强和常规推理增强。
- `诡辩实验模式`：使用独立 prompt、独立 graph、独立视觉提示和独立产物，不提供裁判评分，也不允许搜索。

## 诡辩实验模式

`诡辩实验模式` 是这次功能扩展的核心。它不是在标准模式上追加几个开关，而是一条单独的实验链路，目标是把“诡辩如何发生、如何被识别、如何改变叙事重心”变成可观察对象。

这个模式当前已经具备以下能力：

- 主界面提供独立模式入口，并在启用时显示风险提示。
- 会话界面顶部持续显示模式提醒，明确说明这里的输出不代表事实结论。
- 消息界面使用淡黄色主题，核心背景色为 `#fcfaf8`。
- 搜索在 UI、Prompt 和 Runtime 三层同时禁用，避免和常规模式混淆。
- 不启用陪审团、不启用裁判评分、不输出胜负结论。
- 每轮结束后由 `诡辩观察员` 生成观察报告，替代评分型产物。
- 整场结束后生成最终总览报告，帮助用户回看整场修辞操控轨迹。
- 每次启动该模式时，都会自动把内置谬误库加载到公共文档池与 `shared_knowledge`。

### 模式规则

诡辩模式下的辩手 prompt 被单独设计，重点不是“胡搅蛮缠”，而是“看起来像有道理的操控性论证”。当前系统要求模型：

- 优先使用看起来像合理论证的诡辩。
- 避免纯辱骂、胡搅蛮缠、无意义重复。
- 尽量让观察员有可分析空间。
- 主动指出对手的诡辩，并尽量引用短句进行点名。
- 不搜索、不伪造来源、不假装做过外部核验。

### 模式运行流

诡辩实验模式使用独立 LangGraph：

```text
manage_context
  -> set_speaker
  -> sophistry_speaker
  -> set_speaker (next speaker)
  -> sophistry_observer
  -> advance_turn
  -> manage_context (next turn)
  -> sophistry_postmortem
  -> end
```

它和标准模式最重要的区别是：

- 双方辩手都先完成本轮公开发言，再由观察员生成回合报告。
- 不走 `judge`、`jury_discussion`、`tool_executor`、`consensus` 等标准链路。
- 最终产物是观察报告，不是分数。

### 非评分产物

诡辩模式下，用户看到的是“可读的实验结果”，而不是“谁赢了几分”：

- `sophistry_round_report`：每轮观察报告，概括叙事漂移、主要谬误、指控是否站得住脚、下一轮脆弱点。
- `sophistry_final_report`：整场总览，汇总高频套路、关键转折、争议标签和观看提醒。

这些产物会进入：

- 会话 `dialogue_history`
- `mode_artifacts`
- 右侧原裁判评分区域对应的位置

## 会话资料池与内置文档

项目当前同时支持两类会话资料来源：

- 用户上传的 `.txt` / `.md` 文档
- 运行时自动注入的内置参考文档

诡辩实验模式会自动注入：

- [`docs/sophistry-fallacy-catalog.md`](./docs/sophistry-fallacy-catalog.md)

运行时会把它写入当前 session 的：

- `documents/<document_id>.json`
- `reference_entries/<document_id>.json`
- `shared_knowledge`

内置文档固定使用 `document_id = builtin-sophistry-fallacy-catalog`，并在 `builtin_reference_docs` 中登记，避免重复加载。

## 当前能力概览

- REST + WebSocket 双通道：REST 管理会话与历史，WebSocket 负责实时事件、启动、停止和介入。
- LangGraph 运行时：支持标准辩论链路和独立的诡辩实验链路。
- 会话级持久化：`session.json`、`events.jsonl`、`rounds/*.json`、`documents/*.json`。
- 实时观察与回放：聊天流、时间线、运行图和节点状态都能按事件恢复。
- 会话资料池：支持上传、列表、详情、删除，以及模式内置参考文档注入。

## 项目结构

- `frontend/`：React 19 + Vite 7 + Zustand，负责会话创建、聊天界面、运行观察器和回放 UI。
- `backend/`：FastAPI API、LangGraph Runtime、Session 持久化和文档服务。
- `docs/`：架构说明、模式设计、谬误目录和其他实现文档。
- `runtime/`：本地运行时目录，保存数据库、日志、session 快照、事件流和资料文件。

## 快速启动

### 前提

- Python 3.10+
- Node.js 18+

### 开发模式

Windows：

```powershell
start.bat
```

或：

```powershell
.\start.ps1
```

macOS / Linux：

```bash
chmod +x ./start.sh
./start.sh
```

默认地址：

- 前端：`http://localhost:5173`
- 后端：`http://localhost:8001`

## 运行时目录

```text
runtime/
├─ backend/
│  ├─ .env
│  └─ config.yaml
├─ data/
│  └─ log_config.json
├─ elenchus.db
├─ logs/
└─ sessions/
   └─ <session_id>/
      ├─ session.json
      ├─ events.jsonl
      ├─ rounds/
      │  └─ round-001.json
      ├─ documents/
      │  └─ <document_id>.json
      └─ reference_entries/
         └─ <document_id>.json
```

说明：

- `session.json` 保存会话快照、模式配置、共享知识和模式产物。
- `events.jsonl` 保存实时事件历史，用于回放和恢复。
- `rounds/*.json` 保存按轮次固化的结果。
- `documents/*.json` 保存上传文档和内置参考文档。
- `reference_entries/*.json` 保存结构化资料条目。

## 文档入口

- [当前架构说明](./docs/architecture.md)
- [诡辩实验模式设计文档](./docs/sophistry-experiment-mode-design.md)
- [诡辩实验模式谬误目录](./docs/sophistry-fallacy-catalog.md)
- [文档导航](./docs/README.md)
- [后端说明](./backend/README.md)
- [前端说明](./frontend/README.md)
