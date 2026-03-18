# Elenchus 重构清单（Agent Runtime Observatory）

> 目标：把系统演进为可观察、可调试、可回放、可解释、可扩展的多智能体运行控制台。

## 使用说明

- 状态定义：
  - `TODO`：未开始
  - `DOING`：进行中
  - `DONE`：已完成并通过基础验证
- 每完成一项，补充对应 PR/提交和验证结果。

---

## Phase 1：事件驱动基础（已完成）

- [x] `DONE` 统一 Runtime Event Schema（含 `event_id/seq/source/payload`）
- [x] `DONE` 建立 Event Stream Gateway（会话内顺序保证）
- [x] `DONE` Orchestrator/WebSocket 全量事件化输出
- [x] `DONE` 前端接入 Event Normalizer（兼容新旧协议）
- [x] `DONE` Zustand 改造为 Event Reducer 入口（`applyRuntimeEvent`）
- [x] `DONE` 事件去重与稳态处理（`event_id + seq + 消息层去重`）

---

## Phase 2：可观察性（进行中）

### 2.1 Execution Timeline

- [x] `DONE` Timeline 面板基础版（事件列表 + 类型筛选 + 详情查看）
- [x] `DONE` Timeline Replay 检查器雏形（滑条 + Prev/Next）
- [ ] `TODO` Timeline 性能分层（长会话分页/虚拟滚动/索引检索）
- [ ] `TODO` Timeline 关联定位（点击事件高亮对应消息/节点）

### 2.2 Live Graph（实时图）

- [ ] `TODO` 图节点实时激活态（node-level heartbeat）
- [ ] `TODO` 边流动动画（token flow）
- [ ] `TODO` 分支节点动态生成与折叠
- [ ] `TODO` 执行热度层（node heatmap）

### 2.3 Replay Engine

- [ ] `TODO` 会话级事件快照导出/导入
- [ ] `TODO` 基于事件流的 UI 回放（时间轴驱动）
- [ ] `TODO` 回放模式与实时模式双通道切换
- [ ] `TODO` 回放一致性校验（同输入同轨迹）

---

## Phase 3：认知层 UI

### 3.1 Memory Visualization

- [ ] `TODO` Memory Graph（来源/引用/时间）
- [ ] `TODO` 记忆重要性评分可视化
- [ ] `TODO` 记忆衰减动画
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
- [ ] `TODO` 为 Graph 与 Timeline 建立统一事件字典
- [ ] `TODO` 增加性能基准（长会话 10k+ events）

---

## 近期冲刺建议（接下来 1-2 周）

- [x] `DONE` P2-1：Timeline 与消息/节点联动定位
- [x] `DONE` P2-2：Live Graph MVP（节点激活 + 流动边）
- [ ] `TODO` P2-3：Replay 会话导入与回放控制
