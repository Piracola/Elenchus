# Android 本地优先规划

> 状态：规划中。本文用于记录 Android 本地运行方向，不代表当前 APK 已实现。

## 1. 目标

Elenchus 的 Android 版本应优先支持**纯本地运行**，降低个人用户使用门槛。云端部署仍然保留，但作为公开演示、跨设备访问或团队部署的可选形态，而不是移动端的必需依赖。

目标体验：

- 用户安装 APK 后即可打开应用。
- 前端界面在 Android WebView 中运行。
- Python Agent Runtime 在设备本地运行。
- 运行数据写入应用私有目录。
- 用户可选择连接云端服务，但默认不依赖云端。

## 2. 推荐架构

```text
Android APK
├─ Capacitor WebView
│  └─ React/Vite 前端
├─ Android Runtime Bridge
│  └─ Kotlin plugin / Service
├─ Embedded Python Runtime
│  └─ FastAPI / Agent runtime
└─ App-private runtime/
   ├─ config.json
   ├─ elenchus.db
   ├─ logs/
   └─ sessions/
```

核心原则：

- 复用现有 React/Vite 前端，不重写 Android 原生 UI。
- 复用现有 Python 后端与 Agent 编排，不用 Kotlin 重写业务链路。
- 保持 REST / WebSocket API 契约稳定，让 Web、Windows、Android 尽量共享客户端逻辑。
- Android 仅负责本地运行壳、权限、文件路径和生命周期管理。

## 3. 技术选型

### 前端壳

推荐使用 Capacitor：

- 适合复用现有 Web 前端。
- 与 Android Studio / Gradle 集成成熟。
- 后续可通过插件处理文件、分享、通知、下载等移动端能力。

### Python 运行时

优先验证 Chaquopy：

- 通过 Gradle 将 Python 嵌入 Android 应用。
- 支持 Kotlin / Java 与 Python 互调。
- 更适合当前“Android 原生壳 + Python 业务运行时”的方向。

备选方案：

- BeeWare / Briefcase：更偏 Python 应用打包体系，和现有 Capacitor 前端结合不如 Chaquopy 自然。
- Kivy / Buildozer：适合 Python UI 应用，不适合复用当前 React 前端。
- 纯 Kotlin 重写：不推荐，业务逻辑重写成本过高。

## 4. 本地运行模型

Android 本地版应尽量保持和桌面/云端一致的服务模型：

```text
Capacitor WebView
  -> http://127.0.0.1:<local_port>/api
  -> ws://127.0.0.1:<local_port>/api/ws
  -> Embedded FastAPI runtime
```

需要验证的关键点：

- Android WebView 是否稳定访问本地 loopback 地址。
- FastAPI / ASGI runtime 是否能在嵌入式 Python 中长期运行。
- WebSocket 在 WebView 与本地服务之间是否可靠。
- 前后台切换时，本地服务如何暂停、恢复或保持运行。

如果 loopback 服务在 Android 上成本过高，可退而求其次：

```text
Capacitor WebView
  -> Capacitor Plugin bridge
  -> Python runtime function calls
```

但这会破坏现有 REST / WebSocket 契约，只有在本地 HTTP 服务不可行时才考虑。

## 5. 运行时目录

Android 不应写入仓库式 `runtime/`，而应使用应用私有目录：

```text
<app-private-files>/runtime/
├─ config.json
├─ elenchus.db
├─ logs/
└─ sessions/
```

后端需要支持通过环境变量指定运行时目录：

```text
ELENCHUS_RUNTIME_DIR=<app-private-files>/runtime
```

当前 `backend/app/runtime_paths.py` 已支持 `ELENCHUS_RUNTIME_DIR`，这是 Android 本地版的关键基础。

## 6. 依赖验证清单

Android 本地版最大的风险在 Python 依赖打包。必须逐项验证：

- FastAPI / Starlette / Uvicorn 或替代 ASGI server
- Pydantic
- httpx / websockets
- SQLAlchemy / aiosqlite
- cryptography
- LangGraph / LangChain Core
- openai / anthropic / google genai 等 provider SDK
- ddgs / 搜索相关依赖
- 文件上传、文本解码、导出 HTML / Markdown / JSON

验证结论应记录：

- 是否可在 Android 架构下安装。
- 是否包含 native extension。
- 是否需要替代库。
- 包体积影响。
- 首次启动耗时影响。

## 7. MVP Spike 顺序

不要直接承诺完整 APK。先做最小技术验证：

1. 建立 Capacitor Android 壳，加载现有前端的移动适配页面。
2. 集成 Chaquopy，确认 Kotlin 能调用 Python。
3. 在 Python 中启动最小 `/api/health` 服务。
4. WebView 请求 `http://127.0.0.1:<port>/api/health` 成功。
5. 写入应用私有 `runtime/config.json` 与 SQLite 文件。
6. 跑通 provider 配置读取与模型探测。
7. 跑通一轮最小辩论。
8. 接入 WebSocket 实时事件。
9. 验证资料上传、导出和历史回放。

每一步都应有独立验收结果。第 3-5 步如果失败，应暂停继续堆功能。

## 8. 移动端 UI 适配范围

Android 本地运行和移动 UI 适配是两条线，但最终必须合并：

- Home：单列创建辩论，配置项默认折叠。
- Chat：消息单列阅读，裁判/评分下沉到消息后方。
- Sidebar：历史会话改抽屉。
- Runtime Inspector：改 bottom sheet 或全屏详情页。
- DebateControls：底部输入栏适配软键盘和安全区域。
- Export / Upload：适配 Android 文件选择、保存和分享。

移动端 UI 不应新建一套业务页面。应复用现有 React 组件，并通过断点、抽屉和 bottom sheet 重排。

## 9. 云端关系

Android 本地版默认不依赖云端，但需要保留云端模式：

```text
本地模式：连接设备内本地 API
云端模式：连接用户配置的 HTTPS/WSS API
```

建议后续在设置中提供“运行位置”：

- 本机运行
- 连接远程服务器

远程模式适合：

- 公开演示
- 多设备访问同一会话
- 团队部署
- 低性能手机将 AI 编排交给服务器

## 10. 主要风险

- Python 依赖无法完整打进 Android。
- APK 体积显著增加。
- Android 后台限制影响长时间辩论。
- WebSocket 在前后台切换时断线。
- 本地服务端口被占用或被系统回收。
- API key 存储需要使用 Android 安全存储方案增强。
- 文件导出和分享不能照搬桌面浏览器下载逻辑。

## 11. 阶段性结论

推荐路线：

```text
Android = Capacitor UI + Chaquopy Embedded Python Runtime + app-private runtime
```

这条路线最符合“安装后本地可用”的目标，也最大化复用现有代码。它的工程风险高于纯云端客户端，因此必须先做依赖与本地服务 spike，再进入完整产品化。
