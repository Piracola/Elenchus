# Elenchus 重构清单（Agent Runtime Observatory）

> 目标：把系统演进为可观察、可调试、可回放、可解释、可扩展的多智能体运行控制台。
> 最近同步审计：2026-03-18（以当前代码、测试与运行入口为准）

## 使用说明

- 状态定义：
  - `TODO`：未开始
  - `DOING`：进行中
  - `DONE`：已完成并通过基础验证
- 每完成一项，补充对应 PR/提交和验证结果。

## 当前真实状态摘要

- Phase 1：已完成
- Phase 2：MVP 已落地，当前重点转为长会话与可视化深度补强
- Phase 3：已落地 Memory Stream 前置能力，但尚未形成完整认知层 UI
- Phase 4：尚未开始

---

## Phase 1：事件驱动基础（已完成）

- [x] `DONE` 统一 Runtime Event Schema（含 `event_id/seq/source/payload`）
- [x] `DONE` 建立 Event Stream Gateway（会话内顺序保证）
- [x] `DONE` Orchestrator/WebSocket 全量事件化输出
- [x] `DONE` 前端接入 Event Normalizer（兼容新旧协议）
- [x] `DONE` Zustand 改造为 Event Reducer 入口（`applyRuntimeEvent`）
- [x] `DONE` 事件去重与稳态处理（`event_id + seq + 消息层去重`）

---

## Phase 2：可观察性（进行中，MVP 已落地）

### 2.1 Execution Timeline

- [x] `DONE` Timeline 面板基础版（事件列表 + 类型筛选 + 详情查看）
- [x] `DONE` Timeline Replay 检查器雏形（滑条 + Prev/Next）
- [x] `DONE` Timeline 关联定位（点击事件高亮对应消息/节点）
- [x] `DONE` Timeline 搜索、分页窗口与逐步加载（长会话基础版）
- [ ] `DOING` Timeline 性能分层补强（前端虚拟渲染 + 搜索索引已完成，服务端索引检索仍待继续）

### 2.2 Live Graph（实时图）

- [x] `DONE` 图节点实时激活态（node-level heartbeat）
- [x] `DONE` 边流动动画（token flow）
- [x] `DONE` 执行热度层（node heatmap）
- [ ] `TODO` 分支节点动态生成与折叠
- [ ] `DOING` Live Graph 深化（动态子图 / merge 关系 / 更真实 token 语义）

### 2.3 Replay Engine

- [x] `DONE` 会话级事件快照导出/导入
- [x] `DONE` 基于事件流的 UI 回放（时间轴驱动）
- [x] `DONE` 回放模式与实时模式双通道切换
- [x] `DONE` 回放一致性校验（同输入同轨迹）
- [x] `DONE` 全量历史快照导出与整段回放装载（基于服务端持久化事件）
- [ ] `DOING` 超长会话回放补强（当前前端常驻最近 10,000 条，旧事件已支持服务端分页回捞；更深层的回放性能与回放分析仍可继续增强）

---

## Phase 3：认知层 UI

### 3.1 Memory Visualization

- [x] `DONE` Memory Stream Panel（回放感知 + 来源事件回跳）
- [x] `DONE` 记忆重要性评分可视化
- [ ] `DOING` 记忆衰减表达（当前为数值/条形表达，未实现真实时衰减动画）
- [ ] `TODO` Memory Graph（来源/引用/时间）
- [ ] `TODO` Semantic Cluster（语义分群）
- [ ] `TODO` Knowledge Timeline（知识演化轨迹）

### 3.2 Agent Relationship

- [ ] `TODO` Agent 共享记忆关系图
- [ ] `TODO` 多 Agent 辩论热力图（Debate Heatmap）

---

## Phase 4：体验升级

- [ ] `TODO` Optimistic Agent UI（预测下一步行为）
- [ ] `TODO` Tool 调用计划前置展示
- [ ] `TODO` 可干预节点提示与插入
- [ ] `TODO` 执行路径概率可视化

---

## 技术债与回归保护

- [ ] `TODO` 为事件 reducer 增加覆盖率门槛
- [ ] `TODO` 增加 Timeline/Replay 端到端回归用例
- [x] `DONE` 为 Graph 与 Timeline 建立统一事件字典
- [x] `DONE` 增加性能基准（长会话 10k+ events）
- [x] `DONE` 长会话数据通路补强（Runtime Event 已持久化，前端支持服务端分页加载旧事件）

---

## 近期冲刺建议（接下来 1-2 周）

- [x] `DONE` P2-1：Timeline 与消息/节点联动定位
- [x] `DONE` P2-2：Live Graph MVP（节点激活 + 流动边）
- [x] `DONE` P2-3：Replay 会话导入与回放控制
- [x] `DONE` P2-H2：全量历史导出与整段 replay 装载
- [ ] `DOING` P2-H3：Timeline 虚拟渲染与搜索性能优化
- [ ] `TODO` P3-1：Memory Graph 初版（时间/来源/引用）
- [ ] `TODO` P3-2：Knowledge Timeline 与来源跳转深化
- [x] `DONE` P2-H1：超长会话 runtime event 持久化与分页加载（补齐 10,000+ 之后的服务端历史）
