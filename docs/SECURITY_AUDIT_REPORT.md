# Elenchus 项目生产环境安全审计报告

**审计日期**: 2026-04-25  
**审计范围**: 全栈代码（FastAPI 后端 + React 前端）+ 配置 + 部署  
**目标**: 评估项目是否可以安全部署在公网提供服务

---

## 执行摘要

**当前状态：不建议直接部署在公网。**

项目在代码层面有多个良好实践（如 provider key 掩码、路径遍历防护、原子文件写入、常量时间密码比较），但存在**数个严重级别的安全缺陷**，必须在公网部署前修复。核心风险集中在：**认证缺失、敏感配置明文存储、调试模式暴露、以及缺乏访问控制**。

---

## Critical（严重）— 必须在部署前修复

### 1. runtime/config.json 明文存储 API 密钥
- **文件**: `runtime/config.json`
- **问题**: DeepSeek、Cola、Tavily 等多个 Provider 的 `api_key` 以明文形式存储在 JSON 配置文件中。Tavily 搜索 API 密钥同样明文存储。
- **风险**: 任何能够读取服务器文件系统的人（包括通过文件包含漏洞、路径遍历、或服务器被攻破后）都可以直接获取这些密钥，造成 LLM API 费用盗刷和数据泄露。
- **修复建议**:
  - 使用 `cryptography` 库（已在 `requirements.txt` 中）对 `api_key` 字段进行 AES-256-GCM 加密，密钥派生自环境变量或硬件安全模块。
  - 加密后的密文存储在 `runtime/config.json` 中，运行时解密后使用。
  - 禁止将明文密钥提交到 Git；当前仓库中的 `runtime/config.json` 必须立即从 Git 历史中移除（使用 `git filter-repo` 或 BFG Repo-Cleaner）。

### 2. 全局认证完全关闭
- **文件**: `runtime/config.json` 第 15 行，`backend/app/config.py` 第 123 行
- **问题**: `"auth": { "enabled": false, ... }`。整个系统的 REST API（除 demo mode 下的 admin 外）**没有任何用户认证机制**。
- **风险**: 任何人都可以无限制地调用 API，包括创建/删除会话、启动/停止辩论、修改搜索配置、修改模型配置、上传文件、导出数据。
- **修复建议**:
  - 启用 `auth.enabled: true`。
  - 为所有变异操作（POST/PUT/DELETE）添加 JWT Bearer Token 认证中间件。
  - 为只读操作（GET）也添加认证，或至少提供可选的只读访问令牌机制。

### 3. 调试模式开启
- **文件**: `runtime/config.json` 第 6 行，`backend/app/main.py` 第 54 行
- **问题**: `"debug": true`。FastAPI 在 debug 模式下会暴露详细的错误堆栈、Python 代码路径、内部变量值。
- **风险**: 攻击者可以通过构造畸形请求获取后端代码结构、文件路径、依赖版本等敏感信息，极大降低后续攻击难度。
- **修复建议**: 生产环境必须设置为 `"debug": false`。

### 4. JWT Secret 使用默认值
- **文件**: `runtime/config.json` 第 16 行，`backend/app/config.py` 第 124 行
- **问题**: `jwt_secret_key` 为 `"change-me-in-production"`。即使 `auth.enabled` 为 false，admin token 的签名仍依赖此密钥。
- **风险**: 如果启用认证，攻击者可以使用默认密钥伪造任意用户的 JWT Token，完全绕过认证。
- **修复建议**:
  - 生产环境使用至少 256 位随机字符串（`secrets.token_hex(32)`）。
  - 从环境变量 `ELENCHUS_JWT_SECRET` 读取，不在配置文件中硬编码。

### 5. Demo 模式管理员密码为空，可被任意设置
- **文件**: `runtime/config.json` 第 84 行，`backend/app/api/admin.py` 第 72-89 行
- **问题**: `admin_password_hash` 为空字符串，且 `/api/admin/set-password` 端点要求当前 admin 权限，但当 `password_hash` 为空时，`validate_admin_credentials` 会拒绝所有登录。然而，如果攻击者利用其他漏洞（如认证缺失）或直接修改配置文件，可以轻易设置密码。
- **风险**: 在 demo 模式下，获取 admin token 后可以绕过 demo guard 的所有限制，执行任意变异操作。
- **修复建议**:
  - Demo 模式启用时，强制要求在启动时通过环境变量或交互式输入设置初始 admin 密码。
  - 使用 bcrypt/Argon2 替代简单的 SHA-256 哈希密码（`backend/app/middleware/admin_auth.py` 第 79-85 行）。

### 6. SearXNG 管理 API 执行系统命令
- **文件**: `backend/app/api/searxng.py`
- **问题**: `/api/searxng/start` 和 `/api/searxng/stop` 调用 `subprocess.run(["docker", "compose", "-f", str(docker_compose_file), ...])`。虽然 `docker_compose_file` 是通过固定路径查找的，但如果项目根目录被污染（如通过文件上传漏洞），可能执行恶意 compose 文件。
- **风险**: 如果配合路径遍历或文件写入漏洞，可能导致远程代码执行（RCE）。
- **修复建议**:
  - 对 `docker_compose_file` 路径进行严格的 allowlist 校验，确保只允许已知的、受信任的 compose 文件路径。
  - 考虑将 SearXNG 管理功能移到独立的管理后台，不与主应用 API 共用。
  - 在生产环境中，建议完全禁用此端点或仅允许本地访问。，

---

## High（高危）— 强烈建议修复

### 7. WebSocket 和 REST 控制端点缺乏认证与授权
- **文件**: `backend/app/api/websocket.py`, `backend/app/api/session_control.py`, `backend/app/api/session_runtime.py`
- **问题**: 任何人知道 12 位 hex 的 `session_id` 就可以：
  - 通过 WebSocket 连接并 `start`/`stop`/`intervene` 辩论
  - 通过 REST `POST /sessions/{id}/start` 启动辩论
  - 通过 REST `POST /sessions/{id}/intervene` 插入干预内容
- **风险**: 会话劫持、辩论内容篡改、拒绝服务（频繁 start/stop）。
- **修复建议**:
  - 在 WebSocket 握手阶段验证 JWT Token（通过 query param 或 subprotocol）。
  - 为每个会话创建时生成一个 `owner_token` 或绑定到用户 ID，后续操作必须携带有效凭据。
  - REST 控制端点添加同样的认证依赖。

### 8. 没有请求体大小限制
- **文件**: `backend/app/main.py`
- **问题**: FastAPI/Uvicorn 默认不限制请求体大小。文件上传限制为 1MB（`document_service.py` 第 17 行），但其他 JSON API（如创建会话、导出、配置更新）没有限制。
- **风险**: 攻击者可以发送超大 JSON 请求导致内存耗尽（DoS）。
- **修复建议**:
  - 在 Uvicorn 启动参数中添加 `--limit-max-body-size 10485760`（10MB）。
  - 或在 FastAPI 层面添加自定义中间件限制请求体大小。

### 9. 速率限制基于进程内存，多实例下失效
- **文件**: `backend/app/middleware/rate_limit.py`
- **问题**: 使用 `_buckets: dict` 存储在进程内存中，没有 Redis 等共享存储。
- **风险**: 在容器化/负载均衡部署时，每个实例独立计数，攻击者可以通过轮询多个实例绕过限制。
- **修复建议**:
  - 使用 Redis + `redis-py` 实现分布式速率限制。
  - 或在反向代理层（Nginx/Cloudflare）统一配置速率限制。

### 10. 搜索/模型/日志配置 API 可被未认证用户修改
- **文件**: `backend/app/api/search.py`, `backend/app/api/models.py`, `backend/app/api/log.py`
- **问题**: 以下端点均没有认证保护：
  - `PUT /api/search/config` — 修改搜索提供商和 API 密钥
  - `POST/PUT/DELETE /api/models` — 增删改 LLM Provider 配置
  - `PUT /api/log/level` — 修改日志级别
- **风险**: 配置投毒、日志静默（攻击者将日志级别设为 CRITICAL 以隐藏攻击痕迹）、API 密钥替换。
- **修复建议**: 为所有配置管理端点添加管理员级别的 JWT 认证中间件。

### 11. Session 数据没有访问控制
- **文件**: `backend/app/api/sessions.py`, `backend/app/api/session_documents.py`
- **问题**: 任何知道 `session_id` 的人都可以 `GET /sessions/{id}` 获取完整会话数据（包括对话历史、评分、配置），以及下载上传的文档内容。
- **风险**: 会话内容泄露、商业机密/敏感辩论主题泄露。
- **修复建议**: 为会话添加 `owner_id` 字段，所有会话相关端点验证当前用户是否为所有者或协作者。

### 12. 缺少 HTTPS/TLS 强制
- **文件**: `runtime/config.json`, `backend/app/main.py`
- **问题**: 配置中没有 HTTPS 相关设置，Uvicorn 以纯 HTTP 运行。
- **风险**: 中间人攻击（MITM）可窃听所有流量，包括 admin token、JWT、上传的文件内容。
- **修复建议**:
  - 生产环境必须在反向代理（Nginx/Caddy/Traefik）后部署，强制 TLS 1.2+。
  - 添加 HSTS 响应头。
  - 在 FastAPI 中添加中间件，将 HTTP 请求重定向到 HTTPS。

---

## Medium（中危）— 建议修复

### 13. CORS 配置方法/头部过于宽松
- **文件**: `backend/app/main.py` 第 59-65 行
- **问题**: `allow_methods=["*"]` 和 `allow_headers=["*"]`。虽然 `allow_origins` 目前仅包含 localhost，但一旦运维人员误修改配置为 `*` 或包含不可信域名，将允许跨域携带凭证执行任意请求。
- **修复建议**: 显式列出允许的方法和头部：
  ```python
  allow_methods=["GET", "POST", "PUT", "DELETE"]
  allow_headers=["Content-Type", "Authorization"]
  ```

### 14. 前端 Markdown 渲染插件风险
- **文件**: `frontend/src/components/chat/messageRow/MarkdownRenderer.tsx`
- **问题**: 当前使用 `react-markdown` + `remark-gfm`，**默认不渲染原始 HTML**（这是安全的）。但如果未来引入 `rehype-raw` 插件来支持 HTML 标签，将直接产生 XSS 漏洞。
- **修复建议**: 如果未来需要渲染 HTML，必须同时引入 `rehype-sanitize` 进行 DOM 净化。建议在代码注释中添加安全警告。

### 15. 导出 Content-Disposition 文件名解析在前端直接使用
- **文件**: `frontend/src/api/client.ts` 第 44-64 行
- **问题**: `getFilename()` 从 `Content-Disposition` 头解析文件名后直接作为 `anchor.download` 使用。如果后端 `build_content_disposition()` 存在漏洞传递了恶意文件名（如包含路径遍历 `../` 或特殊字符），前端没有二次校验。
- **修复建议**: 前端在 `getFilename()` 中增加与后端 `sanitize_filename_base()` 类似的校验逻辑，拒绝包含路径分隔符的文件名。

### 16. 健康检查端点信息暴露
- **文件**: `backend/app/main.py` 第 95-112 行
- **问题**: `/health/search` 返回当前激活的 search provider 名称；`/api/mode` 返回 demo 模式状态和允许模型列表。
- **风险**: 为攻击者提供了系统配置情报。
- **修复建议**: 健康检查端点只返回 `{"status": "ok"}`，详细的诊断信息移至需要认证的内部端点。

### 17. Admin Token 存储于 localStorage
- **文件**: `frontend/src/stores/demoModeStore.ts`（推测）
- **问题**: 管理令牌通过 `localStorage` 持久化。如果前端存在 XSS 漏洞（如 LLM 输出被注入恶意脚本），localStorage 中的令牌会被自动提取并用于执行管理员操作。
- **修复建议**:
  - 将令牌移至 `httpOnly`、`Secure`、`SameSite=Strict` 的 Cookie 中，由后端在登录时设置。
  - 若必须保持前端存储，使用 `sessionStorage` 并配合短 TTL 和刷新机制，降低泄露窗口。

### 18. 前端缺乏内容安全策略 (CSP)
- **文件**: `frontend/index.html`, `frontend/src/App.tsx`
- **问题**: 未配置 `Content-Security-Policy` 响应头。如果 LLM 输出或用户输入被注入恶意脚本，浏览器缺乏指令阻止其执行。
- **修复建议**:
  - 在 Nginx/反向代理层添加 CSP 头：`default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' wss:; img-src 'self' data:;`。
  - 避免使用 `'unsafe-eval'` 的 script 策略。

### 19. 配置热更新缺乏审计日志
- **文件**: `backend/app/api/models.py`, `backend/app/api/search.py`, `backend/app/api/admin.py`
- **问题**: 管理员可通过 API 实时修改模型配置、搜索配置、日志级别和密码，但这些操作没有记录操作者身份、时间戳和变更前后值。一旦配置被恶意篡改，难以追溯。
- **修复建议**: 增加专用的审计日志（audit log）持久化到独立文件，记录所有管理操作的 IP、Token 指纹、请求体和响应状态。

### 20. 会话 ID 可预测性需验证
- **文件**: `backend/app/db/db_utils.py`（推测 `_gen_id()` 实现）
- **问题**: `session_id` 被限制为 12 位小写十六进制字符，共 16^12 ≈ 2.8e14 种组合。但如果生成逻辑使用非加密安全随机数（如 `random.randint` 或时间戳哈希），攻击者可能缩小搜索空间。
- **修复建议**: 确认 `_gen_id()` 使用 `secrets.token_hex(6)` 或更长的 `secrets.token_urlsafe()` 生成。对不存在的 session 返回统一的 404，避免时序攻击区分 "ID 不存在" 和 "存在但无权限"。

---

## Low（低危）— 可选优化

### 17. FastAPI 版本号暴露
- **文件**: `backend/app/main.py` 第 53 行
- **问题**: `version="1.0.0"` 会出现在自动生成的 OpenAPI Schema (`/openapi.json`) 中。
- **修复建议**: 生产环境可以设置为 `"1.0.0"` 或考虑隐藏版本号，这不是严重问题。

### 18. 前端 API Base URL 通过环境变量配置
- **文件**: `frontend/src/api/client.ts` 第 22 行
- **问题**: `import.meta.env.VITE_API_URL` 如果在构建时未正确设置，可能导致前端尝试连接错误的 API 地址。
- **修复建议**: 确保生产构建脚本正确注入 `VITE_API_URL`，并验证其为 HTTPS 协议。

### 19. `provider_service.list_configs_raw()` 返回明文密钥
- **文件**: `backend/app/services/provider/service.py` 第 33-38 行
- **问题**: 虽然该方法标记为 "for internal server-side use"，但如果被错误地暴露到 API，会直接泄漏所有 provider 的明文 API key。
- **修复建议**: 在该方法上添加显式的文档注释和 `@internal` 标记，提醒开发者不要将其返回给客户端。

### 20. 日志中可能包含敏感信息
- **文件**: `backend/app/runtime/bus.py`, `backend/app/llm/invoke.py` 等
- **问题**: 多处 `logger.info/debug` 打印了 session ID、agent configs、模型响应内容等。如果日志级别设为 DEBUG 或 INFO，运行时日志文件可能积累大量对话内容。
- **修复建议**: 生产环境日志级别保持 WARNING；对包含用户输入的日志进行脱敏处理。

### 21. 密码修改不持久化
- **文件**: `backend/app/api/admin.py` 第 72-89 行
- **问题**: `set_admin_password` 端点明确注释 "仅更新内存设置，不会写入配置文件"。服务重启后密码恢复为旧值，可能导致管理员误以为已修改密码，留下安全隐患。
- **修复建议**: 实现将密码哈希安全写回配置文件的功能（写入加密字段），或强制要求通过环境变量/密钥管理服务修改密码。

### 22. 前端构建产物可能包含源码映射
- **文件**: `frontend/vite.config.ts`
- **问题**: Vite 默认在开发模式生成 source map。如果生产构建未显式关闭 (`build.sourcemap: false`)，攻击者可下载 `.js.map` 文件，还原前端源码，辅助发现更多漏洞。
- **修复建议**: 在生产构建配置中明确设置 `build: { sourcemap: false }`，并确保部署脚本删除 `dist/assets/*.map`。

### 23. 缺乏基础安全响应头
- **文件**: `backend/app/main.py`
- **问题**: FastAPI 应用未添加 `X-Content-Type-Options: nosniff`、`X-Frame-Options: DENY`、`Referrer-Policy: strict-origin-when-cross-origin` 等基础安全头。
- **修复建议**: 通过 FastAPI 中间件或反向代理统一添加上述头部。

### 24. 依赖项缺乏自动化漏洞扫描
- **文件**: `backend/requirements.txt`, `frontend/package.json`
- **问题**: 未在仓库中发现 `pip-audit`、`npm audit` 或 Dependabot 配置。第三方库（如 LangChain、FastAPI、React）的已知 CVE 可能未被及时发现。
- **修复建议**:
  - 在 CI/CD 流水线中集成 `pip-audit` 和 `npm audit`。
  - 启用 Dependabot 或 Snyk 自动提交安全更新 PR。
  - 定期审查并锁定依赖版本（`requirements.lock` / `package-lock.json`）。

---

## 安全设计亮点（值得保持）

1. **Provider Key 掩码**: `ModelConfigResponse` 使用 `api_key_configured: bool` 而非返回实际密钥，`provider_config_to_response()` 实现了这一转换。
2. **路径遍历防护**: `session_files.py` 的 `_resolve_frontend_path()` 使用 `Path.resolve().relative_to()` 严格限制文件访问在 `frontend_dist_dir` 范围内。
3. **文件上传限制**: `document_service.py` 限制了文件大小（1MB）、扩展名（`.txt`, `.md`）和 MIME 类型。
4. **原子文件写入**: 多处使用 `temp_path.write_text()` + `temp_path.replace()` 避免写入过程中的数据损坏。
5. **常量时间密码比较**: `admin_auth.py` 使用 `hmac.compare_digest()` 防止时序攻击。
6. **管理员 Token TTL**: Admin token 设置了 24 小时过期时间，并定期清理。
7. **WebSocket 输入验证**: `websocket.py` 对 `session_id` 使用正则 `^[0-9a-f]{12}$` 严格校验格式。
8. **Demo Guard 中间件**: `demo_guard.py` 提供了合理的只读保护，虽然默认关闭但设计合理。

---

## 修复优先级路线图

### Phase 1 — 部署前必须完成（阻塞项）
- [ ] 将 `runtime/config.json` 中的 `api_key` 全部加密存储，从 Git 历史中移除明文密钥。
- [ ] 设置 `auth.enabled: true`，实施 JWT 认证，为所有变异端点添加认证中间件。
- [ ] 设置 `"debug": false`。
- [ ] 生成强随机 JWT Secret，从环境变量读取。
- [ ] 为 WebSocket 和 REST 控制端点添加会话级访问控制。
- [ ] 在反向代理层启用 HTTPS/TLS。
- [ ] 将 admin token 从 localStorage 移至 `httpOnly` Cookie。
- [ ] 关闭前端生产构建的 sourcemap (`build.sourcemap: false`)。

### Phase 2 — 部署后 1 周内完成
- [ ] 使用 Redis 替换内存速率限制器。
- [ ] 限制请求体大小（Uvicorn/FastAPI 层面）。
- [ ] 为配置管理端点（search/models/log）添加管理员认证。
- [ ] 使用 bcrypt/Argon2 替代 SHA-256 存储 admin 密码。
- [ ] 限制 CORS 方法和头部为显式白名单。
- [ ] 为 SearXNG subprocess 调用添加更严格的输入校验。
- [ ] 添加安全响应头（CSP, HSTS, X-Frame-Options, X-Content-Type-Options）。
- [ ] 添加操作审计日志（audit log）。

### Phase 3 — 持续优化
- [ ] 实施会话数据加密（at rest）。
- [ ] 日志脱敏审计。
- [ ] 定期依赖漏洞扫描（`pip-audit`, `npm audit`）。
- [ ] 修复 admin 密码修改持久化问题。

---

## 依赖安全扫描建议

当前 `requirements.txt` 和 `package.json` 中的依赖版本需要定期扫描：

```bash
# Python
pip install pip-audit
pip-audit -r backend/requirements.txt

# Node.js
cd frontend
npm audit
```

**注意**: `fastapi==0.115.6` 和 `uvicorn[standard]==0.34.0` 等依赖需关注官方安全通告，及时升级补丁版本。

---

*报告结束。建议在完成 Phase 1 修复后进行复测。*
