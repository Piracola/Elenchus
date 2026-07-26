# 002 - ThinkingBlock 展开/折叠动画

> **状态：已完成（2026-07-26 核对）** — `messageRow/ThinkingBlock.tsx` 已使用
> `AnimatePresence` + `motion.div` 实现展开/折叠。

- **Status**: 已完成
- **Commit**: 4664896
- **Severity**: HIGH
- **Category**: Missed opportunities / Interruptibility
- **Estimated scope**: 1 file, ~15 lines

## Problem

`ThinkingBlock` 是每条辩手/裁判消息里的"思维链"折叠块。展开/折叠时,内容在"提示文字"与"完整 markdown"之间用三元表达式瞬间切换,没有任何过渡;切换按钮是普通 `<button>`,无按压反馈。

`frontend/src/components/chat/messageRow/ThinkingBlock.tsx:111-139` 当前代码:

```tsx
                <button
                    type="button"
                    data-thinking-toggle="true"
                    aria-expanded={expanded}
                    aria-label={expanded ? THINKING_PANEL_HIDE_TITLE : THINKING_PANEL_SHOW_TITLE}
                    title={expanded ? THINKING_PANEL_HIDE_TITLE : THINKING_PANEL_SHOW_TITLE}
                    onClick={() => setExpanded((current) => !current)}
                    style={thinkingToggleStyle(expanded)}
                >
                    <span>{expanded ? THINKING_PANEL_HIDE : THINKING_PANEL_SHOW}</span>
                </button>
            </div>
            {expanded ? (
                <div
                    className="markdown-body"
                    data-thinking-content="visible"
                    style={{
                        ...markdownBodyStyle(fontSize, textColor),
                        padding: '0 12px 10px',
                        lineHeight: 1.62,
                    }}
                >
                    <MessageMarkdown text={content} />
                </div>
            ) : (
                <div data-thinking-content="collapsed" style={thinkingHintStyle()}>
                    {THINKING_PANEL_HINT}
                </div>
            )}
```

面板本身已有 `overflow: 'hidden'`(`:17`),是现成的手风琴容器,但折叠态高度直接跳变。

## Target

用仓库既有的手风琴配方(`height` + `opacity` + `y`,缓动 `[0.22, 1, 0.36, 1]`)包裹两个分支,使内容展开/折叠平滑过渡;给切换按钮加 `whileTap` 按压反馈。用 `AnimatePresence`(过渡而非关键帧)以便快速反复点按能平滑重定向。

```tsx
/* 目标配方(逐字取自 HomeComposerCard.tsx:562-565) */
initial={{ opacity: 0, height: 0, y: -6 }}
animate={{ opacity: 1, height: 'auto', y: 0 }}
exit={{ opacity: 0, height: 0, y: -4 }}
transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}

/* 切换按钮按压(取自 DebateControls.tsx:153) */
whileTap={{ scale: 0.98 }}
```

## Repo conventions to follow

- 手风琴/面板高度过渡范例:`frontend/src/components/home/HomeComposerCard.tsx:561-565`(高级配置面板)、`frontend/src/components/chat/DebateControls.tsx:308-316`、`frontend/src/components/HomeView.tsx:412-424`。仓库统一用 `height: 'auto'` + `opacity` + `y` + `[0.22, 1, 0.36, 1]`。
- `<AnimatePresence initial={false}>` 用于可折叠区,避免首次渲染时播放入场(`HomeComposerCard.tsx:308`、`HomeView.tsx:412` 均如此)。
- 按压反馈范例:`DebateControls.tsx:153` `whileTap={{ scale: 0.98 }}`。
- framer-motion 简写(`opacity`/`height`/`y`/`scale`)沿用,不改成 transform 字符串。

## Steps

1. 第 1 行 React 导入补 `AnimatePresence`(若尚未引入)。当前为 `import { useState } from 'react';`,改为:
   ```tsx
   import { useState } from 'react';
   import { AnimatePresence, motion } from 'framer-motion';
   ```
   (本文件目前未导入 framer-motion,需新增。)
2. `:111` 的切换按钮 `<button>` 改为 `<motion.button>`,加 `whileTap`:
   ```tsx
                <motion.button
                    type="button"
                    data-thinking-toggle="true"
                    aria-expanded={expanded}
                    aria-label={expanded ? THINKING_PANEL_HIDE_TITLE : THINKING_PANEL_SHOW_TITLE}
                    title={expanded ? THINKING_PANEL_HIDE_TITLE : THINKING_PANEL_SHOW_TITLE}
                    onClick={() => setExpanded((current) => !current)}
                    whileTap={{ scale: 0.98 }}
                    style={thinkingToggleStyle(expanded)}
                >
                    <span>{expanded ? THINKING_PANEL_HIDE : THINKING_PANEL_SHOW}</span>
                </motion.button>
   ```
3. `:123-139` 的三元分支用 `<AnimatePresence initial={false}>` 包裹,两个分支各改为 `motion.div` 并带 motion 属性:
   ```tsx
            <AnimatePresence initial={false}>
                {expanded ? (
                    <motion.div
                        key="thinking-content"
                        className="markdown-body"
                        data-thinking-content="visible"
                        initial={{ opacity: 0, height: 0, y: -6 }}
                        animate={{ opacity: 1, height: 'auto', y: 0 }}
                        exit={{ opacity: 0, height: 0, y: -4 }}
                        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                        style={{
                            ...markdownBodyStyle(fontSize, textColor),
                            padding: '0 12px 10px',
                            lineHeight: 1.62,
                            overflow: 'hidden',
                        }}
                    >
                        <MessageMarkdown text={content} />
                    </motion.div>
                ) : (
                    <motion.div
                        key="thinking-hint"
                        data-thinking-content="collapsed"
                        initial={{ opacity: 0, height: 0, y: -6 }}
                        animate={{ opacity: 1, height: 'auto', y: 0 }}
                        exit={{ opacity: 0, height: 0, y: -4 }}
                        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                        style={{ ...thinkingHintStyle(), overflow: 'hidden' }}
                    >
                        {THINKING_PANEL_HINT}
                    </motion.div>
                )}
            </AnimatePresence>
   ```
   两个分支都需要 `key`,以便 `AnimatePresence` 在切换时先退场再进场。各分支 `style` 追加 `overflow: 'hidden'` 让 `height: 'auto'` 过渡不溢出(外层面板的 `overflow:hidden` 已在 `:17`,分支内再加一层更稳)。

## Boundaries

- 不改 `thinkingPanelStyle`/`thinkingHeaderStyle` 等样式函数的结构,只在分支 `style` 上叠加 `overflow: 'hidden'`。
- 不改 `MessageMarkdown` 渲染、`data-*` 属性、`aria-*`(测试与外部脚本可能依赖)。
- 不新增依赖。
- 若代码与摘录不符,停止并报告。

## Verification

- **Mechanical**:
  - `cd frontend && npx tsc -p tsconfig.app.json --noEmit` 通过。
  - `cd frontend && npx vitest run` 全量通过(确认未破坏既有测试;若 `ThinkingBlock` 相关快照/渲染断言失败,按需更新断言)。
- **Feel check**(运行 `npm run dev`,进入有辩手发言的会话):
  - 点"展开":提示文字平滑收起、markdown 内容从上方展开(非瞬间跳变)。
  - 点"折叠":反向,内容收起、提示文字出现。
  - 快速反复点按切换:动画从当前状态平滑重定向,不闪、不从零重启。
  - 切换按钮按下时有轻微缩小反馈。
  - DevTools 动画面板 10% 回放,确认高度与透明度同时过渡、缓动为减速曲线。
  - 勾选 `prefers-reduced-motion`(005 落地后):高度/位移被去掉,仅保留透明度淡入淡出。
- **Done when**:展开/折叠为平滑高度+透明度过渡,切换按钮有按压反馈,类型与测试通过。
