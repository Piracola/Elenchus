# Python 依赖迁移计划：`pyproject.toml + uv.lock`

> **状态：已完成（2026-07-26 核对）。本文保留为迁移记录，不再是待办事项。**
>
> 迁移由提交 `888621b`、`e04f78f` 落地：`backend/pyproject.toml` 与
> `backend/uv.lock` 已是唯一依赖真相源，CI 全部使用 `uv sync --frozen`，
> 主链路不再存在 `requirements*.txt`。
>
> 本计划第 8 节列出的 `ruff` / `mypy` 当时只装了依赖而没有配置与执行路径；
> 该缺口已在后续补上（见 `backend/pyproject.toml` 的 `[tool.ruff]`、
> `[tool.mypy]` 与 `.github/workflows/ci.yml` 的 backend job）。

## 1. 目标

把后端 Python 依赖管理从手工维护的 `requirements.txt / requirements-dev.txt + venv + pip install -r ...`，迁移为：

- `backend/pyproject.toml` 作为唯一依赖声明入口
- `backend/uv.lock` 作为唯一锁定结果
- `uv sync` 负责安装
- `uv run` 负责运行、测试和构建期 Python 命令

前端继续保留 `npm + package-lock.json`，这次不改动 Node 依赖管理体系。

## 2. 第一性原理下的设计要求

这次迁移不是为了“换个新工具”，而是为了满足下面几个工程约束：

- 同一份源码在不同机器上能拿到同一份 Python 依赖树
- 运行、测试、打包三类依赖要显式分层
- 安装失败必须立刻失败，不能被脚本吞掉
- 本地启动、测试、CI、发布流程要共享同一套依赖真相
- 后续升级依赖时，要变成显式升级，而不是某次安装时被动漂移

## 3. 当前问题

当前仓库的后端依赖管理存在这些问题：

- `backend/requirements.txt` 同时包含精确版本和浮动版本，解析结果不稳定
- `backend/requirements-dev.txt` 只是简单 include 运行依赖，没有更清晰的分组语义
- `start.ps1`、`start.sh`、`build.ps1`、GitHub Actions 都直接写死了 `pip install -r ...`
- `start.sh` 当前会把安装错误吞掉后继续执行，这是错误行为
- 测试和开发依赖没有锁文件，CI 和本地环境有漂移风险
- 构建脚本把运行依赖和 `pyinstaller` 直接混装在一起，不利于隔离

## 4. 迁移后的目标状态

迁移完成后，后端依赖管理采用下面的结构：

- `backend/pyproject.toml`
  - 运行依赖：`project.dependencies`
  - 开发测试依赖：`dependency-groups.dev`
  - 打包构建依赖：`dependency-groups.build`
- `backend/uv.lock`
  - 锁定完整 Python 依赖树
- `backend/.venv`
  - 由 `uv` 自动管理的项目虚拟环境

同时满足下面这些行为约束：

- 本地安装：`uv sync --frozen --group dev`
- 本地启动：`uv run --frozen --no-dev python -m uvicorn app.main:app ...`
- 本地测试：`uv run --frozen --group dev pytest`
- 发布构建：`uv run --frozen --group build python scripts/build_pyinstaller_release.py`
- CI 不再执行 `pip install -r ...`

## 5. 迁移策略

采用“单一真相源迁移”，不长期保留 Python 双轨依赖真相。

具体原则：

- `pyproject.toml + uv.lock` 是唯一权威源
- `requirements.txt` 和 `requirements-dev.txt` 不再作为正式维护入口
- 如果未来确实需要导出 `requirements.txt` 给外部环境使用，只允许从 `uv.lock` 导出生成，不能手工改

## 6. 实施步骤

### 第一步：建立后端项目元数据

新增 `backend/pyproject.toml`，内容包括：

- 项目基础信息
- Python 版本范围
- 运行依赖
- `dev` 组
- `build` 组

### 第二步：生成锁文件

使用固定 Python 版本生成 `backend/uv.lock`。

原则：

- 锁文件要提交进仓库
- 生成锁文件时优先对齐 CI 使用的 Python 主版本
- 尽量避免用过新的实验版本作为锁定基准

### 第三步：改造本地脚本

改这些入口：

- `start.ps1`
- `start.sh`
- `scripts/run-backend-dev.cjs`
- `scripts/run-backend-tests.cjs`
- `build.ps1`

改造目标：

- 不再要求手工创建 `backend/venv`
- 不再调用 `pip install -r ...`
- 全部改为 `uv sync` / `uv run`
- 脚本遇到依赖安装失败立即退出

### 第四步：改造 CI

改这些工作流：

- `.github/workflows/ci.yml`
- `.github/workflows/build-portable-release.yml`

改造目标：

- 安装 `uv`
- 基于 `backend/uv.lock` 缓存
- 使用 `uv sync --frozen`
- 使用 `uv run` 执行 `pytest` 和构建脚本

### 第五步：更新文档

更新这些文档：

- `docs/getting-started.md`
- `docs/development.md`
- `backend/README.md`
- 必要时更新根 `README.md`

更新目标：

- 用户看到的 Python 命令统一改成 `uv`
- 不再让文档继续教用户创建 `venv` 和执行 `pip install -r`
- 清楚说明前端仍然用 `npm`

### 第六步：验证

至少完成这些验证：

- `uv lock --check`
- `uv sync --frozen --group dev`
- `uv run --frozen --group dev pytest backend/tests/test_websocket_api.py`
- `uv run --frozen --group dev pytest backend/tests/test_runtime_bus.py`
- `uv run --frozen --group dev pytest backend/tests/test_session_runtime_api.py`
- `npm --prefix frontend run test:run`
- 如条件允许，执行一次后端 smoke test

## 7. Python 版本策略

建议后端把 Python 约束收敛成一条明确主线：

- `>=3.11,<3.12`

原因：

- 这个仓库是应用，不是给外部复用的 Python 库
- CI 已经长期使用 Python 3.11
- 当前依赖栈里 AI SDK、LangChain、LangGraph、PyInstaller 对更高版本解释器的兼容性风险更高
- 直接固定到 3.11 能减少本地、CI、打包三条链路的行为差异

## 8. 分组策略

### 运行依赖

只放应用运行必需依赖，比如：

- FastAPI / Uvicorn / Pydantic
- SQLAlchemy / aiosqlite
- LangGraph / LangChain / OpenAI / Anthropic / Gemini
- `httpx`
- `ddgs`
- `markdown-it-py`
- `cryptography`

### `dev` 组

放开发、测试、静态检查依赖，比如：

- `pytest`
- `pytest-asyncio`
- `pytest-cov`
- `ruff`
- `mypy`

### `build` 组

只放发布打包依赖，比如：

- `pyinstaller`

## 9. 风险与处理

### 风险 1：旧环境里隐式存在但未声明的依赖

处理：

- 先根据代码 import 和现有可运行环境做核对
- 以“代码真实用到什么”作为声明依据

### 风险 2：Windows / Linux 锁定差异

处理：

- 采用 `uv.lock`
- CI 和本地统一用 `uv sync --frozen`

### 风险 3：脚本迁移不完整

处理：

- 全量搜索 `requirements.txt`、`requirements-dev.txt`、`venv`、`pip install`
- 改完后再次全仓搜索，确保主链路收干净

### 风险 4：用户机器没有 `uv`

处理：

- 启动脚本在环境检查阶段加入 `uv` 检查
- 文档显式要求先安装 `uv`

## 10. 验收标准

以下条件同时满足，才算迁移完成：

- 仓库内新增 `backend/pyproject.toml` 和 `backend/uv.lock`
- 主链路脚本不再依赖 `backend/requirements*.txt`
- CI 不再执行 `pip install -r ...`
- 文档主入口已切到 `uv`
- 关键后端测试可通过
- 当前 websocket 修复相关测试可在新依赖体系下运行

## 11. 不做的事

这次迁移不包括：

- 前端切换到 `pnpm` 或其他 Node 包管理器
- 引入 Docker / Nix / Bazel 作为默认依赖方案
- 新增额外的开发者诊断工具
- 为了兼容旧流程而长期保留 Python 双真相依赖入口
