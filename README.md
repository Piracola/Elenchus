# Elenchus

Elenchus 是一个基于 LangGraph + FastAPI + React 的多智能体辩论系统。

它可以让不同 AI 扮演正方、反方、裁判等角色，围绕一个议题进行多轮辩论，并在前端控制台中实时展示发言、裁判评分、执行时间线、运行图和记忆状态。

如果你只关心一件事：

1. 安装 `Python 3.10+` 和 `Node.js 18+`
2. 配好 `backend/.env` 里的 `ELENCHUS_ENCRYPTION_KEY`
3. Windows 运行 `start.bat`
4. macOS / Linux 运行 `./start.sh`
5. 打开 `http://localhost:5173`

下面是给新手的完整版本。

## 这个项目能做什么

- 创建 AI 辩论会话
- 让多个 Agent 自动轮流发言
- 用裁判对每轮发言打分和点评
- 在前端实时查看消息流、Live Graph、Execution Timeline、Memory
- 导出辩论内容为 Markdown 或 JSON

## 运行前你需要准备什么

请先确认你的电脑已经安装：

- `Python 3.10` 或更高版本
- `Node.js 18` 或更高版本
- `npm`

可以用下面的命令检查：

```bash
python --version
node --version
npm --version
```

## 第一次启动前必须做的事

### 1. 准备后端配置文件

如果项目里还没有 `backend/.env`，你可以：

- 直接先运行一次启动脚本，它会自动从 `backend/.env.example` 复制出 `backend/.env`
- 或者手动复制一份

手动复制示例：

```bash
cd backend
cp .env.example .env
```

Windows PowerShell 可以用：

```powershell
Copy-Item .env.example .env
```

### 2. 生成加密密钥

这个项目会把模型提供商的 API Key 加密后存储，所以 `backend/.env` 里的 `ELENCHUS_ENCRYPTION_KEY` 不能为空。

运行下面这条命令生成一串密钥：

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

把输出结果复制到 `backend/.env` 中：

```env
ELENCHUS_ENCRYPTION_KEY=这里替换成你刚生成的整串内容
```

### 3. 哪些配置一定要填，哪些可以先不填

第一次启动时，真正必须处理的通常只有这一项：

- `ELENCHUS_ENCRYPTION_KEY`

下面这些可以先保持默认：

- `DATABASE_URL`
- `HOST`
- `PORT`
- `SEARXNG_BASE_URL`
- `TAVILY_API_KEY`

说明：

- LLM 的 `API Key` 不是写在 `.env` 里，而是启动后在网页界面的“模型配置”里填写
- 搜索默认可用 `DuckDuckGo`，所以不配置 `SearXNG` 和 `Tavily` 也能先跑起来

## 最推荐的启动方式：一键启动

### Windows

最简单的方式：

```powershell
start.bat
```

如果你想直接运行 PowerShell 脚本：

```powershell
.\start.ps1
```

如果 PowerShell 提示脚本执行被禁止，可以这样运行：

```powershell
powershell -ExecutionPolicy Bypass -File .\start.ps1
```

### macOS / Linux

先给脚本执行权限：

```bash
chmod +x ./start.sh
```

然后运行：

```bash
./start.sh
```

## 一键启动脚本会帮你做什么

启动脚本会自动：

- 检查 Python、Node.js、npm、pip 是否存在
- 创建 `backend/venv` Python 虚拟环境
- 安装后端依赖和前端依赖
- 如果 `backend/.env` 不存在，就从示例文件复制一份
- 启动后端服务
- 启动前端开发服务器
- 把前端代理需要的端口写入 `frontend/.env`
- 自动打开浏览器

启动成功后，通常可以访问：

- 前端界面：`http://localhost:5173`
- 后端接口文档：`http://localhost:8001/docs`
- 后端健康检查：`http://localhost:8001/health`

## 启动脚本的常用参数

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

这些参数分别表示：

- 只启动后端
- 只启动前端
- 跳过依赖安装，适合你已经装好依赖后的二次启动

## 启动后第一次怎么用

### 1. 打开前端页面

浏览器访问：

```text
http://localhost:5173
```

### 2. 先配置模型提供商

进入网页后：

1. 打开左侧设置
2. 找到“模型配置”
3. 新增一个提供商配置
4. 填入你的 API Key
5. 选择模型
6. 保存

常见提供商包括：

- OpenAI
- Anthropic
- Gemini
- DeepSeek
- Groq
- Ollama

### 3. 创建一场辩论

配置好模型后：

1. 点击新建辩论
2. 输入辩题
3. 选择参与角色或保持默认
4. 点击开始

## 如果你只想“先把项目跑起来看看”

你可以先完成下面两步：

1. 配好 `ELENCHUS_ENCRYPTION_KEY`
2. 运行启动脚本

这样界面和后端都能起来。

但如果你想让 AI 真的开始辩论，你还需要在网页里配置至少一个可用的模型提供商 API Key。

## 手动启动方式

如果你不想用一键脚本，也可以手动分别启动前后端。

### 启动后端

#### Windows PowerShell

```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
```

然后编辑 `backend/.env`，填好：

```env
ELENCHUS_ENCRYPTION_KEY=你生成的密钥
```

最后启动后端：

```powershell
python -m uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
```

#### macOS / Linux

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

然后编辑 `backend/.env`，填好：

```env
ELENCHUS_ENCRYPTION_KEY=你生成的密钥
```

最后启动后端：

```bash
python -m uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
```

### 启动前端

前端依赖后端端口。默认情况下，后端是 `8001`，所以前端需要知道这个端口。

进入前端目录：

```bash
cd frontend
npm install
```

创建或修改 `frontend/.env`：

```env
VITE_BACKEND_PORT=8001
```

然后启动前端：

```bash
npm run dev
```

打开：

```text
http://localhost:5173
```

## 另一种开发启动方式

如果你已经手动准备好了：

- `backend/venv`
- `backend/.env`
- `frontend/node_modules`
- 根目录 `node_modules`

那么在 Windows 开发环境下，也可以直接在项目根目录运行：

```bash
npm install
npm run dev
```

说明：

- 根目录 `npm run dev` 主要适合 Windows，因为当前根目录脚本默认使用的是 Windows 风格的虚拟环境路径
- macOS / Linux 更推荐继续使用 `./start.sh`，或者按上面的“手动启动方式”分别启动前后端

## 常用命令

### 根目录（Windows 更适合）

```bash
npm run dev
```

同时启动前后端。

### 前端

```bash
cd frontend
npm run dev
npm run build
npm run test:run
```

### 后端

```bash
cd backend
pytest
```

如果你不想让 pytest 生成缓存目录，可以用：

```bash
pytest -p no:cacheprovider
```

## 常见问题

### 1. 打开设置时提示加密密钥相关错误

大概率是 `backend/.env` 里的 `ELENCHUS_ENCRYPTION_KEY` 没填，或者填的是无效值。

重新生成一条：

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

然后替换 `backend/.env` 中的值，再重启后端。

### 2. 前端页面打开了，但无法真正开始辩论

这通常表示：

- 你还没有在网页里配置模型提供商
- 或者 API Key 无效
- 或者选中的模型名不对

先去“模型配置”里新增一个可用配置，再重新创建辩论。

### 3. 前端连不上后端

先检查后端是否真的启动了：

```text
http://localhost:8001/health
```

如果后端不是 `8001` 端口，请确认 `frontend/.env` 里的：

```env
VITE_BACKEND_PORT=你的后端端口
```

### 4. PowerShell 不让执行脚本

用这个命令启动：

```powershell
powershell -ExecutionPolicy Bypass -File .\start.ps1
```

### 5. 搜索一定要配置吗

不一定。

默认搜索使用 `DuckDuckGo`，通常可以直接用。

只有在你想接入自己的搜索服务时，才需要额外配置：

- `SEARXNG_BASE_URL`
- `TAVILY_API_KEY`

## 项目结构概览

```text
Elenchus/
├─ backend/                 后端 FastAPI + LangGraph
├─ frontend/                前端 React + Vite
├─ docs/                    项目文档
├─ start.bat                Windows 一键启动
├─ start.ps1                Windows PowerShell 一键启动
├─ start.sh                 macOS / Linux 一键启动
└─ README.md                你现在正在看的文件
```

## 文档入口

- 总文档：[docs/README.md](./docs/README.md)
- 后端说明：[backend/README.md](./backend/README.md)
- 前端说明：[frontend/README.md](./frontend/README.md)
- UI 设计文档：[docs/UI概念设计/README.md](./docs/UI概念设计/README.md)

## 给第一次接手这个项目的人一句话

最稳的流程就是：

1. 装好 Python 和 Node.js
2. 生成 `ELENCHUS_ENCRYPTION_KEY`
3. 写进 `backend/.env`
4. 运行 `start.bat` 或 `./start.sh`
5. 打开 `http://localhost:5173`
6. 在网页里先配置模型 API Key
7. 再开始第一场辩论
