# 2026-03-17 历史审查合并摘要

> 这是 `docs/archive/` 中 2026-03-17 那一轮全量审查的统一入口。  
> 当前系统事实与实现边界，请优先回到 [docs/README.md](../README.md)、[architecture.md](../architecture.md)、[runtime.md](../runtime.md)。

## 1. 这份文档的作用

这份摘要用来统一收口 2026-03-17 那一轮高度重叠的历史材料：

- [FILE_ANALYSIS.md](./FILE_ANALYSIS.md) — 原始逐文件分析
- [bug.md](./bug.md) — 当轮缺陷修复计划
- [ARCHITECTURE_IMPROVEMENT.md](./ARCHITECTURE_IMPROVEMENT.md) — 当轮架构改进方案

这三份文档都保留了当时的原始判断，但它们的主题、问题范围和整改方向存在较大重叠。为避免历史回溯时在多份文档之间反复跳转，本页把那一轮审查的核心信息合并成单一入口。

## 2. 当轮审查关注什么

2026-03-17 的那轮审查主要围绕四类问题展开：

- 会话恢复、流式消息、状态推进中的真实运行缺陷
- 全局单例、隐式状态推断、跨层依赖等结构问题
- Provider 配置、运行时配置、认证能力等基础设施演进方案
- 前后端重复逻辑、失效测试与过长文件的清理方向

## 3. 三份原始文档分别负责什么

### FILE_ANALYSIS.md

- 记录了当时对大量文件的逐项分析
- 更偏“原始勘测资料”和问题线索
- 适合回看当时如何理解某个文件的职责与风险

### bug.md

- 记录了当时识别出的具体缺陷与修复思路
- 更偏“问题单”和实施草案
- 适合回看那一轮为什么会优先修某些问题

### ARCHITECTURE_IMPROVEMENT.md

- 记录了更高层的架构改进方案
- 更偏“收敛方向”和阶段性方案
- 适合回看当时如何判断依赖注入、配置存储、多实例兼容等议题

## 4. 为什么它们现在只能当历史材料

这些文档与当前仓库状态已经出现多处偏移，例如：

- Provider 配置与运行时配置已继续演进并收敛到 `runtime/config.json`
- 当时的部分改造设想后来没有按原样落地
- 某些历史文件路径、配置方式和中间阶段方案已不再对应当前代码

因此这组文档的正确定位应当是：

- **保留历史判断与演进背景**
- **不与当前主文档竞争权威性**
- **出现冲突时，以当前代码与当前主文档为准**

## 5. 当前回看这轮审查的推荐顺序

如果只是想快速了解这轮历史审查：

1. 先读本页
2. 再读 [bug.md](./bug.md) 了解当时的具体缺陷判断
3. 需要回看更高层决策时，再读 [ARCHITECTURE_IMPROVEMENT.md](./ARCHITECTURE_IMPROVEMENT.md)
4. 只有在需要追踪逐文件原始勘测时，再读 [FILE_ANALYSIS.md](./FILE_ANALYSIS.md)

## 6. 与当前文档的边界

- 当前系统结构：读 [architecture.md](../architecture.md)
- 当前运行时与回放：读 [runtime.md](../runtime.md)
- 当前代码优化结论与优先级：读 [CODE_OPTIMIZATION_AUDIT_2026-04-02.md](../CODE_OPTIMIZATION_AUDIT_2026-04-02.md)
- 2026-03-18 已核实整改结论：读 [CODE_QUALITY_REPORT_2026-03-18.md](../CODE_QUALITY_REPORT_2026-03-18.md)
