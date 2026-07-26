# 001 - 锚定弹层与下拉菜单的入场/出场动画

> **状态：部分完成（2026-07-26 核对）** — 导出菜单、辩手设置弹层与首页上传弹层已接入
> `AnimatePresence`；`ReferenceLibraryPopover.tsx` 仍缺入场/出场过渡。

- **Status**: 部分完成（见顶部说明）
- **Commit**: 4664896
- **Severity**: HIGH
- **Category**: Physicality & origin / Missed opportunities
- **Estimated scope**: 3 files, ~30 lines

## Problem

三个由按钮触发的锚定浮层(导出菜单、参考资料上传弹层、辩手设置弹窗)要么完全没有过渡,要么定义了 `exit` 却因缺少 `AnimatePresence` 而瞬间消失,与它们各自的触发按钮在空间上毫无关联。仓库里已有正确范例 `CustomSelect`,但这三处没有对齐。

### 位置 1 — 导出下拉菜单(无任何过渡)

`frontend/src/components/chat/ChatHeaderOverlay.tsx:320` 当前代码:

```tsx
                {showExportMenu && (
                  <div
                    ref={exportMenuRef}
                    style={{
                      position: 'absolute',
                      top: 'calc(100% + 8px)',
                      left: 0,
                      minWidth: '240px',
                      padding: '14px',
                      ...HEADER_TOOLBAR_PANEL_STYLE,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px',
                      zIndex: 1000,
                    }}
                  >
```

只有箭头 `ChevronDown` 旋转(`:311-317`),菜单面板本身硬弹出/硬消失。

### 位置 2 — 参考资料上传弹层(有 `exit` 但不生效)

`frontend/src/components/home/HomeComposerCard.tsx:744` 当前代码:

```tsx
                                    {showUploadPopover && (
                                        <>
                                        <div
                                            style={{
                                                position: 'fixed',
                                                top: 0,
                                                left: 0,
                                                right: 0,
                                                bottom: 0,
                                                zIndex: 40,
                                            }}
                                            onClick={() => setShowUploadPopover(false)}
                                        />
                                        <motion.div
                                            className="home-reference-popover"
                                            initial={{ opacity: 0, y: -8, scale: 0.98 }}
                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                            exit={{ opacity: 0, y: -8, scale: 0.98 }}
                                            style={{
                                                position: 'absolute',
                                                top: 'calc(100% + 8px)',
                                                right: 0,
                                                zIndex: 50,
                                                ...
                                            }}
                                        >
```

`motion.div` 写了 `exit`,但外层是普通片段 `<>…</>`,没有 `<AnimatePresence>`,因此关闭时瞬间消失、`exit` 从未执行;且缺少 `transition` 属性(走 framer 默认值)。

### 位置 3 — 辩手设置弹窗(仅透明度淡入,无缩放自锚点)

`frontend/src/components/chat/DebaterSettingsModal.tsx:202` 当前代码:

```tsx
                <motion.div
                    ref={popoverRef}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.16, ease: 'easeOut' }}
                    style={{
                        ...popoverStyle,
                        padding: '14px',
                        ...HEADER_TOOLBAR_PANEL_STYLE,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px',
                        overflow: 'hidden',
                    }}
                >
```

已包在 `<AnimatePresence>` 内(`:200`),但只有 `opacity`,没有从触发按钮"长出来"的缩放,与触发器无空间关联。

## Target

三处统一对齐 `CustomSelect` 的锚定缩放配方:从触发器一侧以 `scale: 0.96` + `opacity: 0` + 轻微 `y` 偏移进入,反向退出;`transform-origin` 落在靠近触发按钮的角。

```tsx
/* 目标配方(逐字取自 CustomSelect.tsx:193-196,210) */
initial={{ opacity: 0, y: -8, scale: 0.96 }}
animate={{ opacity: 1, y: 0, scale: 1 }}
exit={{ opacity: 0, y: -8, scale: 0.96 }}
transition={{ duration: 0.15, ease: 'easeOut' }}
// style 内追加:
transformOrigin: 'top left'   // 或 'top right',见各位置说明
```

- 位置 1(导出菜单,`left: 0` 在按钮下方左侧展开):`transformOrigin: 'top left'`
- 位置 2(上传弹层,`right: 0` 在按钮下方右侧展开):`transformOrigin: 'top right'`,保留其现有 `scale: 0.98`/`y: -8` 起止值(略柔,与该弹层尺寸匹配),只补 `transition` 与 `transformOrigin`,并补 `AnimatePresence` 包裹。
- 位置 3(辩手设置弹窗,定位在 `rect.left`/`rect.bottom + 8`):`transformOrigin: 'top left'`,保留现有 `duration: 0.16, ease: 'easeOut'`,仅把 `scale: 0.96`/`1`/`0.96` 并入 `initial`/`animate`/`exit`。

## Repo conventions to follow

- framer-motion 简写(`opacity`/`y`/`scale`)是全仓库约定,内部已编译为 `transform`,沿用即可,不要改成 `transform: "translateY(...)"` 字符串(会与既有代码并行产生第二套写法)。
- 锚定浮层缩放进场的范例:`frontend/src/components/shared/CustomSelect.tsx:188-211`(`AnimatePresence` + `motion.div` + `transformOrigin` 随 `placement` 取 `top center`/`bottom center`)。
- 面板/手风琴的缓动数组 `[0.22, 1, 0.36, 1]` 用于高度过渡;下拉这类纯缩放沿用 `CustomSelect` 的 `ease: 'easeOut'`、`duration: 0.15`。
- `AnimatePresence` 需从 `framer-motion` 具名导入。

## Steps

### 位置 1 — 导出菜单 `ChatHeaderOverlay.tsx`

1. 第 2 行导入补 `AnimatePresence`:
   ```tsx
   import { AnimatePresence, motion } from 'framer-motion';
   ```
2. 将 `:320` 的 `{showExportMenu && (` 用 `<AnimatePresence>` 包裹,并把内部 `<div ref={exportMenuRef} …>` 改为 `<motion.div ref={exportMenuRef} …>`,追加 motion 属性与 `transformOrigin`:
   ```tsx
                <AnimatePresence>
                  {showExportMenu && (
                    <motion.div
                      ref={exportMenuRef}
                      initial={{ opacity: 0, y: -8, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -8, scale: 0.96 }}
                      transition={{ duration: 0.15, ease: 'easeOut' }}
                      style={{
                        position: 'absolute',
                        top: 'calc(100% + 8px)',
                        left: 0,
                        minWidth: '240px',
                        padding: '14px',
                        ...HEADER_TOOLBAR_PANEL_STYLE,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px',
                        zIndex: 1000,
                        transformOrigin: 'top left',
                      }}
                    >
                  ...
                    </motion.div>
                  )}
                </AnimatePresence>
   ```
   闭合标签 `:485` 的 `</div>` 同步改为 `</motion.div>`,并在其后补 `</AnimatePresence>`。注意 `exportMenuRef` 仍挂在 `motion.div` 上(其 `current` 仍是 `HTMLDivElement`,与现有 ref 类型一致)。

### 位置 2 — 上传弹层 `HomeComposerCard.tsx`

1. 第 13 行导入补 `AnimatePresence`:
   ```tsx
   import { motion, AnimatePresence } from 'framer-motion';
   ```
2. 在 `:757` 的 `<motion.div className="home-reference-popover">` 外层包一层 `<AnimatePresence>`(透明遮罩 `<div>` 留在 `AnimatePresence` 之外,作为兄弟节点,瞬间显隐即可):
   ```tsx
                                        <div
                                            /* …existing overlay… */
                                            onClick={() => setShowUploadPopover(false)}
                                        />
                                        <AnimatePresence>
                                        <motion.div
                                            className="home-reference-popover"
                                            initial={{ opacity: 0, y: -8, scale: 0.98 }}
                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                            exit={{ opacity: 0, y: -8, scale: 0.98 }}
                                            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                                            style={{
                                                position: 'absolute',
                                                top: 'calc(100% + 8px)',
                                                right: 0,
                                                zIndex: 50,
                                                minWidth: '360px',
                                                maxWidth: '420px',
                                                padding: '16px',
                                                /* …其余背景/边框/圆角/阴影保持不变… */
                                                transformOrigin: 'top right',
                                            }}
                                        >
                                        ...
                                        </motion.div>
                                        </AnimatePresence>
   ```
   在 `:953` 的 `</motion.div>` 后补 `</AnimatePresence>`。保留其原有 `scale: 0.98`(比 `CustomSelect` 的 `0.96` 更柔,匹配该弹层更大尺寸),只补 `transition` 与 `transformOrigin`。

### 位置 3 — 辩手设置弹窗 `DebaterSettingsModal.tsx`

1. 导入已含 `AnimatePresence`(第 7 行),无需改。
2. `:202` 的 `motion.div`,把 `scale` 并入现有 `initial`/`animate`/`exit`,并在 `style` 追加 `transformOrigin`:
   ```tsx
                <motion.div
                    ref={popoverRef}
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    transition={{ duration: 0.16, ease: 'easeOut' }}
                    style={{
                        ...popoverStyle,
                        padding: '14px',
                        ...HEADER_TOOLBAR_PANEL_STYLE,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px',
                        overflow: 'hidden',
                        transformOrigin: 'top left',
                    }}
                >
   ```

## Boundaries

- 不要改这三处的 JSX 结构、定位逻辑、z-index、关闭逻辑(点外/Escape 关闭)。
- 不要改 `CustomSelect.tsx`(它是范例,不是被改对象)。
- 不要新增依赖。framer-motion 已在依赖中。
- 若某处代码与上述摘录不符(自提交 `4664896` 起漂移),停止并报告,不要即兴改。

## Verification

- **Mechanical**:
  - `cd frontend && npx tsc -p tsconfig.app.json --noEmit` 通过(无类型错误)。
  - `cd frontend && npx vitest run src/components/chat/DebaterSettingsModal.test.tsx` 通过(该测试 mock 了 framer-motion,确认渲染未破坏)。
- **Feel check**(运行 `npm run dev`,打开有会话的聊天页):
  - 点"导出":菜单从按钮左下方缩放长出(非中心、非硬弹);再点别处/按 Esc:反向缩回消失(非瞬间消失)。
  - 主页"创建辩论"卡片里点"管理":参考资料弹层从按钮右下方缩放长出;点遮罩关闭:反向缩回(此前是瞬间消失)。
  - 点"辩手设置":弹窗从按钮附近缩放长出(此前仅淡入)。
  - 快速反复点开/关闭导出菜单:不会从零重启动画(AnimatePresence + 过渡可中断重定向)。
  - DevTools 动画面板降到 10% 回放,确认缩放原点在触发器一侧而非中心。
  - 渲染面板勾选 `prefers-reduced-motion`(依赖 005 落地后):位移/缩放被去掉,仅保留透明度反馈。
- **Done when**:三处浮层都以 `scale:0.96→1` 从触发器一侧缩放进入、反向退出,且类型检查与既有测试通过。
