# 运行时与回放

本文档说明仓库根目录 `runtime/` 的用途，以及它如何支撑会话持久化、恢复与回放。

## 1. 运行时目录是什么

`runtime/` 保存的是**本地运行过程中生成的内容**，而不是仓库源码的一部分。

它承担几类职责：

- 本地运行配置
- SQLite 数据库与日志
- 会话快照
- 实时事件流
- 按轮次固化结果
- 会话资料池文档与结构化条目

## 2. 目录结构

```text
runtime/
├─ backend/
│  ├─ .env
│  └─ config.yaml
├─ data/
│  └─ log_config.json
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
      └─ reference_entries/
         └─ <document_id>.json
```

## 3. 关键文件职责

### `runtime/backend/.env`

后端运行时环境变量副本。启动脚本会优先在这里准备本地运行配置。

### `runtime/backend/config.yaml`

运行时使用的配置文件副本。

### `runtime/elenchus.db`

本地 SQLite 数据库，用于保存后端所需的持久化数据。

### `runtime/logs/`

运行日志输出目录。

### `runtime/sessions/<session_id>/session.json`

会话快照。它通常承载：

- 会话基础信息
- 当前模式配置
- 共享知识
- 模式产物摘要
- 运行中的主要状态

当你重新打开历史会话时，前端和后端会依赖它恢复主要状态。

### `runtime/sessions/<session_id>/events.jsonl`

按时间追加的事件流，用于记录运行过程中的系统事件、发言事件和模式产物事件。

它是回放功能的核心输入之一：

- 时间线显示依赖它
- 运行图可根据事件重建活跃节点
- 历史恢复时可重放关键运行轨迹

### `runtime/sessions/<session_id>/rounds/`

按轮次固化的结果文件。适合保存某一轮结束时的聚合结果，便于后续查看与调试。

### `runtime/sessions/<session_id>/documents/`

保存该会话的参考文档记录，包括：

- 用户上传的文档
- 模式自动注入的内置文档

### `runtime/sessions/<session_id>/reference_entries/`

保存从参考文档中提取出的结构化资料条目，供会话资料池、上下文构造和回放展示使用。

## 4. 运行时与回放的关系

Elenchus 的回放不是只靠最终结果页面重绘，而是依赖两类持久化数据配合完成：

- `session.json`：提供较完整的会话状态快照
- `events.jsonl`：提供按顺序记录的运行事件

可以把它理解成：

- `session.json` 负责“当前整体状态是什么”
- `events.jsonl` 负责“这个状态是怎么一步步形成的”

因此，运行时目录既服务于**恢复**，也服务于**回放**。

## 5. 运行时生成内容与仓库内容的边界

应当把两类内容明确区分：

### 仓库内容

- 源代码
- 提示词
- 文档
- 启动脚本
- 内置静态资料源文件

### 运行时生成内容

- 本地 `.env` 副本
- 数据库文件
- 日志
- 会话快照
- 事件流
- 文档处理结果

这条边界很重要，因为：

- 调试时不要把运行时产物误当成源码的一部分
- 回放和恢复问题通常先看 `runtime/`
- 文档或功能设计变更不应该直接以修改运行时产物代替源码变更

## 6. 与其他文档的分工

- [architecture.md](./architecture.md)：解释系统分层、核心模块和模式化架构
- [getting-started.md](./getting-started.md)：解释如何启动项目
- [session-reference-library-implementation.md](./session-reference-library-implementation.md)：解释资料池具体实现
