# 运行时与历史恢复

> 当前运行真相以 SQLite ledger 为准。`runtime/` 目录仍保存配置、数据库和日志，旧版文件布局不再是正式运行格式。

## 1. 运行时目录

`runtime/` 保存本地运行生成的内容：

- `config.json`：静态配置源，包括 server、provider、搜索、日志和默认运行配置。
- `elenchus.db`：SQLite 账本，是 Session、Run、事件、投影、检查点和文档记录的权威来源。
- `logs/`：运行日志。

### config.json 字段

- `server`：服务运行端口。
- `providers`：自定义 API 供应商。
- `debate`：默认最大回合数。
- `search`：搜索服务相关配置。
- `video`：视频生成器地址（默认 `http://127.0.0.1:4317`）。

### Provider API Key 存储

`runtime/config.json` 中的 API Key（模型 provider 与搜索 provider）以明文存储，无需任何配置。

> 注意：本工具面向本地单机使用，API Key 以明文保存于配置文件中，请勿把
> `runtime/config.json` 分享给他人或上传到不可信的位置。

### 搜索服务

在 **设置** → **搜索引擎** 中选择检索 provider 并填写密钥。内置以下几种：

| Provider     | 说明                           | 需要       |
| ------------ | ---------------------------- | -------- |
| Tavily       | 面向 AI 检索的 API，返回已清理的正文摘要     | API Key  |
| Brave Search | 独立索引的通用网页搜索                  | API Key  |
| Exa          | 语义检索，按含义而非关键词匹配              | API Key  |
| 自定义接口        | 任意 HTTP JSON 搜索服务，自动适配常见字段命名 | Endpoint |
| DDGS         | 内置轻量聚合搜索，随产物分发               | 无        |

回退顺序即上表顺序：当前 provider 不可用时依次下移，最终兜底到无需配置的 DDGS。
未填写必填项的 provider 会保持禁用，不会被选中也不会参与回退。

搜索 provider 的 API Key 明文存储在 `runtime/config.json`，
接口只回传「是否已配置」，不回传密钥本身。

新增搜索 provider 的扩展方式见 [development.md](./development.md)。

旧版按会话分目录的文件布局如果存在，只能作为历史导入或人工排查材料；迁移完成后，新运行不应依赖这些文件作为恢复真相。

可用一次性导入脚本把旧版 `runtime/sessions/<session_id>/session.json`、`events.jsonl`、`documents/*.json` 灌回新版 SQLite：

```bash
cd backend
python scripts/import_legacy_runtime.py
```

常用参数：

- `--runtime-root ../runtime`：指定旧运行目录根路径。
- `--session-id <id>`：只导入某一条旧会话，可重复传入。
- `--force`：即使 SQLite 里已经有同名 session，也强制重新导入。

## 2. SQLite 账本

核心表按职责分开：

- `sessions`：只保存用户定义的辩题、参与者、模型配置、模式配置、文档关联等 Session 级配置。
- `runs`：一次具体执行，包含状态、当前轮次、最新事件序号和最后进度信息。
- `run_events`：按 `run_id + seq` 追加的事实事件，是运行过程的主要事实来源。
- `run_projections`：从 Session、文档和 RunEvent 归并出的可读状态，只是读模型，可以重建。
- `run_checkpoints`：恢复点，保存关键节点的安全状态。
- `run_commands`：stop / resume / intervene 等控制命令记录。
- `session_documents`：会话级参考资料原文、规范化文本和处理状态。

## 3. 恢复关系

恢复只针对 Run，不针对 Session。流程是：

1. API 根据 `run_id` 找到对应 `RunRecord` 和 `SessionRecord`。
2. projector 从 Session 配置、`session_documents` 和 `run_events` 重建 `RunProjection`。
3. 运行恢复优先读取最近安全检查点，并用投影作为可读状态展示。
4. 前端按 `run_id` 补拉 `run_events`，再接 WebSocket live stream。

如果 `run_projections` 被删除，系统应能从 SQLite 事实流重建它；如果 `run_events` 或 checkpoint 丢失，恢复能力才会真正受损。

## 4. 导出关系

JSON / Markdown / HTML 导出继续复用现有导出链路，但数据源来自：

- `SessionRecord`：辩题、模式、参与者和配置。
- `RunProjection`：当前可读结果，如发言、评分、共识和模式报告。
- `RunEvent`：事实事件轨迹。

默认导出 session 的最新 run；前端有明确 `activeRunId` 时会导出该 run。

## 5. 日志边界

运行时记录分三层，不再把所有细节都打印到终端：

- SQLite ledger：保存权威事实，包括 Session、Run、事件、投影、检查点、命令和文档记录。
- `runtime/logs/`：保存应用层排障日志，包括异常堆栈、外部调用失败、恢复修复和重要生命周期。
- 控制台：只显示启动/关闭、少量关键生命周期和 `WARNING` 以上问题。

默认直接舍弃控制台上的高频技术噪音，例如 SQLAlchemy 的逐条 SQL、事务 `BEGIN/ROLLBACK`、HTTP access log、底层 HTTP 客户端调试日志。这些信息体量大、重复多，通常不能解释运行真相；如果要复盘某次辩论，应优先查 SQLite 账本和导出结果。

`server.debug` 只表示应用调试模式，不会打开 SQLAlchemy `echo`。如确实需要逐条 SQL 调试，应在本地临时改代码或用数据库工具查看，不要把它作为默认运行日志。

## 6. 排查顺序

遇到历史恢复、导出或卡死问题时，优先看：

- `/api/runs/{run_id}` 返回的 run summary 和 projection。
- `/api/runs/{run_id}/events?after_seq=0` 返回的可见事件流。
- SQLite 中 `runs / run_events / run_checkpoints / run_projections` 的对应记录。
- `runtime/logs/` 中的异常堆栈。

`runtime/config.json` 只解释静态配置，不解释某次运行为什么走到某个状态。

## 7. 文档边界

- [architecture.md](./architecture.md)：解释系统分层、API、运行链路和模块入口。
- [getting-started.md](./getting-started.md)：解释如何启动项目。
- [development.md](./development.md)：解释开发命令和常见排查。
