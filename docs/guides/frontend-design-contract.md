# 前端组件契约

本文档是 Elenchus 前端视觉与组件实现的统一契约。后续新增、重构、修复前端 UI 时，应优先遵守本文档；历史概念稿和旧组件样式只能作为参考，不能作为新的实现依据。

目标风格：**冷静专业**。Elenchus 是辩论、分析、配置和运行观察工具，界面应帮助用户快速输入、阅读、比较和追踪过程，而不是展示装饰效果。

## 1. 设计原则

- **克制**：界面以内容和操作为中心，避免大面积装饰、炫光、复杂渐变和不必要动画。
- **清晰**：所有状态必须可识别，包括默认、悬停、聚焦、选中、禁用、加载、错误和成功。
- **可扫描**：列表、消息、设置项和运行事件要让用户一眼分辨层级、角色、状态和下一步操作。
- **一致**：深色和浅色主题使用同一套 token 语义；同类组件不得各自发明颜色、圆角、阴影和动效。
- **高密度但不拥挤**：桌面端优先支持工作台式布局；信息可以紧凑，但文字不能压缩到难读。
- **可维护**：CSS 变量是公共设计 API。新增 UI 优先复用 token 和 `shared` 组件，少写一次性内联样式。

## 2. Design Tokens

Token 定义入口是 `frontend/src/index.css`。新增 token 前必须确认已有 token 无法表达当前语义。

### 2.1 颜色

现有颜色 token 分组如下：

- 背景：`--bg-primary`、`--bg-secondary`、`--bg-tertiary`、`--bg-card`、`--bg-hover`、`--bg-elevated`
- 文本：`--text-primary`、`--text-secondary`、`--text-muted`
- 边框：`--border-subtle`、`--border-accent`
- 强调：`--accent-indigo`、`--accent-cyan`、`--accent-emerald`、`--accent-rose`、`--accent-amber`
- 角色：`--color-proposer`、`--color-opposer`、`--color-judge`、`--color-system`
- 诡辩模式：`--mode-sophistry-bg`、`--mode-sophistry-card`、`--mode-sophistry-border`、`--mode-sophistry-accent`、`--mode-sophistry-soft`、`--mode-sophistry-shadow`

使用规则：

- 页面底色用 `--bg-primary`，普通面板用 `--bg-secondary`，卡片用 `--bg-card`，弱区域用 `--bg-tertiary`。
- 正文用 `--text-primary`，说明文字用 `--text-secondary`，辅助/时间/空状态说明用 `--text-muted`。
- 主要操作和焦点用 `--accent-indigo`，成功用 `--accent-emerald`，危险/删除用 `--accent-rose`，警告用 `--accent-amber`。
- 正方、反方、裁判、系统消息必须优先使用角色 token，不要在业务组件里硬写绿色、红色、橙色、蓝色。
- 禁止直接写 `#333333`、`#CCCCCC`、裸 `rgba(...)` 作为长期样式。临时兼容必须加注释并在迁移清单中记录。

当前需要补齐的 token 候选：

- `--color-green-600`：用于管理员/成功类强提示。
- `--color-amber-600`：用于演示模式/警告类强提示。
- `--color-neutral`：用于中性身份、观众介入、弱状态标签。
- `--accent-indigo-alpha`：用于焦点环或轻量选中背景。

### 2.2 字体与排版

- 字体栈沿用系统无衬线：`SF Pro Display`、`-apple-system`、`BlinkMacSystemFont`、`Segoe UI`、`Roboto`、`Helvetica Neue`、`sans-serif`。
- 正文字号默认 14-16px；表单、标签、辅助信息可用 11-13px。
- 行高：普通 UI 文本 1.4-1.6，长文本和 Markdown 1.65-1.75。
- 标题只用于真实层级，不要把小面板标题做成英雄级大字。
- 禁止负字距；除品牌展示外，不使用过度字距。

建议字号语义：

- 页面标题：24-32px
- 区块标题：18-22px
- 面板标题：15-17px
- 正文/输入：14-16px
- 标签/元信息：11-13px

### 2.3 间距、圆角、阴影

现有间距 token：`--space-1`、`--space-2`、`--space-3`、`--space-4`、`--space-5`、`--space-6`、`--space-8`、`--space-10`。

使用规则：

- 紧凑控件内部间距用 `--space-2` 或 `--space-3`。
- 普通卡片内部间距用 `--space-4` 或 `--space-5`。
- 页面主区域间距用 `--space-6` 到 `--space-10`。
- 组件之间不要使用随手数字，优先落到 4px 网格。

现有圆角 token：`--radius-xs`、`--radius-sm`、`--radius-md`、`--radius-lg`、`--radius-xl`、`--radius-2xl`、`--radius-full`。

使用规则：

- 输入框、按钮、标签默认 `--radius-md`。
- 弹层、卡片、面板默认 `--radius-lg` 或 `--radius-xl`。
- `--radius-2xl` 只用于大面积容器，不作为默认卡片圆角。
- `--radius-full` 只用于 pill、圆形按钮、状态点。

现有阴影 token：`--shadow-xs`、`--shadow-sm`、`--shadow-md`、`--shadow-lg`、`--shadow-xl`、`--shadow-2xl`、`--shadow-inner`。

使用规则：

- 常驻卡片最多用 `--shadow-sm`。
- 浮层、菜单、Modal 可用 `--shadow-lg` 或 `--shadow-xl`。
- `--shadow-2xl` 只用于顶层 Modal。
- 禁止在普通列表项上堆叠重阴影。

### 2.4 层级与动效

建议 z-index 语义：

- 普通内容：0-10
- 固定头部、底部工具条：100-300
- Popover、Dropdown：1000-3000
- Toast：4000
- Modal：5000

动效 token 使用 `--transition-fast`、`--transition-normal`、`--transition-slow`。

- hover/tap：100-180ms
- 展开/折叠：180-260ms
- 页面进入：240-400ms
- 长循环状态提示：1000-1800ms

## 3. 基础组件契约

基础组件应优先沉淀到 `frontend/src/components/shared`。业务组件可以组合基础组件，但不能复制一套视觉规则。

### Button

- 类型：primary、secondary、ghost、danger。
- 必须支持：默认、hover、focus-visible、active、disabled、loading。
- primary 用于页面主动作，一个局部区域内通常只出现一个。
- 图标按钮优先使用 `lucide-react`，图标尺寸 14-20px。
- 不用文字描述图标能表达的常见动作，例如关闭、展开、删除、上传、导出。

### IconButton

- 尺寸建议：32px、36px、40px。
- 必须有 `title` 或可访问标签。
- hover 只做轻微背景变化或 1px 位移，不做大幅缩放。

### Input 与 Textarea

- 默认背景用 `--bg-tertiary` 或 `--bg-card`，边框用 `--border-subtle`。
- focus 使用 `--accent-indigo` 或 `--accent-indigo-alpha`。
- 错误状态使用 `--accent-rose`，警告状态使用 `--accent-amber`。
- Textarea 必须限制最小高度、最大高度或清晰的自适应策略。

### Select 与 Dropdown

- 使用统一浮层样式：`--bg-card`、`--border-subtle`、`--shadow-lg`、`--radius-md`。
- 菜单必须处理视口边界，避免被窗口底部截断。
- 选中项用图标或明确状态色，不只依赖背景色。

### Card 与 Panel

- Card 用于一个可重复的信息单元，例如消息、资料、模型、设置项。
- Panel 用于承载一组工具或一个稳定区域，例如侧栏、运行观察器、设置页。
- 禁止卡片套卡片。需要分组时使用分隔线、标题、背景带或列表项。
- 普通 Card 不使用玻璃拟态和重渐变。

### Modal、Popover、Toast

- Modal 用于阻断式操作，必须有关闭方式和明确主动作。
- Popover 用于轻量上下文操作，关闭区域和键盘行为要明确。
- Toast 文案短，表达结果，不承载复杂说明。
- Toast 状态色必须来自成功、警告、错误、中性 token。

### Badge、Tabs、RadioCard、Toolbar

- Badge 只表达状态、角色或计数，不承载长句。
- Tabs 用于同级视图切换，选中态必须清晰。
- RadioCard 用于少量互斥选项，卡片内容不得超过短标题和一段说明。
- Toolbar 用于密集工具集合，按钮高度和间距必须稳定，避免 hover 导致布局跳动。

## 4. 业务组件契约

### Home

- 首页第一屏直接提供创建辩论能力，不做营销式 landing page。
- 输入区是视觉中心，辅助配置靠近输入区但不喧宾夺主。
- 高级选项默认折叠或弱化，展开动效轻。
- 参考资料上传使用统一按钮、Popover、列表项和状态提示样式。

### Chat

- Chat 是工作台，不是文章页。布局优先保证消息、裁判、时间线、观察器之间的比较效率。
- 消息区保持稳定宽度和稳定间距，新增消息不应导致已有内容大幅跳动。
- 系统事件、观众介入、运行状态与普通辩手消息要有明确视觉区别。
- 聚焦高亮只能轻量提示，不使用大面积强色块。

### MessageRow

- 正方、反方、裁判、系统必须使用角色 token。
- 头像、身份标签、轮次、模型名、折叠按钮组成统一头部，不得每种消息单独设计。
- 辩手内容和裁判内容允许不同权重，但圆角、阴影、边框、间距要同源。
- 折叠态必须保留角色、轮次和摘要提示。
- 长文本使用 `.markdown-body`，不要在消息组件中重新定义一套 Markdown 样式。

### RuntimeInspector 与 Timeline

- 运行观察器强调状态、阶段、事件顺序和可定位性。
- 状态色要克制，优先通过图标、标签、边框和小色点表达。
- 动态更新只能使用轻量脉冲或淡入，禁止整块内容闪烁。
- 详情面板和列表面板的密度要高于普通内容卡。

### Sidebar 与 Settings

- 侧栏是导航和会话管理区域，信息密度可以更高。
- 当前项、hover 项、不可用项必须有统一状态。
- 设置页优先使用表单组件、RadioCard、Tabs 和说明文本，不使用大卡片堆叠。
- 危险操作必须单独分组，并使用明确的危险样式。

### Reference Library

- 资料库强调文件名、大小、来源、状态和操作。
- 上传、移除、错误、处理中、已完成状态必须视觉一致。
- 文件列表项要支持长文件名省略，不允许撑破布局。

### Markdown 内容区

- Markdown 统一使用 `.markdown-body`。
- Markdown 标题在消息内部必须比页面标题小，避免破坏层级。
- 表格需要水平滚动或响应式处理，不能挤压到不可读。
- 代码块、引用、列表、图片样式以 `docs/markdown-rendering-standard.md` 为准，并逐步与本契约 token 对齐。

## 5. 动画契约

允许的动画：

- 页面或主要区域进入：opacity + 轻微 y 位移。
- Popover/Dropdown：opacity + 小幅 scale/y。
- 折叠展开：height/opacity 或 clip/opacity。
- hover/tap：背景变化、1px 位移、0.98-1.02 以内缩放。
- 运行中状态：小点脉冲、旋转加载、轻量透明度变化。

禁止的动画：

- 大幅缩放、弹跳、漂浮、持续位移。
- 装饰性背景动画抢占阅读注意力。
- hover 改变组件尺寸导致布局跳动。
- 同一区域多个循环动画同时运行。
- 未考虑 `prefers-reduced-motion` 的强动效。

Framer Motion 使用规则：

- 组件级动效必须短小、可复用，避免每个业务组件写一套不同曲线。
- 进入动效默认不超过 400ms。
- 重复动画只用于加载、连接中、正在运行等真实状态。

## 6. 布局与响应式

- 桌面端优先工作台布局：侧栏 + 主内容 + 可选检查器/详情面板。
- 主内容区必须设置 `min-width: 0`，避免长文本撑破 flex 布局。
- 固定格式元素要有稳定尺寸，例如工具按钮、头像、状态点、计数器。
- 移动端优先单列阅读，侧栏、检查器、详情面板改为抽屉或上下堆叠。
- 文本必须允许换行或省略，不能溢出按钮、标签、卡片和弹层。
- 不使用卡片套卡片；需要层级时使用分区标题、边框、分隔线或列表密度变化。

## 7. 禁止项

- 新增未定义 CSS 变量。
- 在业务组件中硬写长期颜色、阴影、圆角、渐变。
- 为同一类按钮、输入框、标签、弹层复制多套内联样式。
- 滥用玻璃拟态、强渐变、发光、背景光斑。
- 普通业务卡片使用过大圆角或重阴影。
- 文案、图标、按钮在移动端或窄容器内重叠。
- 用可见说明文字解释基础 UI 操作，例如“点击这个按钮可以关闭”。
- 让动画成为识别状态的唯一方式。

## 8. 迁移规则

- 新增组件必须先遵守本文档，再考虑局部美化。
- 修改旧组件时，优先消除硬编码颜色、重复内联按钮样式、重复弹层样式和未定义 token。
- `frontend/src/components/shared` 是基础组件沉淀入口；业务目录只保留业务组合逻辑。
- `frontend/src/index.css` 是 token 入口，新增 token 需要同时覆盖 light/dark。
- `docs/UI概念设计` 只保留历史概念和灵感，不再作为当前实现标准。
- 大范围 UI 重构建议按顺序推进：token 补齐、shared 组件统一、Home、Chat、Sidebar/Settings、Inspector/Timeline、Markdown 细节。

## 9. AI 执行规则

当 AI 新增或重构非平凡 UI 时，必须先产出简短 UI spec，再进入 React/CSS 实现。UI spec 不需要像设计系统论文，但必须足够让另一个实现 agent 不自行改设计。

### 9.1 双 Agent 分工

推荐流程包含两个角色：

- **UI Design Agent**：负责风格、排版、色彩、信息层级、状态表达、响应式策略和动效边界。输出 UI spec，不写 React 代码。
- **Implementation Agent**：负责 React、Tailwind、shadcn/ui、CSS token、Framer Motion、lucide-react 的落地。只能实现 UI spec，不擅自改变信息层级、颜色语义、组件密度和动效策略。

主 agent 负责最终取舍、整合、验收和与用户沟通。Design Agent 的 UI spec 是实现依据；Implementation Agent 如果发现 spec 与代码结构冲突，必须反馈冲突点，而不是直接改设计。

### 9.2 UI Spec 必填内容

每份 UI spec 至少包含：

- **目标体验**：这一屏或组件要帮助用户完成什么，不写营销口号。
- **信息层级**：主信息、次信息、辅助信息、危险/警告信息分别如何呈现。
- **布局结构**：桌面、窄屏、移动端的布局策略。
- **组件清单**：使用哪些 shared 组件，是否需要新增 shared 组件。
- **Token 选择**：背景、文本、边框、强调色、角色色、圆角、阴影、间距和动效 token。
- **状态清单**：默认、hover、focus-visible、active、disabled、loading、empty、error、success。
- **动画规则**：是否需要动效，使用哪类允许动画，持续时间范围。
- **禁止偏离**：列出本次实现不能做的事，例如不能加大渐变、不能改成卡片套卡片、不能新增硬编码颜色。

### 9.3 Do / Don’t 示例

Button:

- Do：使用 shared Button，变体限定为 primary、secondary、ghost、danger，图标来自 `lucide-react`，状态覆盖完整。
- Don’t：在业务组件里复制一套 `button` 内联样式，写新的渐变、重阴影或不一致圆角。

Card / Panel:

- Do：Card 只承载一个重复信息单元；Panel 承载稳定区域；层级通过标题、分隔线、密度和边框表达。
- Don’t：卡片套卡片、玻璃拟态叠重阴影、每个业务卡片发明不同边框和背景。

MessageRow:

- Do：角色色来自 token，头部结构统一，正文交给 `.markdown-body`，折叠态保留角色、轮次和摘要。
- Don’t：正反方各自写一套气泡风格，裁判消息使用英雄级标题，长文本撑破布局。

Modal / Popover:

- Do：浮层使用统一背景、边框、阴影和圆角，关闭方式明确，主动作清晰。
- Don’t：用大面积发光、复杂渐变或多层嵌套浮层制造视觉重量。

### 9.4 页面级模板

Home:

- 第一屏直接展示创建辩论输入区。
- 主输入区是视觉中心；模式、资料、高级选项靠近但弱化。
- 参考资料区使用统一上传按钮、列表项、状态 badge 和错误提示。
- 移动端保持单列，不把高级配置挤在输入框旁边。

Chat:

- 桌面端使用工作台结构：侧栏 + 消息主区 + 可选检查器/时间线。
- 消息主区稳定宽度，长文本 `min-width: 0`，新增消息不造成大幅跳动。
- 运行状态、系统事件、观众介入和普通辩手消息必须有清晰区别。
- 移动端优先消息阅读，侧栏和检查器改为抽屉或折叠区域。

Settings:

- 使用表单分组、Tabs、RadioCard、Toolbar 和说明文字，不堆叠装饰卡片。
- 危险操作独立分组，危险按钮只用于真实不可逆动作。
- 设置项左侧表达名称和说明，右侧放控件；窄屏改为上下排列。

### 9.5 AI 自查提示词

后续让 AI 写前端时，可以把下面这段放进任务里：

```text
修改 UI 前，请先阅读 docs/guides/frontend-design-contract.md。先输出简短 UI spec，说明布局、信息层级、组件、token、状态、动画和禁止偏离；再按 spec 实现。实现时优先复用 frontend/src/components/shared 和 frontend/src/index.css token，不要硬编码长期颜色、阴影、圆角或重复发明按钮/输入框/弹层样式。完成后按契约检查深浅色、窄屏、hover/focus/disabled/loading/error 状态和文字溢出。
```

## 10. 检查清单

提交前快速检查：

- 是否只使用已定义 token，或明确记录了待补 token。
- 是否覆盖 hover、focus-visible、disabled、loading、error 等必要状态。
- 是否避免卡片套卡片、重阴影、过度渐变和无意义动画。
- 是否在深色和浅色主题下都可读。
- 是否在窄宽度下不溢出、不重叠、不遮挡操作。
- 是否复用了 `shared` 组件或为后续抽离留下清晰边界。
- 是否没有把历史概念稿当成当前 UI 标准。
