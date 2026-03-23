# Elenchus 平台简化基线

更新时间：2026-03-18

> 说明：本文档保留的是平台架构收敛过程中的**决策背景与工程基线**。
> 当前系统架构说明请优先参考 [docs/architecture.md](./docs/architecture.md)，运行时产物说明请参考 [docs/runtime.md](./docs/runtime.md)。
> 本文档不再与这两份文档竞争“当前唯一事实来源”的角色。

这份文档不再作为“漫长的重构路线图”，而是作为当时已经确定下来的平台架构基线。后续开发默认遵守这里收敛出的边界，但具体当前实现仍应以 `docs/` 下的现行文档和代码为准。

## 1. 最终决策

- 保留 LangGraph，不替换为自有编排内核。
- 前端主路径只服务“创建会话、运行辩论、观察结果、导出内容”这四件事。
- 观测能力统一收口到一个 `RuntimeInspector`，不再让多个实验面板同时挤占主聊天区。
- 后端运行链路收口到 `runner + bus + repository` 方向，减少 websocket、事件网关、广播层之间的绕行。
- 系统只承认两类核心事实源：
  - `session snapshot`
  - `runtime events`

## 2. 当前基线架构

### 2.1 前端

- 主界面结构：
  - 左侧：会话与配置
  - 中间：聊天主区
  - 右侧或内联：`RuntimeInspector`
- `RuntimeInspector` 作为唯一观测入口，包含三个标签页：
  - `ExecutionTimeline`
  - `LiveGraph`
  - `MemoryPanel`
- 顶部状态栏默认折叠，只有在需要查看运行状态时才展开。
- 宽屏下观测区稳定停靠在右侧，避免继续侵入顶部悬浮区域。

### 2.2 后端

- LangGraph 仍然负责辩论执行与流式输出。
- `DebateRunner` 负责驱动一次会话运行。
- `RuntimeBus` 统一负责：
  - 事件序号分配
  - 运行事件持久化
  - websocket 广播
  - 连接管理
- `SessionRuntimeRepository` 继续承担：
  - 会话快照读取
  - 会话状态持久化
  - 运行事件分页读取

## 3. 已经落地的内容

### 3.1 前端收口

- 多个观测面板已经收口为单一 `RuntimeInspector`。
- 宽屏布局下，观测面板已经从顶部悬浮区移到稳定侧栏。
- 顶部 `StatusBanner` 已改为默认折叠。
- `LiveGraph`、`RuntimeInspector`、`StatusBanner` 与记忆数据模型的乱码修复已经开始落地。

### 3.2 后端收口

- 新增 `backend/app/runtime/bus.py`，把“事件封装 + 顺序号 + 广播 + websocket 连接”合并到一个统一对象。
- 新增 `backend/app/runtime/runner.py`，作为新的运行入口命名。
- websocket API 已改为直接依赖 `RuntimeBus`。
- 运行时依赖注入已改为优先提供 `RuntimeBus` 与 `DebateRunner`。
- 旧的 `EventStreamGateway` 与 `ConnectionHub` 保留为兼容包装层，不再是主运行链路。

## 4. 还剩下的工作，统一降级为工程收尾

这些工作仍然要做，但它们已经不再属于“架构方向不清”的问题，而是基于当前基线继续收尾：

- 把 `ExecutionTimeline`、`MemoryPanel` 和部分旧界面文案中的乱码彻底清理干净。
- 继续减少前端历史遗留的重复中文文案源。
- 在不破坏兼容性的前提下，逐步把 repository 目录显式拆出来。
- 继续把实验功能关进 Inspector，而不是重新放回主聊天区。
- 根据体积告警决定是否对前端做代码分块。

## 5. 后续开发规则

- 新的运行态信息必须先变成 `runtime event`，再进入 UI。
- 不再新增第三套“仅供界面使用”的平行状态。
- 新的观测能力默认先进 `RuntimeInspector`，不直接塞进主聊天区。
- 删除任意一个实验观测面板时，不应影响会话创建、辩论运行、导出能力。
- 如果某项新功能需要同时改聊天主路径、运行总线、状态存储三层，先怀疑设计是否又开始发散。

## 6. 成功判定

当后续版本满足下面几条时，就说明这轮简化是成立的：

- 排查一次运行问题时，主要看 `runtime events + session snapshot` 就够了。
- 新增一个观测能力时，不需要改动聊天主路径。
- LangGraph 继续保留，但外围运行链路明显更短、更容易调试。
- 前端默认界面不再堆满实验功能，只保留最核心的辩论路径。
