# 动画改进计划

基于 `find-animation-opportunities` 审查产出,经 `improve-animations` 流程沉淀。提交基线:`4664896`。

## 计划总览

| # | 标题 | 严重度 | 状态 |
| --- | --- | --- | --- |
| 001 | 锚定弹层与下拉菜单的入场/出场动画 | HIGH | TODO |
| 002 | ThinkingBlock 展开/折叠动画 | HIGH | TODO |
| 003 | 待上传参考资料列表的增删动画 | MEDIUM | TODO |
| 004 | 按钮按压反馈(whileTap) | MEDIUM | TODO |
| 005 | reduced-motion 尊重系统偏好 | MEDIUM | TODO |

## 推荐执行顺序

1. **001** - 锚定弹层入场/出场(独立,最高杠杆)
2. **002** - ThinkingBlock 展开/折叠(独立;002 步骤会顺带覆盖 004 的位置 1)
3. **003** - 待上传列表增删(独立;与 001 共改 `HomeComposerCard.tsx` 的不同区块,互不冲突)
4. **004** - 按钮按压反馈(002 完成后跳过其位置 1)
5. **005** - reduced-motion(最后,使 001-004 全部自动尊重系统偏好;并为内联关键帧补 `useReducedMotion`)

## 依赖

- **005 依赖 001-004 已落地**:005 的 `reducedMotion="user"` 让 framer-motion 动画自动减少运动,因此应在 001-004 之后做 feel-check 验证。
- **004 位置 1(ThinkingBlock 切换按钮)与 002 步骤 2 重叠**:002 会将该 `<button>` 改为 `<motion.button>` 并加 `whileTap`,故执行 004 时若 002 已完成则跳过位置 1。
- 001 与 003 都改 `HomeComposerCard.tsx`,但分别作用于上传弹层(`:757`)与文档列表(`:870`)区块,无重叠;执行顺序上 001 在前更顺(先处理弹层容器)。
