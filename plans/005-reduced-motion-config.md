# 005 - reduced-motion 尊重系统偏好

> **状态：已完成（2026-07-26 核对）** — `App.tsx` 的 `MotionConfig` 已改为
> `reducedMotion={previewSafeMotion ? 'always' : 'user'}`，尊重系统偏好。

- **Status**: 已完成
- **Commit**: 4664896
- **Severity**: MEDIUM
- **Category**: Accessibility
- **Estimated scope**: 5 files, ~10 行

## Problem

`App.tsx` 的 `MotionConfig` 在正常使用时设为 `reducedMotion="never"`,**完全忽略** 操作系统的 `prefers-reduced-motion` 偏好。这意味着本仓库所有 framer-motion 动画(以及计划 001-004 新增的)在前庭敏感用户启用"减少动态效果"时仍在运动。此外,4 个组件里 5 处无限循环的纯 CSS 关键帧动画(`status-spin`/`spin`/`pulse`,以**内联 style** 形式)不受 `MotionConfig` 影响,需单独处理。

### 位置 1 - MotionConfig 忽略系统偏好

`frontend/src/App.tsx:14,46` 当前代码:

```tsx
const previewSafeMotion = import.meta.env.VITE_ELENCHUS_PREVIEW_SAFE_MOTION === '1';
...
    <MotionConfig reducedMotion={previewSafeMotion ? 'always' : 'never'}>
```

`previewSafeMotion`(预览安全模式,来自环境变量)应保留为 `'always'`;但正常分支的 `'never'` 应改为 `'user'`(尊重系统偏好)。

### 位置 2-5 - 内联无限关键帧动画(5 处,4 文件)

均为 `style={{ animation: '... infinite' }}`,framer-motion 不接管:

- `frontend/src/components/chat/StatusBanner.tsx:171` — `animation: 'status-spin 1s linear infinite'`(在 `StatusIcon` 子组件内,运行态 Loader2)
- `frontend/src/components/chat/RoundInsights.tsx:130` — `animation: 'pulse 1s ease-in-out infinite'`
- `frontend/src/components/chat/StreamingMessage.tsx:206` — `animation: 'pulse 1s ease-in-out infinite'`
- `frontend/src/components/sidebar/ProviderForm.tsx:216` 与 `:236` — `animation: 'spin 1s linear infinite'`

这些是纯位移/缩放(旋转、scale),无透明度反馈;在 reduced-motion 下应停止运动,但图标本身保持可见(状态文字/徽标仍传达"进行中")。

## Target

```tsx
/* 位置 1 - 尊重系统偏好,保留预览安全覆盖 */
<MotionConfig reducedMotion={previewSafeMotion ? 'always' : 'user'}>

/* 位置 2-5 - 用 framer-motion 的 useReducedMotion() 分支 */
const reducedMotion = useReducedMotion();
// ...
animation: reducedMotion ? 'none' : 'status-spin 1s linear infinite'   // 或 spin / pulse
```

`useReducedMotion()` 在 `MotionConfig reducedMotion="user"` 下,当系统启用 `prefers-reduced-motion: reduce` 时返回 `true`(预览安全模式 `'always'` 下也返回 `true`)。framer-motion 自身的动画(位移/缩放/布局)在 reduced 时会被框架自动去掉、保留 `opacity`/`color`,无需额外处理;本计划只补纯 CSS 关键帧这一盲区。

## Repo conventions to follow

- framer-motion 已是仓库唯一动效库;`useReducedMotion` 由其导出,与 `MotionConfig` 配套。
- AUDIT.md 第 6 类:reduced motion 意为"更少更柔,而非归零——保留辅助理解的过渡,去掉位移变化";停止无限旋转/缩放、保留图标可见,符合此原则。
- 不引入 `@media (prefers-reduced-motion)` 的全局通配重置(会误伤 `opacity`/`color` 过渡,违背"保留辅助理解"原则);用 `useReducedMotion()` 精确分支。

## Steps

1. **`App.tsx:46`** — 将 `'never'` 改为 `'user'`:
   ```tsx
    <MotionConfig reducedMotion={previewSafeMotion ? 'always' : 'user'}>
   ```
2. **`StatusBanner.tsx`** — `StatusIcon` 子组件(`:162`)内调用 `useReducedMotion()` 并分支动画。在文件顶部导入补 `useReducedMotion`:
   ```tsx
   import { motion, useReducedMotion } from 'framer-motion';
   ```
   `StatusIcon` 改为:
   ```tsx
   function StatusIcon({ tone }: { tone: StatusTone }) {
       const reducedMotion = useReducedMotion();
       if (tone === 'error') return <AlertCircle size={13} />;
       if (tone === 'complete') return <CheckCircle2 size={13} />;
       if (tone === 'paused') return <PauseCircle size={13} />;
       if (tone === 'running') {
           return (
               <Loader2
                   size={13}
                   style={{
                       animation: reducedMotion ? 'none' : 'status-spin 1s linear infinite',
                   }}
               />
           );
       }
       return <CircleDashed size={13} />;
   }
   ```
3. **`StreamingMessage.tsx:206`** — 顶部导入补 `useReducedMotion`(`import { motion, useReducedMotion } from 'framer-motion';`),在该组件函数体内 `const reducedMotion = useReducedMotion();`,把 `:206` 的内联动画改为:
   ```tsx
   animation: reducedMotion ? 'none' : 'pulse 1s ease-in-out infinite',
   ```
4. **`RoundInsights.tsx:130`** — 该文件未导入 framer-motion,新增 `import { useReducedMotion } from 'framer-motion';`,在组件函数体内 `const reducedMotion = useReducedMotion();`,把 `:130` 的内联动画改为:
   ```tsx
   animation: reducedMotion ? 'none' : 'pulse 1s ease-in-out infinite',
   ```
5. **`ProviderForm.tsx:216` 与 `:236`** — 该文件未导入 framer-motion,新增 `import { useReducedMotion } from 'framer-motion';`,在组件函数体内 `const reducedMotion = useReducedMotion();`,两处 `Loader2` 的内联动画改为:
   ```tsx
   animation: reducedMotion ? 'none' : 'spin 1s linear infinite',
   ```

## Boundaries

- 不改 `previewSafeMotion` 的判定逻辑与来源(环境变量)。
- 不改这些组件的其他逻辑、样式或结构,只分支 `animation` 字符串。
- 不新增 CSS 全局通配 reduced-motion 重置(会误伤透明度/颜色过渡)。
- 不新增依赖(`useReducedMotion` 来自已有的 framer-motion)。
- 若代码与摘录不符,停止并报告。

## Verification

- **Mechanical**:
  - `cd frontend && npx tsc -p tsconfig.app.json --noEmit` 通过。
  - `cd frontend && npx vitest run` 通过。
- **Feel check**(运行 `npm run dev`,DevTools 渲染面板勾选 `Emulate CSS prefers-reduced-motion: reduce`):
  - 运行态 `StatusBanner` 的 Loader2 图标**停止旋转**,但图标仍可见、相位文字(如"生成回复")仍显示。
  - 流式消息、轮次洞察里的 `pulse` 指示器停止缩放脉动,仍可见。
  - ProviderForm 的加载 Loader2 停止旋转,仍可见。
  - 计划 001-004 的缩放/高度/位移过渡被去掉,但**透明度淡入淡出保留**(framer 在 `reducedMotion="user"` 下自动如此)。
  - 取消勾选(恢复默认):一切动画恢复正常。
  - 预览安全模式(`VITE_ELENCHUS_PREVIEW_SAFE_MOTION=1`):所有运动被减少(`'always'`),`useReducedMotion()` 返回 `true`,与现状一致、无回归。
- **Done when**:`MotionConfig` 正常分支为 `'user'`,5 处内联无限动画在 reduced-motion 下停止且图标保留可见,类型与测试通过。
