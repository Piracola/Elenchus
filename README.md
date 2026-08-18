<div align="center">
  <img src="./Elenchus.png" alt="Elenchus 项目图标" width="132" height="132" />

<h1>Elenchus</h1>

<p>一个面向思辨训练的 AI 多智能体辩论平台。</p>

<p>输入辩题后，系统会组织正方、反方、裁判、观察员等多个 AI 角色展开辩论，并实时展示、保存、恢复和导出整场过程。</p>

<p>
    <a href="https://github.com/Piracola/Elenchus/actions/workflows/ci.yml"><img src="https://github.com/Piracola/Elenchus/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
    <a href="https://github.com/Piracola/Elenchus/actions/workflows/build-portable-release.yml"><img src="https://github.com/Piracola/Elenchus/actions/workflows/build-portable-release.yml/badge.svg" alt="Build Portable Release" /></a>
    <a href="https://github.com/Piracola/Elenchus/releases"><img src="https://img.shields.io/github/v/release/Piracola/Elenchus?display_name=tag&label=release" alt="Release" /></a>
    <img src="https://img.shields.io/badge/platform-Windows-0078D4" alt="Windows" />
    <img src="https://img.shields.io/badge/frontend-React%20%2B%20Vite-646CFF" alt="React Vite" />
    <img src="https://img.shields.io/badge/backend-FastAPI-009688" alt="FastAPI" />
  </p>
</div>

本项目大部分由 AI 实现，感谢 [Linux Do](https://linux.do/) 和各家模型厂商的支持 ❤️。

本项目的核心原理是：高质量的输入会让模型产生高质量的输入结果。

## 核心特性

- 标准辩论：正反方交锋，裁判评分，必要时可以调用搜索。
- 诡辩实验模式：让辩手故意使用诡辩/修辞操控，然后由观察员分析用了哪些谬误。
- 实时输出：前端通过 WebSocket 接收 AI 发言、状态和运行事件。
- 历史恢复：保存会话快照和运行事件，之后可以恢复历史过程。
- 参考资料：用户可以上传文本资料，系统会作为当前辩论的公共背景知识。

## 快速启动

双击exe文件即可启动。

前端启动后请在左下角配置自定义模型提供商。

构建流程会在前端构建阶段自动从根目录的 `Elenchus.png` 生成 favicon、`apple-touch-icon` 和 Windows 发布包使用的 `.ico` 图标文件，GitHub CI 产物也会同步使用这套新图标。

![Elenchus 界面预览](./docs/PixPin_2026-08-18_16-17-23.png)

## 示例辩论记录

`examples/` 目录提供了若干导出的中文辩论记录示例，便于快速了解系统的实际输出效果。

默认地址：

- 前端：`http://127.0.0.1:5173`
- 后端：`http://localhost:8001`

首次使用时，打开 Web UI 后需要先在模型配置中添加可用的 provider。

更完整的启动与联调说明见：[docs/getting-started.md](./docs/getting-started.md)

## 配置说明

自定义供应商、搜索服务配置、端口设置等设置位于 runtime/config.json 中

`server字段为服务运行端口`

`providers字段为自定义API供应商`

`debate字段为默认最大回合数`

`search字段为搜索服务相关配置`

<details>
<summary><b>Provider API Key 加密</b></summary>

`runtime/config.json` 中的 API Key（模型 provider 与搜索 provider）默认加密存储，无需任何配置。

首次运行时系统会自动生成密钥并保存到 `runtime/encryption.key`。**请备份该文件**：
丢失后已保存的 Key 将无法解密，需要重新填写。

如需自行管理密钥（例如多机共用同一份配置），可设置环境变量，它的优先级高于密钥文件：

```bash
# 生成密钥（仅需执行一次，妥善保存）
uv run --project backend --with cryptography python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

# 设置为环境变量
export ELENCHUS_ENCRYPTION_KEY="<上面生成的密钥>"
```

历史的明文配置会被自动兼容读取，并在下次写入时转为加密存储。

</details>

<details>
<summary><b>搜索服务说明</b></summary>

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

**密钥安全：** 搜索 provider 的 API Key 与模型 provider 一样加密存储在
`runtime/config.json`，接口只回传「是否已配置」，不回传密钥本身。

**扩展：** 新增一个 provider 只需在 `backend/app/search/` 增加一个模块并用
`@register_search_provider` 注册，声明 `name`/`label`/`description`/`config_fields`。
配置归一化、加密、REST 契约与设置界面表单都会自动跟随，无需改动其他文件。

</details>

<details>
<summary><b>提示词文件说明</b></summary>

后端提示词文件集中在 `backend/prompts/`，运行时由 prompt_loader.py 和 sophistry_prompt_loader.py 按模式加载。

**标准模式**：

- `debater_system.md`：标准辩手通用基础提示词
- `debater_proposer.md`：标准模式正方补充提示词
- `debater_opposer.md`：标准模式反方补充提示词
- `judge_system.md`：标准模式裁判提示词
- `fact_checker_system.md`：事实核查代理提示词

**诡辩模式**：

- `sophistry/debater_system.md`：诡辩模式辩手通用基础提示词
- `sophistry/debater_proposer.md`：诡辩模式正方补充提示词
- `sophistry/debater_opposer.md`：诡辩模式反方补充提示词
- `sophistry/observer_system.md`：诡辩模式观察员提示词

**补充说明**：

- 标准模式辩手提示词采用"基础提示词 + 角色补充提示词"的组合方式
- 当细分角色没有单独文件时，会回退到对应的通用角色文件
- 诡辩模式也采用相同的"基础 + 角色补充"加载策略

</details>

<details>
<summary><b>视频生成器（附属工具）</b></summary>

`video/` 是主项目的附属工具，把辩论记录渲染成带配音和字幕的 MP4（Remotion + Edge TTS）。

使用流程：

1. 双击 `video/启动视频生成器.bat`（首次会自建 Python 虚拟环境并安装 Edge TTS）。
2. 在辩论页的**导出**菜单中点击「生成视频 → 发送」，本场辩论会被送入生成器并自动打开其网页。
3. 在生成器网页中生成配音，再选择快速渲染或正式渲染。

补充说明：

- 生成器未启动时，导出菜单会提示先运行 bat；后端不会在自身进程内渲染视频。
- 生成器地址可在 `runtime/config.json` 的 `video.base_url` 中修改，默认 `http://127.0.0.1:4317`。
- 诡辩实验模式的观察员报告不会进入视频，仅渲染辩手发言。

</details>

## 文档导航

- [文档首页](./docs/README.md)
- [快速开始](./docs/getting-started.md)
- [系统架构总览](./docs/architecture.md)
- [运行时与历史恢复](./docs/runtime.md)
- [诡辩实验模式说明](./docs/sophistry-experiment-mode-design.md)
- [开发指南](./docs/development.md)
- [Python 依赖迁移计划](./docs/dependency-migration-plan.md)

## 项目结构概览

- `frontend/`：React + Vite 前端，负责创建会话、实时观察、聊天与历史恢复界面。
- `backend/`：FastAPI + LangGraph 后端，负责运行编排、API、会话存储与事件流。
- `video/`：附属视频生成器，把辩论记录渲染成带配音的 MP4（独立 Node 工具链）。
- `docs/`：详细文档入口，包括架构、运行时、模式与开发指南。
- `runtime/`：本地运行时生成内容，包括数据库、日志、会话快照与事件文件。

如果你只是第一次了解这个项目，先读本页；如果你准备开发或排查问题，请从 [docs/README.md](./docs/README.md) 进入详细文档。
