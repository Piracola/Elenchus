# Elenchus

Elenchus 是一个基于 `LangGraph + FastAPI + React` 的多智能体辩论实验平台。

> **当前版本**: v3.0.1 | 发布日期: 2026-03-19

### v3.0.1 主要更新

**✨ 新增功能**
- **陪审团评议系统**：新增陪审团成员在辩论结束后进行集体讨论并达成共识的机制
- **模型温度配置**：支持在 Agent 配置面板中设置模型温度参数

**🔧 功能改进**
- **运行时架构重构**：拆分上下文构建、运行时事件发射器、模型响应解析与 OpenAI raw transport
- **运行链路优化**：调整前后端运行链路、搜索与 provider 相关逻辑
- **组内讨论优化**：增强 TeamDiscussionPanel 组件和 RoundInsights 回合洞察功能

**🐛 Bug 修复**
- 修复 `safe_invoke` 模块依赖问题
- 修复模型返回 HTML 被误当作辩手输出问题
- 修复运行观察器浮层布局、时间线滚动与可拖拽缩放

当前发布策略已统一为：
- 仅维护 `PyInstaller` 打包链路
- 发布 Windows 便携版 `exe`
- 运行时数据统一写入根目录 `runtime/`

## 快速启动（开发模式）

### 前提
- Python 3.10+
- Node.js 18+

### Windows
```powershell
start.bat
```
或：
```powershell
.\start.ps1
```

### macOS / Linux
```bash
chmod +x ./start.sh
./start.sh
```

默认地址：
- 前端：`http://localhost:5173`
- 后端：`http://localhost:8001`

## 打包发布（Windows EXE）

> 以下步骤给维护者使用，用于产出发行包。

### 1. 构建前端
```powershell
npm --prefix frontend run build
```

### 2. 构建便携版 EXE 发行包
```powershell
python scripts/build_pyinstaller_release.py --version v2.0.1
```

产物默认输出到 `dist/releases/`：
- `elenchus-portable-<version>-windows/`
- `elenchus-portable-<version>-windows.zip`
- `elenchus-portable-<version>-windows.zip.sha256`

## 终端用户如何运行发行版

1. 解压 `elenchus-portable-<version>-windows.zip`
2. 双击 `elenchus.exe`
3. 浏览器访问页面（若未自动打开可手动访问终端提示的地址）

新版启动逻辑支持端口自动回退：
- 默认尝试 `8001`
- 若被占用，会自动尝试后续端口（例如 `8002`），不再直接退出

## 运行时数据目录（统一迁移）

无论开发模式还是打包版，运行时数据都统一在 `runtime/` 下：

- `runtime/backend/.env`：环境变量与本地加密密钥
- `runtime/backend/config.yaml`：运行配置（含搜索提供商选择）
- `runtime/elenchus.db`：数据库（包含 API 供应商配置等持久化数据）
- `runtime/logs/`：日志文件
- `runtime/data/log_config.json`：日志级别持久化配置

这意味着升级版本时，只要保留 `runtime/` 目录即可迁移用户配置与数据。

## GitHub Actions 发布

CI 已切换为 EXE 发布流程：
- [build-portable-release.yml](./.github/workflows/build-portable-release.yml)

触发方式：
- 推送 `v*` tag 自动构建并发布
- `workflow_dispatch` 手动发布（支持填写版本号、标题、发布说明）

## 文档入口

- 后端文档：[backend/README.md](./backend/README.md)
- 前端文档：[frontend/README.md](./frontend/README.md)
- 文档导航：[docs/README.md](./docs/README.md)
