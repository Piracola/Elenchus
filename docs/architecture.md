# 系统架构总览

> 更新时间：2026-04-09
> 本文档聚焦**当前系统如何组织**：系统分层、前后端职责、模式化运行链路与关键代码入口。
> `runtime/` 目录结构、`session.json` / `events.jsonl` / `documents/` / `reference_entries/` 的职责请见 [runtime.md](./runtime.md)。

## 1. 架构定位

Elenchus 当前是一个“共享底座 + 多模式运行链路”的多智能体辩论平台。

它的核心特征是：

- 共享会话模型、事件流、持久化与前端观察界面
- 按模式切换不同的 prompt、graph、事件映射与产物形态
- 通过 REST + WebSocket 组合实现创建、控制、实时推送与回放

当前主线模式包括：

- **标准辩论模式**：保留常规辩论流程、评分与观察能力
- **诡辩实验模式**：独立实验链路，用于观察修辞操控、谬误标签与叙事漂移

## 2. 系统分层

```text
Browser UI
├─ React 19 + Zustand
├─ REST 请求
└─ WebSocket 实时事件
   │
   ▼
FastAPI Backend
├─ Session / Model / Search / Log APIs
├─ WebSocket 会话控制
└─ Runtime orchestration
   │
   ▼
Service Layer
├─ session_service
├─ document / reference services
├─ provider service
└─ runtime helpers
   │
   ▼
LangGraph Runtime
├─ standard graph
└─ sophistry graph
   │
   ▼
Persistence
├─ SQLite database
└─ runtime session artifacts
```

## 3. 前后端职责

### 前端

前端负责：

- 创建与切换会话
- 展示消息流、时间线、运行图、记忆面板
- 管理模型配置、搜索配置和界面设置
- 接收 WebSocket 事件并驱动实时渲染
- 读取历史状态并支持回放

关键入口：

- `frontend/src/components/HomeView.tsx`
- `frontend/src/components/ChatPanel.tsx`
- `frontend/src/hooks/useDebateWebSocket.ts`
- `frontend/src/stores/debateStore.ts`
- `frontend/src/components/chat/RuntimeInspector.tsx`

### 后端

后端负责：

- 会话创建、读取、删除与导出
- WebSocket 启动、停止、介入和事件推送
- 模型 provider 配置与搜索配置
- LangGraph 运行编排
- 会话持久化、资料池处理与模式初始化

关键入口：

- `backend/app/main.py`
- `backend/app/api/sessions.py`
- `backend/app/api/websocket.py`
- `backend/app/services/session_service.py`
- `backend/app/runtime/orchestrator.py`
- `backend/app/runtime/engines/langgraph.py`

## 4. 模式化运行链路

Elenchus 的一个关键架构选择，是把“模式差异”放在运行链路层，而不是在单一流程里堆叠大量条件分支。

### 标准辩论模式

适合常规辩论场景，核心特征包括：

- 标准 debater / judge / jury 流程
- 可配合搜索与常规推理增强
- 产出评分、结论和相关观察结果

对应核心入口：

- `backend/app/agents/graph.py`
- `backend/app/agents/debater.py`
- `backend/app/agents/judge.py`

### 诡辩实验模式

适合修辞与谬误观察场景，核心特征包括：

- 独立 prompt 与独立 graph
- 不启用评分、陪审团与搜索工具
- 输出观察报告和整场复盘，而不是胜负结论
- 自动注入内置谬误库到当前会话资料池
- 运行时事件以 turn 为主键维护“辩手发言 → 观察员报告”的顺序关系；即使首批发言未经历 token 流，也必须补发最终发言事件
- 观察员报告事件与 artifact 会额外携带 `source_turn`、`source_roles`，供前端在多轮与补发场景下恢复对应关系

对应核心入口：

- `backend/app/agents/sophistry_graph.py`
- `backend/app/agents/sophistry_debater.py`
- `backend/app/agents/sophistry_observer.py`

详细边界与用户可见行为见：[sophistry-experiment-mode-design.md](./sophistry-experiment-mode-design.md)

## 5. 核心模块入口

### API 层

- `backend/app/api/sessions.py`：会话 CRUD、导出入口与子路由聚合
- `backend/app/api/session_documents.py`：会话文档上传、列表、详情、删除与资料池接口
- `backend/app/api/session_runtime.py`：运行事件分页与快照导出接口
- `backend/app/api/websocket.py`：WebSocket 会话控制与事件收发
- `backend/app/api/models.py`：provider / 模型配置
- `backend/app/api/search.py`：搜索配置与健康检查
- `backend/app/api/log.py`：日志配置

### 服务层

- `backend/app/services/session_service.py`：会话主服务，负责 CRUD、更新入口与会话记录落盘
- `backend/app/services/session_service_helpers.py`：会话配置默认值、快照清洗与轮次辅助逻辑
- `backend/app/services/session_service_serializers.py`：会话记录序列化与轮次结果物化
- `backend/app/services/session_document_workflow.py`：会话文档上传后的预处理编排
- `backend/app/services/provider_service.py`：provider 配置应用服务与默认项规则
- `backend/app/services/provider_config_store.py`：provider 配置存储访问
- `backend/app/services/provider_serializers.py`：provider 配置排序、时间解析与响应映射
- `backend/app/services/document_service.py`：会话文档上传与读取
- `backend/app/services/reference_library_service.py`：结构化资料条目查询与删除入口
- `backend/app/services/reference_library_workflow.py`：资料预处理工作流与失败回滚
- `backend/app/services/reference_library_serializers.py`：资料文档与条目序列化
- `backend/app/services/reference_library_knowledge.py`：资料池到 shared knowledge 的同步逻辑
- `backend/app/services/builtin_reference_service.py`：模式内置参考文档注入
- `backend/app/services/export_service.py`：导出 facade 入口，统一转出会话导出、文件名与运行时快照导出能力
- `backend/app/services/export_markdown_service.py`：会话 Markdown 导出与 transcript 分类渲染
- `backend/app/services/export_scoring_service.py`：导出评分维度、模块权重与综合分推导
- `backend/app/services/export_filename_service.py`：导出文件名清洗与 `Content-Disposition` 头生成
- `backend/app/services/export_runtime_service.py`：运行事件快照导出与校验摘要

### 运行层

- `backend/app/runtime/orchestrator.py`：运行协调
- `backend/app/runtime/engines/langgraph.py`：按模式装配并运行 LangGraph engine
- `backend/app/runtime/bus.py`：运行事件广播与持久化总线；`RuntimeBus` 是运行时事件分发的唯一主入口（历史兼容层 `EventStreamGateway` / `ConnectionHub` 已清理）
- `backend/app/runtime/session_repository.py`：会话运行态读写 facade 入口，封装 `SessionRuntimeRepository` 类
- `backend/app/runtime/session_defaults.py`：默认配置工厂（team/jury/reasoning/mode config）
- `backend/app/runtime/session_dialogue_helpers.py`：对话历史清洗、轮次提取与累计评分重算
- `backend/app/runtime/session_snapshot_normalizer.py`：可恢复快照规范化与不完整轮次回滚
- `backend/app/runtime/event_emitter.py`：运行时事件发射 facade 入口，封装 `RuntimeEventEmitter` 类与 `noop_emit_event` 回退
- `backend/app/runtime/runtime_status.py`：节点状态描述字典、状态预测与工具调用检测逻辑
- `backend/app/runtime/runtime_speech_emitter.py`：发言事件发射（start/token/cancel/end）
- `backend/app/runtime/runtime_discussion_emitter.py`：组内讨论与陪审团讨论事件发射
- `backend/app/runtime/runtime_report_emitter.py`：诡辩报告、事实核查、评分、回合完成与记忆更新事件发射

### 模型调用与输出长度

- `runtime/config.json`：统一持久化服务商级默认输出参数；当前 `providers[].default_max_tokens` 可由用户在设置面板中配置，作为该服务商的默认输出上限，系统默认值为 64k
- `backend/app/agents/llm.py`：统一解析 agent/provider 覆盖配置，并按“角色/会话覆盖 → 服务商默认 `default_max_tokens` → 系统默认值”顺序解析 `max_tokens`；当前系统约定默认最大输入为 128k、默认最大输出为 64k
- `backend/app/agents/safe_invoke.py`：统一模型调用入口，公开发言、组内讨论、陪审团讨论和总结都经由这里进入底层模型客户端
- `backend/app/agents/openai_transport.py`：OpenAI 兼容传输层，最终把解析出的 `max_tokens` 写入 chat completions payload

### 提示词资源

- `backend/prompts/`：标准模式与事实核查相关提示词目录，包含辩手基础提示词、正反方补充提示词、裁判提示词、共识收敛提示词与事实核查提示词
- `backend/prompts/sophistry/`：诡辩实验模式提示词目录，包含辩手基础提示词、正反方补充提示词与观察员提示词
- `backend/app/agents/prompt_loader.py`：标准模式提示词加载入口，负责拼接基础辩手提示词与角色补充提示词，并提供裁判提示词与共识收敛提示词读取（`get_judge_prompt` / `get_consensus_prompt`）
- `backend/app/agents/sophistry_prompt_loader.py`：诡辩模式提示词加载入口，负责拼接诡辩模式的基础辩手提示词与角色补充提示词，并提供观察员提示词读取

### Agent 技能

- `backend/app/agents/skills/search_tool.py`：`web_search` 的稳定 facade 与 LangChain tool 注册入口，保留 shared knowledge metadata 标记与外部导入路径
- `backend/app/agents/skills/search_query_planner.py`：查询清洗、prompt-like 输入纠偏、辩题主题提取与搜索计划构建
- `backend/app/agents/skills/search_result_filter.py`：搜索结果关键词提取、相关性评分、去重与过滤
- `backend/app/agents/skills/search_formatter.py`：证据摘要格式化与 snippet 截断

### 前端主路径

- `frontend/src/components/HomeView.tsx`：首页与会话创建入口
- `frontend/src/components/ChatPanel.tsx`：聊天主视图
- `frontend/src/components/ChatPanel.history.test.tsx`：长历史会话渲染与观察器联动回归测试入口
- `frontend/src/components/chat/MessageRow.tsx`：消息行组件，辩手消息块与裁判消息块均采用统一头部行布局（头像 + 身份标识 + 轮数 + 模型 + 折叠按钮居中对齐为一行）；卡片阴影统一为灰色系（`rgba(224, 224, 224, 0.5)`），头像尺寸统一为 36px / `borderRadius-md` / 白色文字 + 灰色阴影；身份标识统一为深灰色文字（`#333333`）+ 灰色圆角边框（`#CCCCCC`）无填充样式
 - `frontend/src/components/chat/messageRow/shared.ts`：消息行共享样式与辅助函数，包含角色视觉映射、折叠按钮样式、轮次标签格式化等
- `frontend/src/components/chat/ExecutionTimeline.tsx`：执行时间线
- `frontend/src/components/chat/LiveGraph.tsx`：运行图
- `frontend/src/components/chat/RuntimeInspector.tsx`：运行观察器容器
- `frontend/src/api/client.ts`：REST 请求入口
- `frontend/src/utils/textRepair.ts`：前端用户可见文本的乱码兜底修复
- `frontend/src/components/chat/referenceLibrary/`：参考资料面板拆分后的共享逻辑、状态 hook 与弹层展示
- `frontend/src/components/sidebar/settings/`：设置面板拆分后的显示/日志/服务商子模块

### 设置面板展示层

- `frontend/src/components/sidebar/SettingsPanel.tsx`：设置弹层总入口，统一控制弹层尺寸、左右分栏宽度、内容区留白、导航字号与关闭按钮尺寸
- `frontend/src/components/sidebar/settings/SettingsDisplayTab.tsx`、`SettingsLoggingTab.tsx`、`SettingsRadioCardGroup.tsx`：标准设置页的标题、说明文案、选项卡片与交互控件的放大基线
- `frontend/src/components/sidebar/SearchConfigTab.tsx`、`frontend/src/components/sidebar/search/`：搜索设置页的状态卡片、表单输入、说明文字与操作按钮尺寸
- `frontend/src/components/sidebar/ProviderForm.tsx`、`ProviderSidebar.tsx`：模型服务商设置页的列表宽度、表单控件字号、模型标签、下拉选择器与操作区尺寸
- 当前设置界面采用“保持字体大小、缩小容器与间距”的展示策略：优先下调弹层宽高、侧边栏宽度、卡片内边距、按钮尺寸和区块间距，以提升紧凑度但不改变阅读字号

### 首页弹出式交互层

- `frontend/src/components/HomeView.tsx`：首页统一控制模式切换提示、Agent 配置面板与错误提示的出现顺序；当前将诡辩模式提示框与 Agent 配置框统一放置在主对话框下方，避免遮挡题目输入区
- `frontend/src/components/shared/SophistryModeNotice.tsx`：诡辩模式提示组件，首页 compact 形态通过高度、位移与透明度组合动画平滑进入/退出
- `frontend/src/components/shared/AgentConfigPanel.tsx`：首页高级 Agent 配置面板，跟随首页创建卡片下方展开/收起，并复用统一的弹出层动画节奏
- `frontend/src/components/shared/CustomSelect.tsx`：首页 Agent 配置中的下拉选择器改为挂载到 `document.body` 的浮层渲染，避免被首页动画容器的 `overflow: hidden` 截断，并根据视口空间自动决定向上或向下展开
- `frontend/src/components/home/HomeComposerCard.tsx`：首页创建卡片承载轮数与模式相关控件；诡辩模式下的状态提示文案直接在这里渲染，需保持 UTF-8 文本正确显示

### 编码治理链路

- `frontend/index.html`：前端页面 UTF-8 编码声明
- `frontend/src/components/HomeView.tsx`、`frontend/src/types/scoring.ts`：首页与评分维度文案的直接显示入口
- `frontend/src/components/chat/ExecutionTimeline.tsx`：运行事件快照导入时的 UTF-8 / GB18030 解码回退
- `backend/app/api/sessions.py`：会话 JSON 导出响应头
- `backend/app/api/session_runtime.py`：运行事件快照导出响应头
- `backend/app/services/document_service.py`：上传文本文件的多编码兼容解码
- `backend/app/text_repair.py`：后端用户可见文本归一化与乱码修复

## 6. 会话资料池在架构中的位置

当前会话资料池支持两类来源：

- 用户上传的参考文档
- 模式自动注入的内置文档

其职责边界是：

- 文档与结构化资料作为会话级输入能力存在
- 高价值资料可同步进共享知识，供运行链路消费
- 资料池具体文件落点、快照关系与回放边界不在本文档展开

当前一致性策略是：

- API 通过 `session_document_workflow.py` 串联“创建文档 → 预处理 → 回读最终状态”
- 文档与资料条目主要落在 `runtime/` 文件存储，而不是数据库表事务
- 一致性依赖文件原子写、进程内锁与预处理失败时的补偿清理，而不是 `db.begin()`

相关文档：

- [会话级资料池实现说明](./session-reference-library-implementation.md)
- [运行时与回放](./runtime.md)

## 7. 文档边界

当前架构文档只负责回答下面这些问题：

- 系统分成哪些层
- 前后端分别负责什么
- 不同模式的运行链路如何分开
- 应该从哪些源码入口理解系统

下列内容请改读对应文档：

- 如何启动项目：读 [getting-started.md](./getting-started.md)
- `runtime/` 目录和回放文件职责：读 [runtime.md](./runtime.md)
- 资料池文件与同步细节：读 [session-reference-library-implementation.md](./session-reference-library-implementation.md)
- 历史审查材料：已清理，不再作为独立文档维护

## 8. 继续阅读

- [快速开始](./getting-started.md)
- [运行时与回放](./runtime.md)
- [诡辩实验模式说明](./sophistry-experiment-mode-design.md)
- [后端开发指南](./guides/backend-development.md)
- [前端开发指南](./guides/frontend-development.md)
- [编码规范指南](./guides/encoding.md)
