# 诡辩实验模式设计文档

> 状态：提案
> 更新时间：2026-03-21
> 目标：为 Elenchus 增加一个与常规辩论解耦的独立模式，用于观察模型如何主动使用诡辩技巧、识别对手诡辩，并以非评分方式向用户呈现“修辞操控轨迹”。

## 1. 模式定位

“诡辩实验模式”不是常规辩论模式上的一个轻量开关，而是一条独立实验链路。

它的核心目的不是求真，也不是给出裁判结论，而是把以下两类能力暴露出来：

- 模型如何策略性地使用误导性修辞、定义漂移、证据裁剪、情绪施压和标签化指控。
- 模型如何在对抗中识别、命名、拆解对手的诡辩动作。

因此，这个模式必须与常规模式在以下方面明确分离：

- 独立的模式标识
- 独立的提示词
- 独立的 runtime graph
- 独立的产物面板
- 独立的视觉风格
- 独立的公共文档池种子材料

## 2. 用户可见行为

### 2.1 入口名称

- 模式名称：`诡辩实验模式`
- 内部稳定值建议：`sophistry_experiment`

### 2.2 主界面提示

用户在主界面切换到该模式后，应立即显示一个明显但不打断操作的模式警示卡片。

建议文案：

> 诡辩实验模式会鼓励模型使用误导性修辞、选择性指控、定义操控与情绪施压。这些输出不代表事实结论、裁判意见或现实建议。本模式不提供裁判评分，也不会调用搜索，请将其视为修辞对抗实验，而不是求真工具。

显示时机：

- 选择模式后立刻显示
- 开始辩论前保持可见
- 进入会话后在消息区顶部保留折叠版提示

### 2.3 消息界面视觉

该模式使用单独的消息区底色，满足用户提出的淡黄色要求。

建议新增 CSS 变量：

```css
:root {
  --mode-sophistry-bg: #fcfaf8;
  --mode-sophistry-card: #fffdf9;
  --mode-sophistry-border: #eadfcd;
  --mode-sophistry-accent: #b88946;
}
```

推荐行为：

- 聊天主区域背景切换为 `var(--mode-sophistry-bg)`
- 该模式的卡片背景略深于主背景，使用 `var(--mode-sophistry-card)`
- 顶部提示条、模式标签、观测面板边框使用 `var(--mode-sophistry-border)`
- 不替换正反方主色，只调整环境色，避免用户失去对阵营的识别

### 2.4 界面裁剪

诡辩实验模式中，以下元素应隐藏或替换：

- 隐藏陪审团配置
- 隐藏裁判评分面板
- 隐藏“多维度量化评分”文案
- 隐藏与当前会话强绑定的搜索配置入口或显示为“本模式禁用”
- 运行图切换为模式专属节点图，而不是复用带 `jury` / `judge` 的标准链路

## 3. 设计原则

### 3.1 明确是实验模式

这个模式应该始终带有实验性质标签，避免用户误把输出当成判断结论。

### 3.2 与标准模式解耦

不要在标准 `debater.py`、标准 `graph.py`、标准 `judge.py` 上叠很多 `if mode == ...`。

推荐做法：

- 共享底层基础设施
- 分叉上层提示词和 graph
- 只在模式选择和引擎装配处汇合

### 3.3 保留“可观察性”，不保留“评分感”

这个模式不该输出“谁赢了几分”，但仍然需要给用户可看、可比较、可回放的结构化产物。

### 3.4 禁止搜索

该模式直接禁用搜索工具和搜索配置，不允许以“伪权威检索”强化诡辩效果。

### 3.5 谬误库内建且固定

每场诡辩实验都应自动加载一份内建的谬误库到公共文档池与 `shared_knowledge`，保证辩手与观测节点有同一套标签体系。

## 4. 范围定义

### 4.1 本期建议纳入

- 双方公开辩论
- 模式警示
- 单独背景色
- 内建谬误库注入公共文档池
- 独立 speaker prompt
- 独立 observer / analyst prompt
- 禁用搜索
- 替代评分的结构化观测产物
- 模式专属运行图和时间线标签

### 4.2 本期建议不做

- 陪审团讨论
- 裁判量化评分
- 组内讨论
- 自动宣布胜负
- 允许用户在该模式下继续开启搜索
- 复用常规模式的 `steelman` / `counterfactual` / `consensus` 流程

## 5. 架构总览

推荐采用“共享底座，分叉模式执行链”的方案。

### 5.1 共享的基础设施

以下部分可以继续复用：

- `session_service`
- `session_repository`
- `runtime_event_service`
- WebSocket / REST 会话控制
- `LangGraphDebateEngine` 的包装层
- `context_builder`
- `shared_knowledge` 持久化
- 参考资料库的文件存储

### 5.2 新增的模式专属模块

建议新增：

- `backend/app/agents/sophistry_graph.py`
- `backend/app/agents/sophistry_debater.py`
- `backend/app/agents/sophistry_observer.py`
- `backend/app/agents/sophistry_prompt_loader.py`
- `backend/prompts/sophistry/debater_system.md`
- `backend/prompts/sophistry/debater_proposer.md`
- `backend/prompts/sophistry/debater_opposer.md`
- `backend/prompts/sophistry/observer_system.md`

可选新增：

- `backend/app/services/builtin_reference_service.py`

### 5.3 推荐运行链路

```text
manage_context
  -> set_speaker
  -> sophistry_speaker
  -> set_speaker (next speaker)
  -> sophistry_observer
  -> advance_turn
  -> manage_context (next turn)
  -> sophistry_postmortem
  -> end
```

说明：

- `tool_executor` 不参与
- `jury_discussion` 不参与
- `judge` 不参与
- `consensus` 不参与
- `observer` 负责生成替代评分的观测产物

## 6. 数据模型建议

### 6.1 Session Schema

建议在 `SessionCreate` 和 `SessionResponse` 中新增：

```python
class DebateMode(str, Enum):
    STANDARD = "standard"
    SOPHISTRY_EXPERIMENT = "sophistry_experiment"
```

```python
class SophistryModeConfig(BaseModel):
    seed_reference_enabled: bool = True
    observer_enabled: bool = True
    artifact_detail_level: Literal["compact", "full"] = "full"
```

```python
debate_mode: DebateMode = DebateMode.STANDARD
mode_config: dict[str, Any] = Field(default_factory=dict)
```

### 6.2 Session Snapshot

建议在 `state_snapshot` 中新增：

- `debate_mode`
- `mode_config`
- `mode_artifacts`
- `current_mode_report`
- `final_mode_report`
- `builtin_reference_docs`

其中：

- `mode_artifacts`：按回合累积的观测产物
- `current_mode_report`：本回合最新观测结果
- `final_mode_report`：整场实验结束后的总观察
- `builtin_reference_docs`：记录已注入的内建资料，避免重复加载

### 6.3 Round Result

建议每个 `round-xxx.json` 增加：

- `mode`
- `mode_report`

在诡辩实验模式中，`mode_report` 替代 `scores_by_role` 的阅读价值。

## 7. 内建谬误库的加载策略

### 7.1 目标

每次开始诡辩实验时，都自动把一份标准化谬误库放入当前会话的公共文档池，并同步到 `shared_knowledge`。

### 7.2 推荐资料来源

当前文档草案建议先存放在：

- `docs/sophistry-fallacy-catalog.md`

真正实现时，建议把运行时加载源放到可打包路径，例如：

- `backend/app/assets/builtin_reference_docs/sophistry-fallacy-catalog.md`

### 7.3 推荐注入方式

不要把它当成普通上传文件再走一次 LLM 预处理，因为：

- 成本高
- 结果不稳定
- 不利于打包版本离线一致性

推荐做法：

1. 启动诡辩实验时调用 `ensure_builtin_reference_document(session_id, mode)`
2. 为该会话创建一个“系统内建文档记录”
3. 使用固定 `document_id`，例如 `builtin-sophistry-fallacy-catalog`
4. 直接写入 `documents/<document_id>.json`
5. 直接生成结构化 `reference_entries/<document_id>.json`
6. 将高价值条目同步到 `shared_knowledge`

### 7.4 资料条目映射建议

为减少额外 plumbing，优先复用现有 reference 类型：

- `reference_summary`
  - 模式总说明
  - 标注原则
  - 边界提示
- `reference_term`
  - 每一个谬误标签
  - 每一个复合套路
- `reference_excerpt`
  - 可选，不建议默认注入，以节省上下文

不建议把谬误库内容写成 `reference_claim`，因为它不是要被核查的事实断言。

### 7.5 shared_knowledge 注入策略

优先同步以下条目到 `shared_knowledge`：

- 模式总说明摘要 1 条
- 标签使用原则 1 条
- 一级高频谬误条目 12-16 条
- 其余长尾条目保留在 reference library 中，按需显示

这样可以避免把几十条长定义直接全部塞进 prompt。

## 8. Prompt 体系建议

### 8.1 Debater System Prompt 的目标

诡辩实验模式下的 debater prompt 应做到以下几点：

- 明确这是修辞对抗实验，不是求真模式
- 鼓励使用巧妙诡辩策略
- 鼓励主动识别并点名对手的诡辩
- 要求点名时必须引用对手具体内容
- 禁止搜索
- 禁止输出 URL、来源列表、伪造证据
- 明确保留平台安全边界

### 8.2 建议的边界约束

即使在诡辩实验模式下，也不应允许：

- 现实中的仇恨表达
- 基于受保护属性的侮辱或去人化
- 真实人物诽谤式编造
- 自残、违法、暴力等危险指令
- 医疗、法律、金融等高风险场景中的误导性操作建议

建议将模式目标限制为：

- 操控论证结构
- 操控定义边界
- 操控证据呈现
- 操控叙事重心
- 操控指控与标签

而不是放任内容本身越界。

### 8.3 指控规则

提示词中应明确要求：

- 指控对手使用谬误时，必须附上对手的短引文
- 没有引文时不得直接下强标签
- 同一段话最多给 1 到 2 个主标签
- 如果只是“可能接近某谬误”，应使用弱判断措辞

### 8.4 Observer Prompt 的目标

新增一个 observer / analyst 节点，用于取代裁判评分。

它的任务不是判输赢，而是生成可读的观测报告，包括：

- 本回合双方使用了哪些谬误或修辞策略
- 哪些指控是有证据支持的
- 哪些指控本身也带有标签滥用
- 哪些关键句子改变了叙事方向
- 下一回合双方最容易攻击的薄弱点

### 8.5 提示词文件建议

建议结构：

```text
backend/prompts/sophistry/
├─ debater_system.md
├─ debater_proposer.md
├─ debater_opposer.md
└─ observer_system.md
```

## 9. 非评分型产物设计

### 9.1 设计目标

替代评分的产物必须满足：

- 用户一眼能看懂
- 不形成“谁分高谁赢”的暗示
- 能回看每回合的操控与反操控动作
- 能成为这个模式的独特价值

### 9.2 每回合产物

建议生成 `SophistryRoundReport`：

```json
{
  "turn": 1,
  "narrative_shift": "本回合争论焦点从事实判断转向定义边界。",
  "tactic_observations": [
    {
      "role": "proposer",
      "label": "false_dilemma",
      "quote": "要么全面放开，要么经济彻底停摆。",
      "explanation": "把多个中间政策选项压缩成二选一。"
    }
  ],
  "accusation_audit": [
    {
      "role": "opposer",
      "claimed_label": "straw_man",
      "supported": true,
      "evidence_quote": "你刚才把局部限制说成全面封禁。"
    }
  ],
  "pressure_points": [
    {
      "target_role": "proposer",
      "content": "其论证依赖于把风险管理简化为绝对控制。"
    }
  ],
  "viewer_notice": "本回合双方都在争夺定义权，事实讨论明显减少。"
}
```

### 9.3 全局产物

建议生成 `SophistryFinalReport`：

- `summary`
- `dominant_patterns`
- `tactic_frequency_by_role`
- `most_contested_labels`
- `unsupported_accusations`
- `quote_board`
- `turning_points`
- `viewer_caution`

### 9.4 UI 呈现建议

把原先的评分区域替换为“诡辩观测”区域，包含以下卡片：

- `本回合焦点漂移`
- `谬误命中`
- `指控审核`
- `脆弱点地图`
- `整场观察`

## 10. Graph 与事件设计

### 10.1 模式专属节点

建议节点名：

- `manage_context`
- `set_speaker`
- `sophistry_speaker`
- `sophistry_observer`
- `advance_turn`
- `sophistry_postmortem`

### 10.2 事件类型

建议新增以下 runtime event：

- `mode_notice`
- `sophistry_observation`
- `sophistry_round_report`
- `sophistry_final_report`

说明：

- `speech_start` / `speech_token` / `speech_end` 可以继续复用
- `judge_score` 不应在该模式下发出
- `jury_discussion` 不应在该模式下发出

### 10.3 Live Graph

诡辩实验模式应使用单独节点图：

```text
上下文整理 -> 切换发言 -> 诡辩发言 -> 观测分析 -> 推进回合 -> 终局复盘
```

不要继续显示：

- 陪审团讨论
- 裁判
- 共识收敛

## 11. 前端交互建议

### 11.1 HomeView

新增模式选择器：

- `标准辩论`
- `诡辩实验模式`

切换到诡辩实验模式时：

- 展示模式警示
- 隐藏陪审团相关输入
- 隐藏 `Steelman` 等常规推理增强开关
- 如果当前 UI 有搜索设置快捷入口，显示为禁用说明

### 11.2 Chat / Session View

建议新增：

- 模式徽标
- 顶部实验提示条
- 模式背景色切换
- 右侧观测面板

建议隐藏：

- 裁判信息块
- 分数网格
- 与裁判相关的时间线过滤项

### 11.3 会话列表

建议为诡辩实验模式会话增加视觉标识：

- 小型模式标签
- 淡黄色边缘提示

## 12. 与当前代码的耦合控制策略

### 12.1 推荐保留复用的层

- `SessionCreate` / `SessionResponse` 基础结构
- `session_service` 持久化
- `runtime_event_emitter` 通用事件包装
- `LangGraphDebateEngine` 外层接口
- `reference_library_service` 文件存储与同步机制

### 12.2 推荐避免复用的层

- 标准 `debater.py`
- 标准 `judge.py`
- 标准 `jury_discussion.py`
- 标准 `graph.py` 中的条件路由
- 标准搜索工具绑定逻辑

### 12.3 推荐实现方式

模式选择只在两处汇合：

1. 创建 session 时写入 `debate_mode`
2. runtime 启动时按 `debate_mode` 选择 graph / prompts / artifacts

除此之外，各模式各自演化。

## 13. 搜索禁用策略

诡辩实验模式中，搜索应在三个层面都禁用：

### 13.1 UI 层

- 不暴露搜索入口
- 显示“本模式禁用搜索”

### 13.2 Prompt 层

- 系统提示中明确写入“不允许调用搜索工具”

### 13.3 Runtime 层

- `sophistry_speaker` 不绑定任何 tool
- 不存在 `tool_executor` 路径

这样可以从根本上避免“提示里说别搜，但模型仍试图调工具”的不一致。

## 14. 测试建议

### 14.1 后端

- `test_create_session_with_sophistry_mode`
- `test_sophistry_graph_has_no_judge_or_jury_path`
- `test_sophistry_mode_disables_tools`
- `test_builtin_fallacy_catalog_is_seeded_once`
- `test_round_report_persists_without_scores`
- `test_final_report_persists_without_winner`

### 14.2 前端

- 模式切换后主界面警示出现
- 模式切换后陪审团 / 搜索配置隐藏
- 消息区背景切换为 `#fcfaf8`
- 裁判面板不渲染
- 观测面板可读取 `sophistry_round_report`

## 15. 分阶段实施建议

### Phase 1：模式骨架

- 增加 `debate_mode`
- 主界面模式切换
- 警示文案
- 模式背景色
- 关闭裁判 / 陪审团 / 搜索

### Phase 2：独立 graph 与 prompt

- 新建 `sophistry_graph.py`
- 新建 `sophistry_debater.py`
- 新建 `observer` 节点
- 输出每回合观测产物

### Phase 3：内建谬误库接入

- 注入公共文档池
- 同步到 `shared_knowledge`
- 前端显示资料来源标签

### Phase 4：终局复盘与可视化

- 整场实验报告
- 模式专属 live graph
- 时间线过滤优化

## 16. 结论

“诡辩实验模式”最重要的不是“让模型更会胡搅蛮缠”，而是把诡辩从隐藏行为变成可观察对象。

为了达到这个目的，最合适的路线不是给当前标准模式打补丁，而是：

- 保留会话、事件、资料池这些底层共用能力
- 在 prompt、graph、产物和 UI 上做独立模式分叉
- 用内建谬误库统一标签语言
- 用观测报告替代评分

这样做的结果是：

- 常规模式继续承担“求真式辩论”
- 诡辩实验模式承担“修辞操控观察”

两者边界清晰，后续都能独立演进。
