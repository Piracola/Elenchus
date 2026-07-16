# 003 - 待上传参考资料列表的增删动画

- **Status**: TODO
- **Commit**: 4664896
- **Severity**: MEDIUM
- **Category**: Missed opportunities / Interruptibility
- **Estimated scope**: 1 file, ~15 lines

## Problem

主页"创建辩论"卡片里,待上传参考资料列表通过 `.map()` 直接挂载/卸载行,没有过渡;新增文档时整行硬弹出,点"移除"按钮时整行瞬间消失,周围行硬跳到新位置。该列表是偶发/低频操作(参考文档为可选项),适合入场/出场过渡。

`frontend/src/components/home/HomeComposerCard.tsx:870-951` 当前代码:

```tsx
                                            {pendingDocuments.length > 0 && (
                                                <div
                                                    style={{
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        gap: '8px',
                                                        maxHeight: '240px',
                                                        overflowY: 'auto',
                                                    }}
                                                >
                                                    {pendingDocuments.map((doc) => (
                                                        <div
                                                            key={doc.id}
                                                            style={{
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: '10px',
                                                                padding: '10px 12px',
                                                                background: isSophistryMode
                                                                    ? 'var(--mode-sophistry-soft)'
                                                                    : 'var(--bg-secondary)',
                                                                border: '1px solid transparent',
                                                                borderRadius: 'var(--radius-md)',
                                                            }}
                                                        >
                                                            ...
                                                            <motion.button
                                                                type="button"
                                                                onClick={() => removeDocument(doc.id)}
                                                                ...
                                                            >
                                                                <X size={14} />
                                                            </motion.button>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
```

列表项是普通 `<div key={doc.id}>`,无 `AnimatePresence`、无 motion 属性。

## Target

用 `<AnimatePresence initial={false}>` 包裹列表,每行改为 `motion.div key={doc.id}`,以 `height` + `opacity` 过渡进场/退场(过渡而非关键帧,便于连续增删平滑重定向)。

```tsx
/* 目标配方(沿用本计划 002 同款手风琴曲线,取自 HomeComposerCard.tsx:562-565) */
initial={{ opacity: 0, height: 0 }}
animate={{ opacity: 1, height: 'auto' }}
exit={{ opacity: 0, height: 0 }}
transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
```

`initial={false}` 避免弹层首次打开时已有文档行播放入场动画。

## Repo conventions to follow

- 高度过渡曲线范例:`frontend/src/components/home/HomeComposerCard.tsx:562-565`。
- `AnimatePresence initial={false}` 用法:`HomeComposerCard.tsx:308`、`HomeView.tsx:412`。
- framer-motion 简写沿用。
- 列表项 `key` 必须稳定(`doc.id` 已是稳定唯一值)。

## Steps

1. 第 13 行导入确认含 `AnimatePresence`(若 001 已补,则跳过;否则):
   ```tsx
   import { motion, AnimatePresence } from 'framer-motion';
   ```
2. `:870` 的 `{pendingDocuments.length > 0 && (` 保留作为外层条件;在内部列表容器 `<div …>` 与 `.map()` 之间插入 `<AnimatePresence initial={false}>` 包裹。将每行 `<div key={doc.id} …>` 改为 `<motion.div key={doc.id} …>` 并加 motion 属性:
   ```tsx
                                                <AnimatePresence initial={false}>
                                                    {pendingDocuments.map((doc) => (
                                                        <motion.div
                                                            key={doc.id}
                                                            initial={{ opacity: 0, height: 0 }}
                                                            animate={{ opacity: 1, height: 'auto' }}
                                                            exit={{ opacity: 0, height: 0 }}
                                                            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                                                            style={{
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: '10px',
                                                                padding: '10px 12px',
                                                                background: isSophistryMode
                                                                    ? 'var(--mode-sophistry-soft)'
                                                                    : 'var(--bg-secondary)',
                                                                border: '1px solid transparent',
                                                                borderRadius: 'var(--radius-md)',
                                                                overflow: 'hidden',
                                                            }}
                                                        >
                                                            ...
                                                        </motion.div>
                                                    ))}
                                                </AnimatePresence>
   ```
   行容器 `style` 追加 `overflow: 'hidden'`,使 `height: 'auto'` 过渡时内部不溢出。注意:内层"移除"按钮已是 `motion.button`,保持不动。
3. 注意列表外层 `<div style={{… maxHeight: 240, overflowY: 'auto'}}>` 仍保留(滚动容器),`AnimatePresence` 作为其直接子节点即可。

## Boundaries

- 不改文件上传/校验/拖拽逻辑(`handleFileSelect`、`validateFile`、`handleDrop` 等)。
- 不改每行内部的文件名/大小展示与"移除"按钮,只把行容器 `div` 换成 `motion.div` 并加过渡。
- 不改 `key` 取值(`doc.id`)。
- 不新增依赖。
- 若代码与摘录不符,停止并报告。

## Verification

- **Mechanical**:
  - `cd frontend && npx tsc -p tsconfig.app.json --noEmit` 通过。
  - `cd frontend && npx vitest run` 通过。
- **Feel check**(运行 `npm run dev`,主页"创建辩论"→"管理"):
  - 添加一个 `.md` 文件:新行从零高度平滑展开出现(非硬弹出)。
  - 点该行的"移除":行平滑收起消失、下方行平滑上移(非瞬间消失+硬跳)。
  - 连续添加多个文件、再连续移除:动画从当前状态重定向,不闪。
  - 已有文档行首次打开弹层时不播放入场(`initial={false}` 生效)。
  - DevTools 10% 回放确认高度+透明度同时过渡。
  - 勾选 `prefers-reduced-motion`(005 落地后):高度过渡被去掉,仅保留透明度。
- **Done when**:列表行增删为平滑高度+透明度过渡,类型与测试通过。
