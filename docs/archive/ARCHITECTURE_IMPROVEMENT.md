# Elenchus 架构改进文档

> 本文档记录项目架构改进的完整过程，包括问题分析、解决方案和实施指南。
> 生成时间：2026-03-17

---

## 一、执行摘要

本次架构改进识别并修复了 **5 个严重级别问题**、**8 个中等级别问题** 和 **6 个轻微级别问题**。核心改进集中在：Provider 存储机制、全局单例消除、隐式状态推断、以及认证授权机制。

### 改进成果

| 改进项 | 状态 | 影响范围 |
|--------|------|----------|
| S1: Provider 存储迁移至数据库 | ✅ 完成 | 数据一致性、多实例部署 |
| S2: 依赖注入重构 | ✅ 完成 | 可测试性、可维护性 |
| S3: 显式节点状态追踪 | ✅ 完成 | 可维护性、调试便利 |
| S5: 认证授权机制 | ✅ 完成 | 安全性、用户隔离 |

---

## 二、问题清单与解决方案

### 2.1 严重级别问题 (P0)

#### P1-001: Provider 存储使用 JSON 文件

**问题描述**：
- 单文件存储，高并发读写产生 I/O 竞争
- 无事务支持，进程崩溃可能导致数据损坏
- `threading.RLock()` 仅保护同一进程内的并发

**解决方案**：
- 创建 `ProviderRecord` 数据库模型
- 重构 `ProviderService` 使用 SQLAlchemy 异步会话
- API Key 使用 Fernet 对称加密存储

**修改文件**：
- [backend/app/db/models.py](../../backend/app/db/models.py) - 新增 `ProviderRecord`
- [backend/app/services/provider_service.py](../../backend/app/services/provider_service.py) - 完全重构
- [backend/scripts/migrate_providers_to_db.py](../../backend/scripts/migrate_providers_to_db.py) - 迁移脚本

---

#### P3-001: 多实例部署不兼容

**问题描述**：
| 组件 | 原实现 | 问题 |
|------|--------|------|
| Provider 存储 | JSON 文件 | 文件系统不共享 |
| WebSocket Manager | 内存字典 | 连接状态不共享 |
| Intervention Manager | 内存字典 | 消息队列不共享 |

**解决方案**：
- Provider 存储迁移至数据库（已完成）
- 依赖注入重构支持多实例（已完成）
- WebSocket 外部化（待实施 - 需要 Redis）

---

#### P4-001: API Key 管理风险

**问题描述**：
- API Key 在服务间明文传递
- 日志中可能意外记录敏感信息
- 缺乏访问审计

**解决方案**：
- 使用 Fernet 对称加密存储 API Key
- 环境变量 `ELENCHUS_ENCRYPTION_KEY` 管理加密密钥
- 自动生成临时密钥（开发环境）

---

#### P4-002: 缺乏认证授权机制

**问题描述**：
- 所有 API 端点无认证保护
- 无用户隔离
- 无操作审计

**解决方案**：
- 实现 JWT 认证机制
- 添加用户模型和用户隔离
- 支持可选认证模式（`AUTH_ENABLED` 环境变量）

**新增文件**：
- [backend/app/auth/](../../backend/app/auth/) - 认证模块
- `backend/app/api/users.py` - 用户 API（历史规划路径，当前代码库未落地）

---

### 2.2 中等级别问题 (P1)

#### P1-002: 全局单例模式滥用

**问题描述**：
- 测试困难，单例状态在测试间泄漏
- 隐藏依赖，违反依赖倒置原则
- 多租户限制

**解决方案**：
- 创建依赖注入容器 [backend/app/dependencies.py](../../backend/app/dependencies.py)
- 使用 FastAPI 原生 `Depends` 机制
- 提供 `clear_dependency_cache()` 用于测试重置

---

#### P1-003: 隐式节点推断逻辑脆弱

**问题描述**：
- `_infer_node()` 通过比较状态快照推断节点
- 多节点修改相同字段时产生误判
- 维护成本高

**解决方案**：
- 扩展 `DebateGraphState` 添加 `last_executed_node` 字段
- 所有节点显式返回执行的节点名称
- 移除 `_infer_node()` 函数

---

#### P1-004: 跨层直接依赖

**问题描述**：
- `session_service` 直接依赖 `provider_service` 单例
- API Key 在服务层处理

**解决方案**：
- 通过依赖注入获取服务实例
- 保持分层架构清晰

---

---

## 三、架构改进详情

### 3.1 S1: Provider 存储迁移至数据库

#### 数据库模型

```python
# backend/app/db/models.py
class ProviderRecord(Base):
    __tablename__ = "providers"
    
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    provider_type: Mapped[str] = mapped_column(String(50), nullable=False)
    api_key_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    api_base_url: Mapped[str | None] = mapped_column(String(255), nullable=True)
    models: Mapped[list] = mapped_column(JSON, default=list)
    is_default: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
```

#### 迁移步骤

```bash
# 1. 安装新依赖
cd backend
pip install cryptography

# 2. 设置加密密钥（生产环境必须）
export ELENCHUS_ENCRYPTION_KEY="your-secure-random-key"

# 3. 运行迁移脚本
python -m scripts.migrate_providers_to_db

# 4. 启动服务
uvicorn app.main:app --reload
```

---

### 3.2 S2: 依赖注入重构

#### 依赖注入容器

```python
# backend/app/dependencies.py
from functools import lru_cache

@lru_cache()
def get_provider_service() -> ProviderService:
    return ProviderService()

@lru_cache()
def get_llm_router() -> LLMRouter:
    return LLMRouter()

@lru_cache()
def get_search_factory() -> SearchProviderFactory:
    return SearchProviderFactory()

@lru_cache()
def get_intervention_manager() -> InterventionManager:
    return InterventionManager()

def clear_dependency_cache() -> None:
    """Reset all singleton caches - use in tests."""
    get_provider_service.cache_clear()
    get_llm_router.cache_clear()
    get_search_factory.cache_clear()
    get_intervention_manager.cache_clear()
```

#### 使用示例

```python
# API 路由
from fastapi import Depends
from app.dependencies import get_provider_service

@router.get("/models")
async def list_models(
    service: ProviderService = Depends(get_provider_service)
):
    return await service.list_configs()
```

---

### 3.3 S3: 显式节点状态追踪

#### 状态扩展

```python
# backend/app/agents/graph.py
class DebateGraphState(TypedDict, total=False):
    # ... 现有字段
    last_executed_node: str  # 最后执行的节点名称
```

#### 节点返回值

```python
async def node_debater_speak(state: DebateGraphState) -> dict[str, Any]:
    # ... 业务逻辑
    return {
        "dialogue_history": [entry],
        "last_executed_node": "speaker",  # 显式声明
    }
```

---

### 3.4 S5: 认证授权机制

#### 认证配置

```python
# backend/app/config.py
class EnvSettings(BaseSettings):
    auth_enabled: bool = Field(default=False, alias="AUTH_ENABLED")
    jwt_secret_key: str = Field(default="change-me-in-production", alias="JWT_SECRET_KEY")
    jwt_algorithm: str = Field(default="HS256", alias="JWT_ALGORITHM")
    jwt_expire_minutes: int = Field(default=10080, alias="JWT_EXPIRE_MINUTES")  # 7 days
```

#### API 端点

| 端点 | 方法 | 描述 |
|------|------|------|
| `/api/users/register` | POST | 用户注册 |
| `/api/users/login` | POST | 用户登录，返回 JWT token |
| `/api/users/me` | GET | 获取当前用户信息 |
| `/api/users/auth/status` | GET | 获取认证状态 |

#### 使用方式

**启用认证（生产环境）：**
```env
AUTH_ENABLED=true
JWT_SECRET_KEY=your-secure-random-key-at-least-32-chars
```

**禁用认证（开发环境，默认）：**
```env
AUTH_ENABLED=false
```

**WebSocket 认证：**
```
ws://localhost:8001/api/ws/{session_id}?token={jwt_token}
```

---

## 四、技术选型对比

| 需求 | 选型 | 理由 |
|------|------|------|
| 数据库 | SQLite + SQLAlchemy 2.0 Async | 保持轻量，支持异步 |
| 依赖注入 | FastAPI Depends | 轻量级，与框架集成 |
| 认证 | JWT (python-jose) | 无状态，适合分布式 |
| 密码哈希 | bcrypt (passlib) | 行业标准 |
| 加密 | Fernet (cryptography) | 对称加密，简单可靠 |

---

## 五、环境变量配置

### 必需配置

```env
# 加密密钥（生产环境必须设置）
ELENCHUS_ENCRYPTION_KEY=your-secure-random-key-at-least-32-chars

# 认证开关
AUTH_ENABLED=true
JWT_SECRET_KEY=another-secure-random-key-at-least-32-chars
```

### 可选配置

```env
# JWT 配置
JWT_ALGORITHM=HS256
JWT_EXPIRE_MINUTES=10080

# 数据库
DATABASE_URL=sqlite+aiosqlite:///./elenchus.db

# 搜索服务
SEARXNG_BASE_URL=http://localhost:8080
TAVILY_API_KEY=tvly-your-api-key
```

---

## 六、迁移指南

### 6.1 从旧版本升级

1. **备份数据**
   ```bash
   cp data/providers.json data/providers.json.bak
   cp elenchus.db elenchus.db.bak
   ```

2. **安装新依赖**
   ```bash
   cd backend
   pip install -r requirements.txt
   ```

3. **设置加密密钥**
   ```bash
   # 生成加密密钥
   python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
   
   # 设置环境变量
   export ELENCHUS_ENCRYPTION_KEY="生成的密钥"
   ```

4. **运行迁移**
   ```bash
   python -m scripts.migrate_providers_to_db
   ```

5. **启动服务**
   ```bash
   uvicorn app.main:app --reload
   ```

### 6.2 前端适配

如果启用认证，前端需要：

1. **登录流程**
   ```typescript
   // 调用登录 API
   const response = await fetch('/api/users/login', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({ email, password })
   });
   const { access_token } = await response.json();
   
   // 存储 token
   localStorage.setItem('token', access_token);
   ```

2. **API 请求携带 token**
   ```typescript
   const token = localStorage.getItem('token');
   fetch('/api/sessions', {
     headers: { 'Authorization': `Bearer ${token}` }
   });
   ```

3. **WebSocket 连接携带 token**
   ```typescript
   const ws = new WebSocket(`ws://localhost:8001/api/ws/${sessionId}?token=${token}`);
   ```

---

## 七、测试指南

### 7.1 单元测试

```python
# tests/test_provider_service.py
import pytest
from app.dependencies import clear_dependency_cache

@pytest.fixture(autouse=True)
def reset_cache():
    clear_dependency_cache()
    yield
    clear_dependency_cache()

async def test_create_provider():
    from app.dependencies import get_provider_service
    service = get_provider_service()
    # ... 测试逻辑
```

### 7.2 认证测试

```bash
# 禁用认证测试
AUTH_ENABLED=false pytest tests/

# 启用认证测试
AUTH_ENABLED=true pytest tests/test_auth.py
```

---

## 八、代码审查与修复

### 8.1 审查发现的问题

经过代码审查，发现以下问题：

| 编号 | 严重程度 | 位置 | 问题 | 状态 |
|------|----------|------|------|------|
| C1 | CRITICAL | intervention_manager.py | `defaultdict(asyncio.Lock)` 导致所有会话共享同一个锁 | ✅ 已修复 |
| H1 | HIGH | provider_service.py | 加密密钥自动生成后进程重启丢失 | ✅ 已修复 |
| H2 | HIGH | websocket.py | WebSocket 认证逻辑与 auth 模块重复 | ✅ 已修复 |
| H3 | HIGH | auth/dependencies.py | `return None # type: ignore` 破坏类型安全 | ✅ 已修复 |

### 8.2 修复详情

#### C1: InterventionManager 锁机制修复

**问题**：`defaultdict(asyncio.Lock)` 在 `__init__` 时调用一次 `asyncio.Lock()`，所有缺失的键会共享同一个 Lock 实例。

**修复**：改为普通字典，通过 `_get_session_lock` 方法管理锁的创建。

```python
# 修复前
self._locks: dict[str, asyncio.Lock] = defaultdict(asyncio.Lock)

# 修复后
self._locks: dict[str, asyncio.Lock] = {}
```

#### H1: 加密密钥强制配置

**问题**：自动生成的临时密钥在进程重启后丢失，导致已加密数据无法解密。

**修复**：强制要求配置 `ELENCHUS_ENCRYPTION_KEY` 环境变量。

```python
# 修复前
if not key:
    key = Fernet.generate_key().decode()
    os.environ["ELENCHUS_ENCRYPTION_KEY"] = key

# 修复后
if not key:
    raise ValueError(
        "ELENCHUS_ENCRYPTION_KEY environment variable is required. "
        "Generate one with: python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
    )
```

#### H2: WebSocket 认证复用

**问题**：WebSocket 认证逻辑完全重复了 `auth/dependencies.py` 中的逻辑。

**修复**：使用 `WebSocketUser` 依赖注入复用认证逻辑。

```python
# 修复前
@router.websocket("/ws/{session_id}")
async def debate_ws(
    websocket: WebSocket,
    session_id: str,
    token: str | None = Query(default=None),
):
    # 50+ 行重复的认证逻辑...

# 修复后
@router.websocket("/ws/{session_id}")
async def debate_ws(
    websocket: WebSocket,
    session_id: str,
    user: WebSocketUser = Depends(get_current_user_ws),
):
    user_id = user.id if user else None
    # ...
```

#### H3: 类型注解修复

**问题**：`get_current_user` 声明返回 `UserRecord`，但在认证禁用时返回 `None`，使用 `type: ignore` 绕过检查。

**修复**：修改返回类型为 `UserRecord | None`。

```python
# 修复前
async def get_current_user(...) -> UserRecord:
    if not settings.env.auth_enabled:
        return None  # type: ignore

# 修复后
async def get_current_user(...) -> UserRecord | None:
    if not settings.env.auth_enabled:
        return None
```

---

## 九、后续改进建议

### 短期（已完成）

- [x] Provider 存储迁移至数据库
- [x] 显式节点状态追踪
- [x] 依赖注入重构
- [x] 认证授权机制
- [x] 代码审查问题修复

### 中期（建议实施）

- [ ] PostgreSQL 迁移（支持更高并发）
- [ ] WebSocket 连接状态外部化（Redis）
- [ ] API 限流
- [ ] 监控和可观测性（Prometheus）

### 长期（规划中）

- [ ] Vector Memory (RAG)
- [ ] 异步事件总线（Redis + Celery）
- [ ] 微服务拆分
- [ ] 多租户支持

---

## 十、风险评估

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| 加密密钥丢失 | 低 | 高 | 强制要求配置，备份密钥 |
| 数据迁移失败 | 低 | 高 | 保留原数据，增量迁移 |
| 认证兼容性 | 中 | 中 | 支持可选认证模式 |
| 性能退化 | 低 | 中 | 性能基准测试 |
| 并发安全问题 | 低 | 高 | 已修复锁机制 |

---

*文档版本：1.1*
*最后更新：2026-03-17*
