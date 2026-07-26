# 004 - 按钮按压反馈(whileTap)

> **状态：已完成（2026-07-26 核对）** — `whileTap` 已覆盖 17 个组件文件。

- **Status**: 已完成
- **Commit**: 4664896
- **Severity**: MEDIUM
- **Category**: Physicality & origin
- **Estimated scope**: 4 files, ~10 处单行改动

## Problem

多处可点按钮(普通 `<button>` 或 `motion.button`)没有任何按压反馈,用户按下时界面毫无触觉确认。仓库其余按钮(如 `DebateControls`、`CustomSelect`、`HomeModeSelector`)已统一使用 `whileTap={{ scale: 0.98 }}`,这些漏网之鱼与整体不一致。

### 位置 1 - ThinkingBlock 切换按钮(普通 `<button>`)

`frontend/src/components/chat/messageRow/ThinkingBlock.tsx:111`:

```tsx
                <button
                    type="button"
                    data-thinking-toggle="true"
                    ...
                    onClick={() => setExpanded((current) => !current)}
                    style={thinkingToggleStyle(expanded)}
                >
```

> 注:若计划 002 已将该 `<button>` 改为 `<motion.button>` 并加 `whileTap`,则本位置已覆盖,跳过。

### 位置 2 - 辩手发言折叠按钮(普通 `<button>`)

`frontend/src/components/chat/MessageRow.tsx:259`:

```tsx
                <button
                    type="button"
                    onClick={onToggleAgentCollapsed}
                    style={collapseButtonStyle(agentCollapsed)}
                    title={collapseButtonTitle(agentCollapsed)}
                >
                    <span>{collapseButtonSymbol(agentCollapsed)}</span>
                    <span>{collapseButtonLabel(agentCollapsed)}</span>
                </button>
```

### 位置 3 - 主页"开始辩论"主 CTA(`motion.button`,无 whileTap)

`frontend/src/components/home/HomeComposerCard.tsx:530`:

```tsx
                <motion.button
                    type="button"
                    onClick={onCreateDebate}
                    disabled={!canCreate}
                    className="home-composer-card__primary"
                    style={{
                        ...
                        transition: 'background var(--transition-fast), color var(--transition-fast), opacity var(--transition-fast)',
                        ...
                    }}
                >
                    {isCreating ? '创建中' : '开始辩论'}
                    <ArrowRight size={17} />
                </motion.button>
```

### 位置 4 - 主页"管理"参考资料按钮(普通 `<button>`,用 `quietButtonStyle`)

`frontend/src/components/home/HomeComposerCard.tsx:734`:

```tsx
                                    <button
                                        type="button"
                                        onClick={() => setShowUploadPopover((current) => !current)}
                                        style={quietButtonStyle}
                                        title="上传参考资料(将在创建辩论时一起提交)"
                                    >
                                        <FileUp size={14} />
                                        管理
                                    </button>
```

### 位置 5 - 辩手设置弹窗的关闭/刷新/保存按钮(普通 `<button>`)

`frontend/src/components/chat/DebaterSettingsModal.tsx:227`(关闭)、`:273`(刷新配置)、`:287`(保存设置)均为普通 `<button>`,无按压反馈。示例(`:287`):

```tsx
                        <button
                            type="button"
                            onClick={() => {
                                void handleSave();
                            }}
                            disabled={isSaving || agentConfigsLoading}
                            style={{
                                ...HEADER_TOOLBAR_PRIMARY_BUTTON_STYLE,
                                opacity: isSaving || agentConfigsLoading ? 0.65 : 1,
                            }}
                        >
                            <Save size={13} />
                            {isSaving ? '保存中...' : '保存设置'}
                        </button>
```

## Target

统一加 `whileTap={{ scale: 0.98 }}`(仓库约定)。主 CTA 额外配 `whileHover={{ scale: 1.02 }}`(与 `DebateControls.tsx:152-153` 主按钮一致)。普通 `<button>` 需改为 `<motion.button>`。

```tsx
/* 通用按压(取自 DebateControls.tsx:153 / CustomSelect.tsx:145) */
whileTap={{ scale: 0.98 }}

/* 主 CTA 再加悬停(取自 DebateControls.tsx:152) */
whileHover={{ scale: 1.02 }}
whileTap={{ scale: 0.98 }}
```

禁用态(`disabled`)按钮不应触发缩放:对带 `disabled` 的按钮,用条件式 `whileTap={disabled ? {} : { scale: 0.98 }}`(见 `CustomSelect.tsx:145` 范例),或在 `disabled` 时返回空对象。

## Repo conventions to follow

- 按压反馈范例:`frontend/src/components/chat/DebateControls.tsx:152-153`(`whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}`)、`frontend/src/components/shared/CustomSelect.tsx:144-145`(`whileHover`/`whileTap` 在 `disabled` 时返回 `{}`)、`frontend/src/components/home/HomeModeSelector.tsx:32-33`。
- framer-motion 简写沿用。
- `<motion.button>` 接受与 `<button>` 相同的 `type`/`onClick`/`disabled`/`style`/`title`/`className` 等属性,直接替换即可。

## Steps

1. **ThinkingBlock**(`ThinkingBlock.tsx:111`):若 002 已改为 `motion.button` 并加 `whileTap`,跳过;否则按 002 步骤 2 处理。
2. **MessageRow 折叠按钮**(`MessageRow.tsx:259`):将 `<button>` 改为 `<motion.button>`,加 `whileTap={{ scale: 0.98 }}`,其余属性不变:
   ```tsx
                <motion.button
                    type="button"
                    onClick={onToggleAgentCollapsed}
                    whileTap={{ scale: 0.98 }}
                    style={collapseButtonStyle(agentCollapsed)}
                    title={collapseButtonTitle(agentCollapsed)}
                >
                    <span>{collapseButtonSymbol(agentCollapsed)}</span>
                    <span>{collapseButtonLabel(agentCollapsed)}</span>
                </motion.button>
   ```
   确认文件顶部已从 `framer-motion` 导入 `motion`(`MessageRow.tsx:2` 已有 `import { motion } from 'framer-motion';`)。
3. **主页主 CTA**(`HomeComposerCard.tsx:530`):已是 `motion.button`,加 `whileHover`/`whileTap`,且 `disabled` 时不缩放:
   ```tsx
                <motion.button
                    type="button"
                    onClick={onCreateDebate}
                    disabled={!canCreate}
                    whileHover={canCreate ? { scale: 1.02 } : {}}
                    whileTap={canCreate ? { scale: 0.98 } : {}}
                    className="home-composer-card__primary"
                    style={{ /* 不变 */ }}
                >
   ```
4. **主页"管理"按钮**(`HomeComposerCard.tsx:734`):将 `<button>` 改为 `<motion.button>`,加 `whileTap={{ scale: 0.98 }}`:
   ```tsx
                                    <motion.button
                                        type="button"
                                        onClick={() => setShowUploadPopover((current) => !current)}
                                        whileTap={{ scale: 0.98 }}
                                        style={quietButtonStyle}
                                        title="上传参考资料(将在创建辩论时一起提交)"
                                    >
                                        <FileUp size={14} />
                                        管理
                                    </motion.button>
   ```
5. **辩手设置弹窗三按钮**(`DebaterSettingsModal.tsx:227`、`:273`、`:287`):将三个 `<button>` 改为 `<motion.button>`,带 `disabled` 的用条件式 `whileTap`,并在 `:287` 主保存按钮加 `whileHover`:
   - `:227` 关闭按钮:`whileTap={{ scale: 0.98 }}`
   - `:273` 刷新按钮:`whileTap={agentConfigsLoading || isSaving ? {} : { scale: 0.98 }}`
   - `:287` 保存按钮:`whileHover={isSaving || agentConfigsLoading ? {} : { scale: 1.02 }} whileTap={isSaving || agentConfigsLoading ? {} : { scale: 0.98 }}`
   确认 `DebaterSettingsModal.tsx:7` 已导入 `motion`(已有)。

## Boundaries

- 只把指定 `<button>` 换成 `<motion.button>` 并加 `whileTap`/`whileHover`;不改其 `style`、`onClick`、`disabled`、`title`、`className`、子节点。
- 不改 `collapseButtonStyle`、`quietButtonStyle`、`HEADER_TOOLBAR_*_STYLE` 等样式对象本身。
- 不新增依赖。
- 不给高频(每日 100+ 次)动作加动画——本计划所列均为偶尔/中频按钮,符合标准动画档。
- 若代码与摘录不符,停止并报告。

## Verification

- **Mechanical**:
  - `cd frontend && npx tsc -p tsconfig.app.json --noEmit` 通过。
  - `cd frontend && npx vitest run` 通过(尤其 `DebaterSettingsModal.test.tsx`,它 mock 了 framer-motion,确认 `motion.button` 渲染正常)。
- **Feel check**(运行 `npm run dev`):
  - 辩手发言卡片"折叠/展开正文"按钮:按下有轻微缩小,松开回弹。
  - 主页"开始辩论"主按钮(辩题非空时):悬停轻微放大、按下轻微缩小;禁用态(辩题为空)无缩放。
  - 主页"管理"按钮、辩手设置弹窗的关闭/刷新/保存按钮:按下均有轻微缩小反馈;保存按钮悬停轻微放大。
  - DevTools 10% 回放确认缩放幅度约 2%、回弹为减速曲线(framer 默认)。
  - 勾选 `prefers-reduced-motion`(005 落地后):缩放被去掉,按钮仍有颜色/透明度反馈(来自既有 CSS `transition`)。
- **Done when**:上述按钮均有 `whileTap` 缩放反馈,禁用态不触发,类型与测试通过。
