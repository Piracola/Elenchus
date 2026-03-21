# 会话级资料池实现说明

## 1. 本次实现范围

本次提交完成了“会话级资料池”的后端第一阶段与第二阶段能力：

- 支持为单个辩论会话上传参考文档
- 当前支持 `.txt` 与 `.md` 文档
- 文档按 session 维度存储，不做全局共享
- 上传后自动执行预处理
- 预处理结果保存为结构化资料条目
- 高价值条目同步进 `shared_knowledge`
- 辩手、组内讨论、陪审团上下文都可以读取这些资料
- 删除文档时，结构化条目与同步知识会一起清理

本次未完成：

- `reference_claim` 的事实核查
- 前端资料上传面板
- 文档重处理按钮
- PDF / DOCX / OCR 支持

## 2. 为什么采用文件存储而不是数据库表

代码基线已经从数据库主存储切换到了 session 文件存储：

- session 数据由 `backend/app/storage/session_files.py` 管理
- `session_service.py` 读取和写入 `session.json`
- runtime event 也已经走文件化持久化

因此这次实现没有再引入新的数据库表，而是沿用现有架构，新增两类文件存储：

1. 原始文档记录

- 路径：`runtime/sessions/<session_id>/documents/<document_id>.json`

2. 结构化资料条目

- 路径：`runtime/sessions/<session_id>/reference_entries/<document_id>.json`

这样做的好处：

- 与当前 session 文件化架构一致
- 删除 session 时可以自然级联删除
- 不需要额外做数据库迁移
- 本地调试时资料结构更容易直接查看

## 3. 新增能力总览

### 3.1 文档上传与管理

新增接口：

- `POST /api/sessions/{session_id}/documents`
- `GET /api/sessions/{session_id}/documents`
- `GET /api/sessions/{session_id}/documents/{document_id}`
- `DELETE /api/sessions/{session_id}/documents/{document_id}`

行为说明：

- 上传前校验 session 是否存在
- 校验扩展名或 MIME 类型，仅允许 `.txt` / `.md`
- 文件大小上限为 1 MB
- 自动解码文本，优先尝试 `utf-8-sig`、`utf-8`、`gb18030`
- 生成 `raw_text`、`normalized_text` 和 `summary_short`

### 3.2 自动预处理

上传成功后，后端会立即进入预处理链路：

1. 文档状态置为 `processing`
2. 对文档执行结构化压缩
3. 生成结构化资料条目
4. 文档状态更新为 `processed`
5. 将高价值条目同步进 `shared_knowledge`

如果预处理失败：

- 文档状态变为 `failed`
- 写入 `error_message`
- 清空该文档对应的结构化条目

### 3.3 资料库查询

新增接口：

- `GET /api/sessions/{session_id}/reference-library`

返回内容：

- 当前会话下所有文档摘要信息
- 当前会话下所有结构化资料条目

## 4. 预处理 agent 的设计

文件：

- `backend/app/agents/reference_preprocessor.py`

### 4.1 双轨处理策略

预处理采用“双轨”设计：

1. LLM 优先

- 优先尝试调用模型，把文档压缩成结构化 JSON
- 默认优先使用 `fact_checker` 配置，其次回退 `judge`

2. 规则回退

- 如果没有可用模型
- 或模型调用失败
- 或模型输出 JSON 不合法

则自动回退到规则式提炼

这样做的原因：

- 资料上传功能不能因为没配置 provider 就不可用
- 先保证功能稳定，再逐步提高质量

### 4.2 当前输出结构

预处理会生成以下条目类型：

- `reference_summary`
- `reference_term`
- `reference_claim`
- `reference_excerpt`

其中：

- `summary`：文档核心摘要
- `term`：关键术语、体系定义、章节级重点概念
- `claim`：可进一步核查的关键陈述
- `excerpt`：适合保留的原文摘录

### 4.3 当前启发式回退逻辑

规则回退主要基于：

- 段落切分
- 句子切分
- 标题识别
- `术语: 定义` 形式识别
- “是 / 指的是 / 指” 定义句识别
- 包含数字、年份、百分比、研究/报告/data/study 等特征的声明识别

这不是最终效果上限，但足以让系统在无模型条件下产出可用结构。

## 5. 结构化资料条目存储

文件：

- `backend/app/storage/reference_library.py`
- `backend/app/services/reference_library_service.py`

每个条目包含：

- `id`
- `session_id`
- `document_id`
- `entry_type`
- `title`
- `content`
- `payload`
- `importance`
- `source_section`
- `source_order`
- `created_at`
- `updated_at`

其中 `payload` 目前主要承载：

- `source_excerpt`
- `document_name`
- `processor_mode`
- `validation_status`

## 6. 与 `shared_knowledge` 的同步策略

文件：

- `backend/app/models/state.py`
- `backend/app/agents/context_builder.py`
- `backend/app/services/reference_library_service.py`

### 6.1 为什么要同步

当前辩手上下文主通道是 `shared_knowledge`。如果资料池只存着但不进入该通道，辩手实际上用不到这些资料。

所以本次实现选择：

- 预处理结束后，把高价值条目同步进 `shared_knowledge`

### 6.2 当前同步条目类型

当前同步到 `shared_knowledge` 的是：

- `reference_summary`
- `reference_term`
- `reference_claim`

暂时不把 `reference_excerpt` 同步进去，原因是：

- 摘录更容易拉高 token 消耗
- 直接给辩手的优先级不如摘要、术语、声明

### 6.3 删除与覆盖策略

为了避免脏数据：

- 同一文档重新预处理时，会先移除该文档旧的同步知识，再写入新的
- 删除文档时，会清除对应 `document_id` 的所有同步知识

### 6.4 并发安全处理

上传文档时，session 可能仍在继续辩论。如果直接拿旧的 session 快照写回，可能覆盖新的对话状态。

因此在更新 `shared_knowledge` 前，服务会：

- 重新读取最新的 session 文件
- 只替换该文档对应的参考知识条目
- 保留其他运行时状态

这是本次实现中特意补上的保护点。

## 7. 上下文构造变更

文件：

- `backend/app/agents/context_builder.py`

原来 `Shared Knowledge Base` 只会渲染：

- `memo`
- `fact`

现在额外支持：

- `reference_summary`
- `reference_term`
- `reference_claim`
- `reference_validation`

因此当前以下角色都会读到资料池内容：

- 正反辩手
- 组内讨论 agent
- 陪审团讨论 agent

## 8. 新增与修改的核心文件

### 新增文件

- `backend/app/storage/session_documents.py`
- `backend/app/storage/reference_library.py`
- `backend/app/services/document_service.py`
- `backend/app/services/reference_library_service.py`
- `backend/app/agents/reference_preprocessor.py`
- `backend/tests/test_session_documents_api.py`
- `docs/session-reference-library-mvp-plan.md`
- `docs/session-reference-library-implementation.md`

### 修改文件

- `backend/app/api/sessions.py`
- `backend/app/models/schemas.py`
- `backend/app/models/state.py`
- `backend/app/agents/context_builder.py`
- `backend/tests/test_context_builder.py`
- `backend/tests/test_session_service.py`
- `backend/requirements.txt`

## 9. 测试覆盖

本次补充并验证了以下路径：

1. 文档上传

- 正常上传 `.txt`
- 正常上传 `.md`
- 非法文件类型拒绝
- 不存在的 session 拒绝上传

2. 文档读取与删除

- 文档列表接口
- 文档详情接口
- 删除文档后不可再读取

3. 资料库查询

- 上传后可通过 `/reference-library` 读取结构化条目
- `shared_knowledge` 中可看到同步后的资料条目
- 删除文档后资料库和 `shared_knowledge` 一起清空对应内容

4. session 删除联动

- 删除 session 时文档存储一起被删除

5. prompt 注入

- `context_builder` 能正确渲染新资料类型

本次验证命令：

```bash
pytest backend/tests/test_session_documents_api.py backend/tests/test_session_service.py backend/tests/test_context_builder.py -q
```

结果：

- `21 passed`

## 10. 当前局限

当前实现仍有几个明确限制：

1. 事实核查尚未接入

- `reference_claim` 目前只标记为 `unverified`
- 还没有生成 `reference_validation`

2. 预处理仍是“上传即同步执行”

- 文档较大或模型较慢时，请求耗时会增长
- 后续更适合改成后台任务

3. 暂无前端上传面板

- 后端能力已经具备
- 前端还未接上传、状态展示和资料库面板

4. 暂不支持复杂格式

- 目前没有 PDF / DOCX / OCR 管线

## 11. 下一步建议

建议下一步按这个顺序继续推进：

1. 接入 `fact_checker`

- 对 `reference_claim` 做声明级核查
- 产出 `reference_validation`
- 更新 `validation_status`

2. 增加前端资料区

- 上传入口
- 文档状态
- 结构化条目展示

3. 改为异步预处理

- 上传请求先返回
- 后台完成预处理与核查

4. 扩展文档格式

- PDF
- DOCX
- 图片 OCR

## 12. 总结

这次实现已经把“参考文档”从一个静态附件，推进成了可进入辩论上下文的结构化资料通道。

系统现在具备了完整的最小闭环：

- 文档接入
- 自动预处理
- 条目化存储
- 同步到共享知识
- 注入辩论上下文
- 支持查询与清理

这为下一步接入事实核查和前端资料面板打下了稳定基础。
