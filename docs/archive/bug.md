# Elenchus Bug 修复计划

> 基于 2026-03-17 全量代码审计，共发现 36 个问题。本文档记录分批精准修复方案。

---

## 第一批：严重 Bug（立即修）

### Bug 1 — `runner.py` 会话恢复永远从空状态开始

**文件**：`backend/app/agents/runner.py`，第 48、63–67 行

**问题描述**：
`session_service.get_session()` 内部调用 `_record_to_dict()`，该函数已将 `state_snapshot` 里的字段**展平**到返回 dict 的顶层（`dialogue_history`、`current_scores` 等直接作为顶层 key）。但 `runner.py` 第 48 行仍然尝试读取 `session_db.get("state_snapshot")`，这个 key 在展平后的 dict 里根本不存在，永远返回 `None`，导致 `state_snap` 始终是 `{}`。

结果：每次恢复辩论时，`dialogue_history`、`shared_knowledge`、`current_scores`、`cumulative_scores` 全部丢失，辩论从零开始。

**当前错误代码**：
```python
# runner.py 第 47–67 行
session_db = session_db or {}
state_snap = session_db.get("state_snapshot") or {}   # ← 永远是 {}

initial_state: DebateGraphState = {
    ...
    "dialogue_history": state_snap.get("dialogue_history", []),   # ← 永远 []
    "shared_knowledge": state_snap.get("shared_knowledge", []),   # ← 永远 []
    "current_scores":   state_snap.get("current_scores", {}),     # ← 永远 {}
    "cumulative_scores": state_snap.get("cumulative_scores", {}), # ← 永远 {}
    ...
}
```

**修复方案**：
删除 `state_snap` 中间变量，直接从 `session_db` 顶层读取字段：
```python
session_db = session_db or {}

initial_state: DebateGraphState = {
    ...
    "dialogue_history":  session_db.get("dialogue_history", []),
    "shared_knowledge":  session_db.get("shared_knowledge", []),
    "current_scores":    session_db.get("current_scores", {}),
    "cumulative_scores": session_db.get("cumulative_scores", {}),
    ...
}
```

**影响范围**：仅 `runner.py`，改动 2 行。

---

### Bug 2 — `debater.py` 发出 `RemoveMessage(id=None)` 导致 LangGraph reducer 崩溃

**文件**：`backend/app/agents/debater.py`，第 126 行

**问题描述**：
`hasattr(m, "id")` 对所有 LangChain `BaseMessage` 对象永远返回 `True`，因为 `id` 属性始终存在，只是值可能是 `None`。当 `m.id` 为 `None` 时，`RemoveMessage(id=None)` 被发出，LangGraph 的 `add_messages` reducer 无法处理 `id=None` 的删除指令，抛出异常。

**当前错误代码**：
```python
"messages": [RemoveMessage(id=m.id) for m in messages if hasattr(m, "id")],
#                                                          ^^^^^^^^^^^^^^^^
#                                          永远 True，不能过滤掉 id=None 的情况
```

**修复方案**：
将 `hasattr` 改为 truthy 检查：
```python
"messages": [RemoveMessage(id=m.id) for m in messages if m.id],
```

**影响范围**：仅 `debater.py`，改动 1 行。

---

### Bug 3 — 前端 `endStreaming` 重复检测逻辑错误，导致消息被误判为重复而丢弃

**文件**：`frontend/src/stores/debateStore.ts`，第 122–128 行

**问题描述**：
`endStreaming` 在将流式消息提交到 `dialogue_history` 前，会检查是否已存在相同内容的条目以防重复。但检查条件写错了：

```typescript
const isDuplicate = history.some(
    e => e.role === role && e.content === content && e.timestamp
    //                                               ^^^^^^^^^^^
    //                      这是 truthy 检查，不是相等检查
    //                      任何有 timestamp 的同角色同内容条目都会被判为重复
);
```

`e.timestamp` 是 truthy 检查，而非与当前时间戳的相等比较。由于历史记录里的每条消息都有非空 `timestamp`，只要 role 和 content 相同（例如辩手在不同轮次重复了相同论点），第二条消息就会被静默丢弃。

**修复方案**：
重复检测应该基于稳定的唯一标识（如 `timestamp` 精确匹配），或者完全移除这个有缺陷的检测，改为依赖 WebSocket 协议层面的幂等性：
```typescript
// 方案 A：移除有缺陷的重复检测（推荐，协议层已保证不重复发送）
const isDuplicate = false;

// 方案 B：如果确实需要去重，用精确的时间戳比较
// 但 endStreaming 创建的是新时间戳，所以这个检测本身就没有意义
```

**影响范围**：仅 `debateStore.ts`，改动 3–5 行。

---

### Bug 4 — `provider_service.py` 删除 provider 后对已关闭的 session 执行二次 commit

**文件**：`backend/app/services/provider_service.py`，第 214–236 行

**问题描述**：
`delete_config` 方法在 `async with await self._get_session() as session:` 上下文中：
1. 第一次 `await session.commit()` 提交删除操作，session 进入已提交状态
2. 随后尝试查询并更新新的默认 provider
3. 执行第二次 `await session.commit()`

在 SQLAlchemy async session 的某些配置下，第一次 commit 后 session 的内部状态已经重置，第二次在同一 `async with` 块内的 commit 可能操作的是不一致的事务状态，导致更新丢失或抛出异常。

**当前错误代码**：
```python
async with await self._get_session() as session:
    ...
    await session.delete(record)
    await session.commit()          # ← 第一次 commit

    if was_default:
        result = await session.execute(...)   # ← commit 后继续操作
        new_default = result.scalar_first()
        if new_default:
            new_default.is_default = True
            await session.commit()  # ← 第二次 commit，状态不确定
```

**修复方案**：
将删除和更新默认值合并到同一个事务中，只 commit 一次：
```python
async with await self._get_session() as session:
    ...
    was_default = record.is_default
    await session.delete(record)

    if was_default:
        # 在同一事务内查询并更新新默认值
        result = await session.execute(
            select(ProviderRecord)
            .where(ProviderRecord.id != config_id)
            .order_by(ProviderRecord.created_at.desc())
        )
        new_default = result.scalar_first()
        if new_default:
            new_default.is_default = True

    await session.commit()  # ← 只 commit 一次
```

**影响范围**：仅 `provider_service.py`，改动约 10 行。

---

## 第二批：架构缺陷（本周修）

### Bug 5 — 废弃的模块级单例与 DI 容器实例并存，`InterventionManager` 干预消息静默丢失

**文件**：
- `backend/app/services/provider_service.py`，第 252 行
- `backend/app/agents/llm_router.py`，第 61 行
- `backend/app/services/intervention_manager.py`，第 137–151 行

**问题描述**：
三个服务各有一个废弃的模块级单例实例，与 `app.dependencies` 管理的 DI 单例完全独立。最危险的是 `InterventionManager`：如果任何代码路径意外导入了模块级的 `_intervention_manager` 而非通过 `get_intervention_manager()` 获取，用户的干预消息会进入错误的队列，永远不会被 graph 消费，静默丢失。

**修复方案**：
删除三个文件末尾的模块级单例声明，所有调用方统一通过 `app.dependencies` 获取实例。

---

### Bug 6 — `runner.py` 每个 graph 节点都写一次数据库，5 轮辩论约 30+ 次 DB 写入

**文件**：`backend/app/agents/runner.py`，第 157 行

**问题描述**：
`await _persist_state(session_id, final_state)` 在 `async for` 循环内无条件执行，每个节点（包括 `set_speaker`、`manage_context` 等无实质状态变化的节点）都触发一次完整的 DB 写入。

**修复方案**：
只在有意义的节点后持久化：
```python
_PERSIST_NODES = {"advance_turn", "judge", "speaker"}

if node_name in _PERSIST_NODES:
    await _persist_state(session_id, final_state)
```
错误和完成时的持久化保持不变（在 `except` 和循环结束后）。

---

### Bug 7 — `context_manager.py` 压缩时忽略 per-session 模型配置，永远用默认 provider

**文件**：`backend/app/agents/context_manager.py`，第 56 行

**问题描述**：
```python
llm = await get_fact_checker_llm(streaming=False)  # 没有传 override
```
`agent_configs` 没有被传入 `compress_context()`，context 压缩始终使用默认 provider，忽略用户为 `fact_checker` 角色配置的模型。

**修复方案**：
为 `compress_context()` 添加 `agent_configs` 参数，并传入 `fact_checker` 的配置：
```python
async def compress_context(..., agent_configs: dict | None = None):
    override = (agent_configs or {}).get("fact_checker")
    llm = await get_fact_checker_llm(streaming=False, override=override)
```

---

### Bug 8 — `useAgentConfigs` 配置列表不刷新，新增 provider 后面板显示旧数据

**文件**：`frontend/src/hooks/useAgentConfigs.ts`，第 12–21 行

**问题描述**：
`hasLoadedRef` 标记确保配置只加载一次，但 `ModelConfigManager` 关闭后不会触发重新加载。用户新增或修改 provider 后，`AgentConfigPanel` 的下拉列表仍显示旧数据，需要刷新页面才能看到新配置。

**修复方案**：
在 `ModelConfigManager` 关闭时（`onClose` 回调）触发重新加载，或将 `hasLoadedRef` 改为响应 `showConfigManager` 从 `true` 变为 `false` 的事件：
```typescript
// 当 ModelConfigManager 关闭时重新拉取
useEffect(() => {
    if (!showConfigManager) {
        api.models.list()
            .then(data => setSavedConfigs(data))
            .catch(err => console.error(err));
    }
}, [showConfigManager]);
```

---

## 第三批：类型安全 + API 合约（下周修）

### Bug 9 — 前端硬编码两个角色，第三个辩手渲染错误

**文件**：
- `frontend/src/stores/debateStore.ts`，第 132–133 行
- `frontend/src/utils/groupDialogue.ts`，第 18 行
- `frontend/src/components/chat/MessageRow.tsx`，第 34 行

**修复方案**：从 `session.participants` 动态读取角色列表，不硬编码 `proposer`/`opposer`。

---

### Bug 10 — `currentSession` 和 `currentSessionId` 可以不同步

**文件**：`frontend/src/stores/debateStore.ts`，第 21–22 行

**修复方案**：合并为单一字段，`currentSessionId` 改为从 `currentSession?.id` 派生。

---

### Bug 11 — `AgentConfig` 类型包含 `api_key` 字段

**文件**：`frontend/src/types/index.ts`，第 79 行

**修复方案**：从 `AgentConfig` 接口中删除 `api_key` 字段，前端永远不应持有或传递 API key。

---

### Bug 12 — `TurnScore` 命名冲突

**文件**：
- `backend/app/models/state.py`，第 44–48 行（TypedDict）
- `backend/app/models/scoring.py`（Pydantic model）

**修复方案**：将 `state.py` 中的 `TurnScore` 重命名为 `TurnScoreDict` 或直接删除（它未被使用）。

---

### Bug 13 — API trailing slash 不一致

**文件**：`frontend/src/api/client.ts`

**问题**：`/models/` 有尾部斜杠，`/sessions` 没有，导致每次 models API 调用多一次 307 重定向。

**修复方案**：统一去掉所有 endpoint 的尾部斜杠。

---

### Bug 14 — `fact_check_start`、`judge_start` WebSocket 消息无 handler

**文件**：`frontend/src/hooks/useDebateWebSocket.ts`

**修复方案**：在 `switch` 语句中添加对应 case，至少更新 UI 状态（如显示"正在核查..."提示）。

---

### Bug 15 — `datetime.utcnow()` 在 Python 3.12 已废弃

**文件**：`backend/app/models/state.py`，第 19 行

**修复方案**：
```python
# 改为
timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
```

---

## 其他细节问题（随手修）

| # | 文件 | 问题 | 修法 |
|---|------|------|------|
| 16 | `graph.py:160` | 工具名 `"web_search"` 硬编码字符串 | 改为引用 tool 对象的 `.name` 属性 |
| 17 | `graph.py:165` | 截断后缀 `"..."` 无条件追加 | 加长度判断 |
| 18 | `provider_service.py:98` | `_mask_api_key` 与 schema validator 双重 mask | 删掉 service 层的 mask，只保留 schema validator |
| 19 | `session_service.py:140` | `import` 在函数体内 | 移到文件顶部 |
| 20 | `websocket.py:173–233` | 多处 `import` 在 action handler 内 | 移到文件顶部 |
| 21 | `llm_router.py:47` | f-string 日志 + 非正式措辞 "Hacking back" | 改为 `%s` 懒格式化，措辞改为 "Falling back" |
| 22 | `llm.py:88` | 错误信息为中文，与后端其他日志不一致 | 改为英文或统一为中文 |
| 23 | `ChatPanel.tsx:159` | `key={idx}` 用数组下标 | 改为 `key={entry.timestamp + entry.role}` |
| 24 | `MessageRow.tsx:34` | audience 消息用 proposer 颜色 | 改为独立的 neutral 颜色变量 |
| 25 | `schemas.py` | `SessionResponse` 有 `shared_knowledge` 但前端 `Session` 类型没有 | 前端类型补上该字段 |

---

## 执行顺序建议

```
第一批（4 个严重 bug）→ 跑完整辩论流程验证
        ↓
第二批（4 个架构缺陷）→ 跑完整辩论流程验证
        ↓
第三批（类型/合约/细节）→ 全量回归测试
```

每批修完后单独验证，不要攒在一起改。
