# 运行时与历史恢复

> 本文档聚焦**当前运行时产物**：`runtime/` 目录结构、关键文件职责，以及历史恢复如何依赖这些产物。
> 系统分层、模式化运行链路与源码入口请见 [architecture.md](./architecture.md)。

## 1. 运行时目录是什么

`runtime/` 保存的是**本地运行过程中生成的内容**，而不是仓库源码结构的一部分。

它承担的职责包括：

- 统一运行时配置
- SQLite 数据库与日志
- 会话快照
- 实时事件流与历史追踪
- 按轮次固化结果
- 会话参考文档

## 2. 目录结构

```text
runtime/
├─ config.json
├─ elenchus.db
├─ logs/
└─ sessions/
   └─ <session_id>/
      ├─ session.json
      ├─ events.jsonl
      ├─ rounds/
      │  └─ round-001.json
      ├─ documents/
      │  └─ <document_id>.json
      └─ reference_entries/          # 仅诡辩内置谬误库等内部资料可能生成
         └─ <document_id>.json
```

## 3. 关键文件职责

### `runtime/config.json`

统一运行时配置文件，负责保存：

- provider 配置与 API key
- 服务端基础配置（host / port / debug / CORS / database_url）
- 搜索配置（provider、自定义 HTTP 接口）
- 辩论默认配置（如 `default_max_turns`、context window）
- 日志级别等非会话配置

`runtime/config.json` 是当前唯一活动配置源。旧的 `runtime/backend/.env`、`runtime/backend/config.yaml`、`runtime/data/log_config.json`、`backend/data/providers.json` 均已废弃，不再参与启动或导入。

### `runtime/elenchus.db`

本地 SQLite 数据库，用于保存仍然由数据库负责的结构化持久化数据。

当前 provider 配置已经迁移到 `runtime/config.json`，不再作为 provider 存储主来源。

### `runtime/logs/`

运行日志输出目录。

### `runtime/sessions/<session_id>/session.json`

会话快照。它通常承载：

- 会话基础信息
- 当前模式配置
- 共享知识
- 模式产物摘要
- 当前主要运行状态

当你重新打开历史会话时，前后端会依赖它恢复主要状态。

### `runtime/sessions/<session_id>/events.jsonl`

按时间追加的事件流，用于记录运行过程中的系统事件、发言事件和模式产物事件。

它是历史恢复与问题排查的核心输入之一：

- 历史会话可用它补充运行轨迹
- 调试时可用它定位状态变化顺序
- 运行状态恢复可参考其中的关键事件

### `runtime/sessions/<session_id>/rounds/`

按轮次固化的结果文件。适合保存某一轮结束时的聚合结果，便于后续查看与调试。

### `runtime/sessions/<session_id>/documents/`

保存该会话的参考文档记录，包括：

- 用户上传的文档。
- 模式自动注入的内置文档。

每个文档记录单独存为一个 JSON 文件。

### `runtime/sessions/<session_id>/reference_entries/`

仅用于诡辩实验模式的内置谬误库标签条目。用户上传参考资料不再生成该目录下的结构化条目。

普通辩论资料只保存到 `documents/`，并作为 `context` 同步进 `session.json` 的 shared knowledge。

## 4. 恢复与事件流的关系

Elenchus 的历史恢复依赖两类持久化数据配合完成：

- `session.json`：提供某个时刻可直接恢复的会话状态快照
- `events.jsonl`：提供按顺序记录的运行事件轨迹，便于恢复与排查

可以把它理解成：

- `session.json` 回答“当前整体状态是什么”
- `events.jsonl` 回答“这个状态是怎么形成的”

因此，恢复主要依赖快照，事件流用于补足过程轨迹。当前前端不再提供独立时间线回放界面。

## 5. 参考文档与会话运行的关系

会话级参考资料在运行时留下的主要产物是：

- `documents/`：原始文档记录与规范化文本。
- `session.json` 中的 `shared_knowledge`：由文档同步出的 `context` 条目。

它们与会话快照、历史恢复之间的关系是：

- 文档属于会话级运行输入的一部分。
- 文档内容会作为共享上下文影响后续辩论。
- 回看问题时，通常需要把 `documents/` 与 `session.json` 一起看。

当前运行时行为以本页和 [architecture.md](./architecture.md) 为准。

## 6. 源码与运行时产物的边界

应当把两类内容明确区分：

### 仓库源码内容

- 源代码
- 提示词
- 文档
- 启动脚本
- 内置静态资料源文件

### 运行时生成内容

- `runtime/config.json`
- 数据库文件
- 日志
- 会话快照
- 事件流
- 参考文档处理结果

这条边界很重要，因为：

- 调试时不要把运行时产物误当成源码的一部分
- 历史恢复问题通常先看 `runtime/`
- 功能设计变更不应该通过直接修改运行时产物来替代源码变更

## 7. 与其他文档的分工

- [architecture.md](./architecture.md)：解释系统分层、前后端职责、模式化运行链路与模块入口
- [getting-started.md](./getting-started.md)：解释如何启动项目
