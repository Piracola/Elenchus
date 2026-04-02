# Elenchus 文档中心

这份索引页是仓库内详细文档的**唯一入口索引**。

使用规则：

- 想把项目跑起来：先读 [快速开始](./getting-started.md)。这是**唯一完整启动文档**。
- 想理解当前系统结构：读 [系统架构总览](./architecture.md) 与 [运行时与回放](./runtime.md)。
- 想进入某个子目录：`backend/README.md` 与 `frontend/README.md` 只是**轻量目录入口**，不再承担完整命令手册职责。
- 遇到历史规划、归档分析、旧 UI 概念稿时，默认先回到本页确认它是否属于“当前事实来源”。

## 1. 当前使用与启动

- [项目入口 README](../README.md)
- [快速开始](./getting-started.md) — **当前启动与默认地址的唯一完整说明**

适合：第一次运行项目、确认默认端口、选择一键启动或手动启动路径。

## 2. 当前架构与运行时

- [系统架构总览](./architecture.md) — **当前系统分层、职责边界、关键模块入口**
- [运行时与回放](./runtime.md) — **当前 `runtime/` 目录、快照 / 事件 / 回放关系**

说明：

- `architecture.md` 负责“系统如何组织”。
- `runtime.md` 负责“运行后生成什么、放在哪里、如何恢复与回放”。
- [2026-03-17 历史审查合并摘要](./archive/2026-03-17-audit-summary.md) 保留架构收敛与历史审查背景，不与以上两份当前文档竞争权威性。

## 3. 开发指南

### 后端

- [后端开发指南](./guides/backend-development.md) — 后端测试、运行时路径、环境变量、关键入口
- [后端目录入口 README](../backend/README.md) — 轻量目录说明与继续阅读入口
- `backend/manual_tests/` — 手动验证脚本目录，与自动化测试目录隔离

### 前端

- [前端开发指南](./guides/frontend-development.md) — Vite 代理、联调要点、常用开发命令、关键入口
- [前端目录入口 README](../frontend/README.md) — 轻量目录说明与继续阅读入口

说明：首次安装与启动步骤统一收口到 [快速开始](./getting-started.md)，开发指南不再重复完整启动手册。

## 4. 特性实现文档

- [会话级资料池实现说明](./session-reference-library-implementation.md) — **资料池当前实现说明**
- [诡辩实验模式说明](./sophistry-experiment-mode-design.md) — 当前模式行为与边界
- [诡辩实验模式谬误库](./sophistry-fallacy-catalog.md) — 模式使用的概念资料

### 提示词文件索引

- [backend/prompts/debater_system.md](file:///i:/JBCode/AI%20Tools/Elenchus/backend/prompts/debater_system.md) — 标准模式辩手通用基础提示词
- [backend/prompts/debater_proposer.md](file:///i:/JBCode/AI%20Tools/Elenchus/backend/prompts/debater_proposer.md) — 标准模式正方补充提示词
- [backend/prompts/debater_opposer.md](file:///i:/JBCode/AI%20Tools/Elenchus/backend/prompts/debater_opposer.md) — 标准模式反方补充提示词
- [backend/prompts/judge_system.md](file:///i:/JBCode/AI%20Tools/Elenchus/backend/prompts/judge_system.md) — 标准模式裁判提示词
- [backend/prompts/fact_checker_system.md](file:///i:/JBCode/AI%20Tools/Elenchus/backend/prompts/fact_checker_system.md) — 事实核查代理提示词
- [backend/prompts/sophistry/debater_system.md](file:///i:/JBCode/AI%20Tools/Elenchus/backend/prompts/sophistry/debater_system.md) — 诡辩模式辩手通用基础提示词
- [backend/prompts/sophistry/debater_proposer.md](file:///i:/JBCode/AI%20Tools/Elenchus/backend/prompts/sophistry/debater_proposer.md) — 诡辩模式正方补充提示词
- [backend/prompts/sophistry/debater_opposer.md](file:///i:/JBCode/AI%20Tools/Elenchus/backend/prompts/sophistry/debater_opposer.md) — 诡辩模式反方补充提示词
- [backend/prompts/sophistry/observer_system.md](file:///i:/JBCode/AI%20Tools/Elenchus/backend/prompts/sophistry/observer_system.md) — 诡辩模式观察员提示词

说明：标准模式与诡辩模式都采用“基础提示词 + 角色补充提示词”的拼接加载方式；具体加载入口见 [prompt_loader.py](file:///i:/JBCode/AI%20Tools/Elenchus/backend/app/agents/prompt_loader.py) 与 [sophistry_prompt_loader.py](file:///i:/JBCode/AI%20Tools/Elenchus/backend/app/agents/sophistry_prompt_loader.py)。

说明：如果同一主题同时存在“实现说明”和“规划 / MVP / 方案稿”，默认以实现说明为当前事实来源。

## 5. 历史 / 归档 / 概念资料

- [代码优化与架构审查报告（2026-04-02）](./CODE_OPTIMIZATION_AUDIT_2026-04-02.md) — **当前项目级综合审查结论、长度分析与优化路线图**
- [会话级资料池 MVP 规划](./session-reference-library-mvp-plan.md) — 历史规划背景，已由实现文档取代当前说明职责
- [代码质量报告（已核实版）](./CODE_QUALITY_REPORT_2026-03-18.md) — 2026-03-18 该轮清理的主报告
- [原始代码审查背景](./code-audit-2026-03-18.md) — 原始审查背景，结论以已核实版为准
- [2026-03-17 历史审查合并摘要](./archive/2026-03-17-audit-summary.md) — archive 三份历史审查材料的统一入口
- [3.1.0 发布说明](./releases/3.1.0.md)
- [历史归档](./archive/README.md)
- [UI 概念设计](./UI概念设计/README.md)

说明：这些文档的价值主要在于保留演进背景、设计判断和阶段性记录；除特别标注外，它们**不作为当前实现的唯一事实来源**。
