# Elenchus 文档导航

## 快速入口

- 项目总览与启动说明：[README.md](../README.md)
- 后端说明：[backend/README.md](../backend/README.md)
- 前端说明：[frontend/README.md](../frontend/README.md)
- 当前平台基线：[PLATFORM_SIMPLIFICATION_PLAN.md](../PLATFORM_SIMPLIFICATION_PLAN.md)
- UI 概念稿：[docs/UI概念设计/README.md](./UI概念设计/README.md)

## 文档分层

- `README.md`
  - 面向项目使用者，说明怎么启动、怎么使用、有哪些常见问题。
- `backend/README.md`
  - 面向后端开发者，说明运行方式、目录结构、核心服务边界。
- `frontend/README.md`
  - 面向前端开发者，说明页面结构、状态流、调试方式。
- `PLATFORM_SIMPLIFICATION_PLAN.md`
  - 当前唯一有效的架构基线文档，用来约束后续开发不要重新发散。
- `docs/archive/`
  - 历史分析、旧方案、排查记录，只保留参考价值，不再作为当前实现规范。

## 建议阅读顺序

1. 第一次接触项目：先看根目录 `README.md`
2. 要改后端：再看 `backend/README.md`
3. 要改前端：再看 `frontend/README.md`
4. 要理解现在为什么这么设计：看 `PLATFORM_SIMPLIFICATION_PLAN.md`
5. 要追溯历史背景：最后再看 `docs/archive/`
