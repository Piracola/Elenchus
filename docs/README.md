# Elenchus 文档中心

这份索引只保留当前项目仍需要维护的文档。判断标准很简单：它是否帮助用户启动、使用、理解、开发或排查当前本地辩论应用。

## 使用入口

- [快速开始](./getting-started.md)：启动项目、默认端口、首次配置 provider。
- 后端 API 文档：启动后访问 `http://localhost:8001/docs`。

## 理解系统

- [系统架构总览](./architecture.md)：核心分层、数据流、模式边界和主要代码入口。
- [运行时与历史恢复](./runtime.md)：`runtime/` 目录、会话快照、事件流和恢复关系。
- [诡辩实验模式说明](./sophistry-experiment-mode-design.md)：该模式的定位、用户可见行为和边界。
- [诡辩实验模式谬误库](./sophistry-fallacy-catalog.md)：模式使用的标签体系与概念资料。

## 开发指南

- [开发指南](./development.md)：后端、前端、UI 风格和编码约定。

## 维护规则

- 启动步骤只写在 [快速开始](./getting-started.md)，其他文档只链接它。
- 当前架构只写在 [系统架构总览](./architecture.md)，不要在特性文档里复制源码清单。
- 运行时文件职责只写在 [运行时与历史恢复](./runtime.md)，不要在开发指南里重复展开。
- 已经删除的功能、未来规划、一次性设计草稿不进入主索引。
