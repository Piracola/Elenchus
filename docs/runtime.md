# 运行时与回放

> 本文档聚焦**当前运行时产物**：`runtime/` 目录结构、关键文件职责，以及恢复与回放如何依赖这些产物。
> 系统分层、模式化运行链路与源码入口请见 [architecture.md](./architecture.md)。

## 1. 运行时目录是什么

`runtime/` 保存的是**本地运行过程中生成的内容**，而不是仓库源码结构的一部分。

它承担的职责包括：

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
│  ├─ .env.example
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

后端运行时环境变量文件。启动脚本与后端初始化逻辑会优先在这里准备本地运行配置。

### `runtime/backend/config.yaml`

运行时使用的配置文件副本。

### `runtime/data/log_config.json`

运行时日志配置文件。

### `runtime/elenchus.db`

本地 SQLite 数据库，用于保存后端需要的结构化持久化数据。

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

每个文档记录单独存为一个 JSON 文件。

### `runtime/sessions/<session_id>/reference_entries/`

保存从参考文档中提取出的结构化资料条目，供会话资料池、上下文构造和回放展示使用。

每个文档对应一份条目文件。

## 4. 恢复与回放的关系

Elenchus 的历史恢复与回放依赖两类持久化数据配合完成：

- `session.json`：提供某个时刻可直接恢复的会话状态快照
- `events.jsonl`：提供按顺序记录的运行事件轨迹

可以把它理解成：

- `session.json` 回答“当前整体状态是什么”
- `events.jsonl` 回答“这个状态是怎么形成的”

因此：

- **恢复** 更依赖快照
- **回放** 更依赖事件流
- 两者通常需要结合使用，才能完整还原一场会话

## 5. 资料池文件与会话运行的关系

会话级资料池在运行时会留下两类产物：

- `documents/`：原始文档记录与文本处理结果
- `reference_entries/`：结构化资料条目

它们与会话快照、回放之间的关系是：

- 文档与条目属于会话级运行输入的一部分
- 高价值条目可被同步进共享知识，影响后续辩论上下文
- 回看问题时，通常需要把 `documents/`、`reference_entries/` 与 `session.json` 一起看

资料池实现细节请见：[session-reference-library-implementation.md](./session-reference-library-implementation.md)

## 6. 源码与运行时产物的边界

应当把两类内容明确区分：

### 仓库源码内容

- 源代码
- 提示词
- 文档
- 启动脚本
- 内置静态资料源文件

### 运行时生成内容

- 本地 `.env` 副本
- 运行时配置副本
- 数据库文件
- 日志
- 会话快照
- 事件流
- 资料池处理结果

这条边界很重要，因为：

- 调试时不要把运行时产物误当成源码的一部分
- 回放和恢复问题通常先看 `runtime/`
- 功能设计变更不应该通过直接修改运行时产物来替代源码变更

## 7. 与其他文档的分工

- [architecture.md](./architecture.md)：解释系统分层、前后端职责、模式化运行链路与模块入口
- [getting-started.md](./getting-started.md)：解释如何启动项目
- [session-reference-library-implementation.md](./session-reference-library-implementation.md)：解释资料池当前实现
- [../PLATFORM_SIMPLIFICATION_PLAN.md](../PLATFORM_SIMPLIFICATION_PLAN.md)：保留架构收敛背景，不作为当前运行时说明
