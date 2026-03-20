# 会话级资料池 MVP 规划

## 1. 目标

本规划为每场辩论增加独立资料池，支持用户上传参考文档，由预处理 agent 整理后供辩手参考。

MVP 目标：

- 每场辩论可以绑定 0-N 份参考资料
- 资料在进入辩论前先经过预处理，不直接把原文塞进 prompt
- 事实核查 agent 只负责校验可验证声明，不负责文件解析或格式检查
- 辩手读取的是结构化、压缩后的资料，而不是整篇文档
- 不引入向量库或复杂索引系统

明确不做：

- 全局跨会话共享资料库
- 基于 embedding 的检索系统
- 自动从外部网页抓取并入库
- 复杂权限系统

## 2. 核心判断

当前系统已经具备共享知识通道：

- 辩论状态里的 `shared_knowledge`
- 由 [`backend/app/agents/context_builder.py`](../backend/app/agents/context_builder.py) 负责注入 prompt
- 由 [`backend/app/agents/graph.py`](../backend/app/agents/graph.py) 负责在运行时累积知识

因此本功能不应该继续扩张 `topic` 字段，而应该新增一条与辩题并行的输入通道：

- `topic` 继续表达“要辩什么”
- `reference documents` 表达“围绕这个题目有哪些指定背景材料”

## 3. 总体方案

### 3.1 新增两个层级

1. 会话资料层

- 保存原始上传文件的元数据和提取后的纯文本
- 仅属于当前 session

2. 结构化资料层

- 保存预处理 agent 产出的摘要、术语、关键声明和核查结果
- 由辩手在辩论时消费

### 3.2 新增两个处理角色

1. 预处理 agent

- 解析文档文本
- 压缩为结构化资料
- 识别候选“可验证声明”
- 不参与正式辩论

2. 事实核查 agent

- 仅核查候选声明
- 输出 `verified` / `uncertain` / `disputed`
- 不负责文件接入校验

## 4. 为什么不把文档直接放进 `state_snapshot`

当前 [`backend/app/services/session_service.py`](../backend/app/services/session_service.py) 会在获取 session 时直接返回 `state_snapshot` 中的主要内容。如果把原始文档、长文本摘要或中间处理结果全部塞入 `state_snapshot`，会带来几个问题：

- `GET /sessions/{id}` 响应会快速膨胀
- 前端打开历史会话时会一次性 hydrate 过多数据
- 每次保存辩论状态时都会重复写入大 JSON
- 后续做文档重处理、重核查时很难局部更新

因此 MVP 建议：

- `state_snapshot` 只保留轻量运行态
- 文档与整理结果存到独立表
- 真正进入辩手 prompt 的精简结果再同步到 `shared_knowledge`

## 5. 数据模型规划

### 5.1 新增表：`session_documents`

建议位置：[`backend/app/db/models.py`](../backend/app/db/models.py)

字段建议：

- `id`
- `session_id`
- `filename`
- `mime_type`
- `size_bytes`
- `status`
  - `uploaded`
  - `processing`
  - `processed`
  - `failed`
- `raw_text`
- `normalized_text`
- `summary_short`
- `created_at`
- `updated_at`
- `error_message`

说明：

- `raw_text` 保存提取结果
- `normalized_text` 保存清洗后的文本
- `summary_short` 用于列表和概览展示

### 5.2 新增表：`session_document_entries`

用途：保存结构化资料条目。

字段建议：

- `id`
- `session_id`
- `document_id`
- `entry_type`
  - `reference_summary`
  - `reference_term`
  - `reference_claim`
  - `reference_excerpt`
  - `reference_validation`
- `title`
- `content`
- `payload`
- `importance`
- `source_section`
- `source_order`
- `created_at`
- `updated_at`

说明：

- `payload` 用 JSON 保存额外字段，例如校验状态、查询语句、引用片段
- `importance` 用于后续轻量筛选
- `source_order` 便于按文档顺序回溯

### 5.3 `shared_knowledge` 扩展

建议扩展 [`backend/app/models/state.py`](../backend/app/models/state.py) 中的知识类型，支持以下新条目：

- `reference_summary`
- `reference_claim`
- `reference_term`
- `reference_validation`

但 `shared_knowledge` 中只同步“最值得给辩手看的精简条目”，不复制全部文档处理结果。

## 6. API 规划

### 6.1 新增上传接口

建议新增：

- `POST /api/sessions/{session_id}/documents`

职责：

- 接收文件上传
- 做基础接入校验
- 提取文本
- 创建 `session_documents` 记录
- 触发预处理任务

基础校验只做工程校验：

- 文件类型是否支持
- 文件是否为空
- 文件大小是否超限
- 文本提取是否成功
- 是否疑似乱码

### 6.2 新增资料查询接口

- `GET /api/sessions/{session_id}/documents`
- `GET /api/sessions/{session_id}/documents/{document_id}`
- `GET /api/sessions/{session_id}/reference-library`

其中：

- `documents` 面向上传管理
- `reference-library` 面向辩论消费与前端展示

### 6.3 可选接口

- `POST /api/sessions/{session_id}/documents/{document_id}/reprocess`
- `DELETE /api/sessions/{session_id}/documents/{document_id}`

MVP 可以先只做删除，不做重处理按钮。

## 7. 预处理流水线

### 7.1 处理步骤

1. 文件上传
2. 文本提取
3. 文本清洗
4. 文档压缩与结构化提炼
5. 候选声明抽取
6. 候选声明交给事实核查 agent
7. 产出结构化资料条目
8. 将高价值条目同步到 `shared_knowledge`

### 7.2 预处理 agent 输出格式

预处理 agent 不产出一段自由文本，而产出固定结构：

- 文档总览摘要：1 条
- 核心论点：3-7 条
- 关键术语：0-10 条
- 可验证声明：0-12 条
- 关键摘录：0-8 条

每条都保留来源信息：

- 文档名
- 文档内顺序
- 原文摘录或片段

### 7.3 压缩原则

MVP 采用“结构化压缩”，不采用“全文索引”。

这意味着：

- 不做向量数据库
- 不做复杂检索
- 也不只保留一个总摘要

推荐的保留策略：

- 一份文档保留一个短摘要
- 再保留有限数量的高价值条目
- 每类条目设置数量上限

这样既能控制 token，又不至于丢失关键细节。

## 8. 事实核查 agent 的职责边界

事实核查 agent 可以复用现有 `fact_checker` 角色配置，但职责应明确限制为“声明级校验”。

适合它做的：

- 判断一条声明是否是可客观验证的陈述
- 生成针对性的查询
- 输出核查结果和置信说明
- 标记为 `verified` / `uncertain` / `disputed`

不适合它做的：

- 文件格式校验
- OCR 失败处理
- 文档去重
- 全文摘要
- 观点优劣判断

建议核查结果写入 `session_document_entries`，类型为 `reference_validation`，并把结论摘要同步到 `shared_knowledge`。

## 9. 辩论时如何使用资料池

### 9.1 Prompt 注入策略

修改 [`backend/app/agents/context_builder.py`](../backend/app/agents/context_builder.py)：

- 保留现有 `memo` / `fact` 注入逻辑
- 新增 `reference materials` section

建议注入顺序：

1. `Debate Topic`
2. `Progress`
3. `Reference Materials`
4. `Shared Knowledge Base`
5. `Recent Exact Dialogue`

### 9.2 注入内容上限

每轮给辩手注入的资料应限制为：

- 总览摘要：最多 3 条
- 关键术语：最多 6 条
- 核查后的关键声明：最多 8 条

筛选规则先用简单排序即可：

- 先按 `importance`
- 再按 `verified` 优先
- 再按文档顺序

这属于轻量筛选，不属于复杂索引。

## 10. 前端规划

### 10.1 创建会话阶段

当前创建入口在：

- [`frontend/src/components/chat/DebateControls.tsx`](../frontend/src/components/chat/DebateControls.tsx)
- [`frontend/src/hooks/useSessionCreate.ts`](../frontend/src/hooks/useSessionCreate.ts)

MVP 建议交互：

- 先创建 session
- 创建成功后，在当前会话面板中显示“上传参考资料”区域
- 用户可上传资料并看到处理状态
- 资料处理完成后再开始辩论

这样可以避免把“创建会话 + 文件上传 + 异步处理”全部塞进一个提交动作里。

### 10.2 新增面板

建议新增一个轻量面板，例如：

- `ReferenceLibraryPanel`

展示：

- 已上传文档
- 处理状态
- 文档短摘要
- 核查结果计数
- 可用于本场辩论的核心资料条目

### 10.3 不建议的做法

MVP 不建议：

- 只在辩题输入框里做一个大文本域
- 把整篇资料原文显示在主聊天区
- 把资料上传和辩论启动强绑定成一个不可中断步骤

## 11. 后端实现落点

建议新增或修改的主要文件：

- [`backend/app/db/models.py`](../backend/app/db/models.py)
  - 新增资料表
- [`backend/app/models/schemas.py`](../backend/app/models/schemas.py)
  - 新增文档与资料池响应模型
- [`backend/app/api/sessions.py`](../backend/app/api/sessions.py)
  - 或拆出新的 `documents.py` 路由
- `backend/app/services/document_service.py`
  - 管理上传、提取、状态更新
- `backend/app/services/reference_library_service.py`
  - 管理结构化资料条目
- `backend/app/agents/reference_preprocessor.py`
  - 预处理 agent
- [`backend/app/agents/context_builder.py`](../backend/app/agents/context_builder.py)
  - 注入资料池内容
- [`backend/app/models/state.py`](../backend/app/models/state.py)
  - 扩展知识条目类型

## 12. MVP 分阶段实施

### Phase 1：数据接入

- 新增文档表和资料条目表
- 支持上传 `.txt` / `.md`
- 支持文档列表与详情查询

### Phase 2：预处理

- 增加预处理 agent
- 生成摘要、术语、声明、摘录
- 落库为结构化条目

### Phase 3：事实核查

- 将候选声明交给 `fact_checker`
- 生成核查结果并落库

### Phase 4：辩论接入

- 将高价值资料条目同步到 `shared_knowledge`
- 在 prompt 中新增资料 section

### Phase 5：前端可见化

- 上传区
- 处理状态
- 资料池面板

## 13. 建议的第一个实现切口

为了降低一次性改动风险，建议按下面顺序开工：

1. 先支持 `.txt` / `.md` 上传
2. 上传后只做预处理摘要，不做核查
3. 打通资料池展示和 prompt 注入
4. 再追加事实核查链路

原因：

- 文件解析复杂度最低
- 可以先验证“资料池是否真的提升辩论质量”
- 方便后续单独评估核查成本和耗时

## 14. 当前结论

这项功能适合做，而且适合做成会话级、预处理优先、轻量结构化压缩的方案。

MVP 的关键不是“上传文件”本身，而是建立一条稳定链路：

- 文档接入
- 预处理压缩
- 声明级核查
- 精简注入辩论上下文

只要沿着这条链路做，后面无论要不要加更复杂的检索机制，都会有清晰演进路径。
