# Elenchus

Elenchus 是一个基于 LangGraph + FastAPI + React 的多智能体辩论系统。

## 本地打包 zip 发行包

如果需要在本地手动构建可直接分发给普通用户的轻量发布包，可以按下面步骤执行。

### 前提条件

- 安装 `Python 3.11+`
- 安装 `Node.js 20+`
不需要额外安装 `7z` 或其它压缩工具，打包脚本会直接使用 Python 标准库生成 `.zip`。

### 1. 一键本地打包

```powershell
python scripts/build_local_release.py --version v1.0.2
```

这个脚本会自动串起整条轻量发布流程：

- 安装 `frontend` 依赖
- 构建 `frontend/dist`
- 安装 `backend/requirements.txt`
- 运行 `scripts/smoke_test_release_backend.py`
- 生成 Windows / Unix 的轻量发布包

如果你只想打单个平台，也可以这样执行：

```powershell
python scripts/build_local_release.py --platform windows --version v1.0.2
python scripts/build_local_release.py --platform unix --version v1.0.2
```

常用可选参数：

- `--skip-frontend-install`
- `--skip-frontend-build`
- `--skip-backend-install`
- `--skip-smoke-test`

### 2. 查看产物

打包结果会输出到 `dist/releases/`，包括：

- `elenchus-lightweight-<version>-windows.zip`
- `elenchus-lightweight-<version>-windows.zip.sha256`
- `elenchus-lightweight-<version>-unix.zip`
- `elenchus-lightweight-<version>-unix.zip.sha256`

### 3. 和 GitHub Actions 的关系

GitHub Actions 里的轻量发版工作流现在也会执行同样的关键步骤：

- 调用 `scripts/build_local_release.py`
- 复用同一套前端构建、后端依赖安装、冒烟验证和打包步骤
- 生成 `.zip` 发行包并上传到 Release

这样可以尽量避免“压缩包构建成功，但用户启动时报缺依赖”的问题。

它可以让不同 AI 扮演正方、反方、裁判等角色，围绕一个议题进行多轮辩论，并在前端控制台里实时展示发言、裁判评分、执行时间线、运行图和记忆状态。

如果你是开发者，最快跑起来的方式是：

1. 安装 `Python 3.10+`
2. 安装 `Node.js 18+`
3. Windows 运行 `start.bat`
4. macOS / Linux 运行 `./start.sh`
5. 打开 `http://localhost:5173`
6. 在网页里配置模型提供商 API Key

如果你是普通用户，更简单的发布版方式是：

1. 安装 `Python 3.10+`
2. 使用已经构建好前端的发布包
3. Windows 运行 `launchers/start-release.bat`
4. macOS / Linux 运行 `./launchers/start-release.sh`
5. 打开 `http://localhost:8001`
6. 在网页里配置模型提供商 API Key

说明：

- `ELENCHUS_ENCRYPTION_KEY` 现在会在首次启动后端时自动生成并写入 `backend/.env`
- 你不再需要手工生成 Fernet key
- 开发模式仍然需要 Python 和 Node.js
- 发布模式只需要 Python，前提是维护者已经提前构建好 `frontend/dist`

## 这个项目能做什么

- 创建 AI 辩论会话
- 让多个 Agent 自动轮流发言
- 用裁判对每轮发言打分和点评
- 在前端实时查看消息流、Live Graph、Execution Timeline、Memory
- 导出辩论内容为 Markdown 或 JSON

## 当前运行方式属于哪一类

先说结论：

- 仓库默认入口仍然偏向“开发环境运行方式”
- 但现在已经支持“预构建前端 + FastAPI 托管”的发布模式

开发模式第一次启动仍然需要：

- Python
- pip
- Node.js
- npm

发布模式则只需要：

- Python

但相比之前已经少了一步：

- 不再需要你手工配置 `ELENCHUS_ENCRYPTION_KEY`

## 一键启动

### 普通用户 / 发布模式

前提：维护者已经执行过一次前端构建，目录里存在 `frontend/dist/index.html`。

### Windows

```powershell
launchers\start-release.bat
```

或者：

```powershell
.\launchers\start-release.ps1
```

### macOS / Linux

先给执行权限：

```bash
chmod +x ./launchers/start-release.sh
```

再启动：

```bash
./launchers/start-release.sh
```

默认地址：

- 应用首页：`http://localhost:8001`
- 后端 Swagger：`http://localhost:8001/docs`
- 后端健康检查：`http://localhost:8001/health`

### 开发模式

### Windows

```powershell
start.bat
```

或者：

```powershell
.\start.ps1
```

如果 PowerShell 拦脚本：

```powershell
powershell -ExecutionPolicy Bypass -File .\start.ps1
```

### macOS / Linux

先给执行权限：

```bash
chmod +x ./start.sh
```

再启动：

```bash
./start.sh
```

## 启动脚本会自动做什么

### 发布模式 `launchers/start-release.*`

- 检查 Python
- 检查 `frontend/dist/index.html` 是否存在
- 创建 `backend/venv`
- 安装后端依赖
- 如果 `backend/.env` 不存在，就从 `backend/.env.example` 复制一份
- 首次后端启动时自动生成本地加密密钥
- 启动 FastAPI，并直接托管前端构建产物

### 开发模式 `start.*`

- 检查 Python / pip / Node.js / npm
- 创建 `backend/venv`
- 安装后端依赖
- 安装前端依赖
- 如果 `backend/.env` 不存在，就从 `backend/.env.example` 复制一份
- 首次后端启动时自动生成本地加密密钥
- 启动后端服务
- 启动前端开发服务器
- 自动写入 `frontend/.env` 的后端端口

默认地址：

- 前端：`http://localhost:5173`
- 后端 Swagger：`http://localhost:8001/docs`
- 后端健康检查：`http://localhost:8001/health`

## 启动脚本常用参数

### 发布模式

```powershell
.\launchers\start-release.ps1 -SkipInstall
.\launchers\start-release.ps1 -Port 8010
```

```bash
./launchers/start-release.sh --skip-install
./launchers/start-release.sh --port=8010
```

### Windows PowerShell

```powershell
.\start.ps1 -BackendOnly
.\start.ps1 -FrontendOnly
.\start.ps1 -SkipInstall
```

### macOS / Linux

```bash
./start.sh --backend-only
./start.sh --frontend-only
./start.sh --skip-install
```

## 第一次启动后还要做什么

打开网页后：

1. 进入设置
2. 打开“模型配置”
3. 新增一个模型提供商
4. 填入 API Key
5. 选择模型
6. 保存
7. 再创建第一场辩论

说明：

- LLM 的 API Key 不是写在 `.env` 里
- 它们是在网页界面中配置的
- 后端会把这些 Key 加密后存到本地数据库

## `ELENCHUS_ENCRYPTION_KEY` 现在怎么处理

现在的策略是：

- 保留加密
- 首次启动自动生成本地密钥
- 自动写回 `backend/.env`

这样做的好处是：

- 用户不需要再自己生成 Fernet key
- 本地数据库里的模型 API Key 仍不是明文
- 比之前少一步手工配置

## 手动启动方式

### 后端

Windows PowerShell：

```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
```

macOS / Linux：

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python -m uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
```

### 前端

```bash
cd frontend
npm install
```

写入：

```env
VITE_BACKEND_PORT=8001
```

启动：

```bash
npm run dev
```

## 当前最常见的两个问题

### 1. 为什么还是需要 Python / Node.js / npm

如果你跑的是开发模式，当前仓库默认跑的是：

- FastAPI 后端开发服务
- Vite 前端开发服务

这对开发者很方便，但对普通用户不够友好。

如果你跑的是发布模式：

- 用户侧只需要 Python
- Node.js / npm 只在维护者构建 `frontend/dist` 时需要

### 2. 既然只在本地运行，为什么还保留加密

因为被加密的不是整个数据库，而是模型提供商 API Key。

本地运行时这不是强安全方案，但仍然比明文存储更稳妥一些。现在我们已经把“手工配置密钥”的负担去掉了，所以保留加密的成本小了很多。

## 维护者如何制作普通用户可用的发布包

先在开发机执行一次：

```bash
npm --prefix frontend run build
```

如果你想本地直接产出轻量发布包，可以继续执行：

```bash
python scripts/build_local_release.py --version v1.0.0
```

然后把这些内容一起发给普通用户：

- `backend/`
- `frontend/dist/`
- `launchers/`

这样普通用户运行时就不需要安装 Node.js / npm 了。

## GitHub Actions 轻量发布

仓库现在包含工作流：

- `.github/workflows/build-lightweight-release.yml`

它会做这些事：

- 安装前端依赖
- 构建 `frontend/dist`
- 调用 `scripts/build_local_release.py`
- 生成 Windows 轻量包 `zip`
- 生成 Unix 轻量包 `zip`
- 为每个包生成 `.sha256` 校验文件
- 在 tag 为 `v*` 时自动上传到 GitHub Release
- 在 GitHub Actions 页面手动触发时，也可以直接创建并发布 Release

触发方式：

- 手动触发 `workflow_dispatch`
- 推送 tag，例如 `v1.0.0`

手动触发时可填写：

- `release_version`：发行版本号，例如 `v1.0.0`
- `release_title`：发行版标题，留空时自动生成
- `release_notes`：自定义发行说明，支持 Markdown
- `prerelease`：是否标记为预发布版本

本地手动打包时不再依赖外部 `7z`，只要本机 Python 可用即可生成 `zip` 包。

## 下一步如果要继续降低用户启动门槛，最推荐做什么

优先级建议：

1. 继续做 PyInstaller / Nuitka 打包，把 Python 也一起带上
2. 给 Windows 做安装器或便携版压缩包
3. 再考虑 Tauri 桌面壳，做真正的本地桌面应用

## 文档入口

- 后端文档：[backend/README.md](./backend/README.md)
- 前端文档：[frontend/README.md](./frontend/README.md)
- 总文档索引：[docs/README.md](./docs/README.md)
