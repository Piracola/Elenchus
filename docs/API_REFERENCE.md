# Elenchus API 参考文档

> 版本：1.0.0  
> 基础路径：`/api`  
> 协议：HTTP/1.1 + WebSocket  
> 认证：无（当前版本）

---

## 目录

1. [辩论控制 API（新增）](#一辩论控制api新增)
2. [会话管理 API](#二会话管理api)
3. [模型配置 API](#三模型配置api)
4. [搜索配置 API](#四搜索配置api)
5. [SearXNG 管理 API](#五searxng管理api)
6. [WebSocket 实时通信](#六websocket-实时通信)
7. [错误码说明](#七错误码说明)
8. [完整工作流示例](#八完整工作流示例)

---

## 一、辩论控制 API（新增）

> 这些端点允许通过纯 REST 请求控制辩论生命周期，无需 WebSocket。

### 1.1 启动辩论

```
POST /api/sessions/{session_id}/start
```

**功能**：异步启动辩论会话，立即返回。

**路径参数**：
- `session_id`（string）：会话 ID（12 位十六进制字符串）

**响应**：`200 OK`
```json
{
  "success": true,
  "session_id": "abc123def456",
  "message": "Debate session started successfully",
  "session": {
    "id": "abc123def456",
    "topic": "AI 安全是否应该优先考虑发展速度",
    "status": "pending",
    "participants": ["proposer", "opposer"],
    "max_turns": 5,
    "current_turn": 0
  }
}
```

**错误响应**：
- `404 Not Found`：会话不存在
- `409 Conflict`：会话已在运行中

---

### 1.2 停止辩论

```
POST /api/sessions/{session_id}/stop
```

**功能**：立即停止运行中的辩论。

**路径参数**：
- `session_id`（string）：会话 ID

**响应**：`200 OK`
```json
{
  "success": true,
  "session_id": "abc123def456",
  "message": "Debate session stopped successfully"
}
```

**注意**：如果会话未运行，返回 `success: false` 而非错误。

---

### 1.3 干预辩论

```
POST /api/sessions/{session_id}/intervene
```

**功能**：向运行中的辩论插入用户内容，将在下一轮交付。

**路径参数**：
- `session_id`（string）：会话 ID

**请求体**：
```json
{
  "content": "请双方回应关于监管滞后的问题"
}
```

**响应**：`200 OK`
```json
{
  "success": true,
  "session_id": "abc123def456",
  "message": "Intervention successfully queued",
  "was_running": true
}
```

**字段说明**：
- `was_running`：true 表示辩论正在运行，干预将被立即传递；false 表示辩论未运行，干预将排队等待下一轮启动。

---

### 1.4 获取辩论状态

```
GET /api/sessions/{session_id}/status
```

**功能**：获取辩论当前状态。

**路径参数**：
- `session_id`（string）：会话 ID

**响应**：`200 OK`
```json
{
  "session_id": "abc123def456",
  "is_running": true,
  "topic": "AI 安全是否应该优先考虑发展速度",
  "current_turn": 2,
  "max_turns": 5,
  "status": "in_progress",
  "participants": ["proposer", "opposer"]
}
```

---

### 1.5 轮询实时事件

```
GET /api/sessions/{session_id}/live-events
```

**功能**：通过 seq 游标获取新事件，用于实时展示辩论进展。

**路径参数**：
- `session_id`（string）：会话 ID

**查询参数**：
- `after_seq`（integer，默认 0）：返回 seq > 此值的事件
- `limit`（integer，默认 50，最大 200）：最大返回事件数

**响应**：`200 OK`
```json
{
  "session_id": "abc123def456",
  "events": [
    {
      "seq": 1,
      "event_type": "speech_start",
      "phase": "speaking",
      "source": "proposer",
      "payload": {
        "speaker": "proposer",
        "turn": 1
      },
      "timestamp": "2026-04-06T10:00:00Z"
    },
    {
      "seq": 2,
      "event_type": "speech_token",
      "phase": "speaking",
      "source": "proposer",
      "payload": {
        "token": "我认为",
        "streamingContent": "我认为"
      },
      "timestamp": "2026-04-06T10:00:01Z"
    }
  ],
  "has_more": true,
  "next_seq": 2
}
```

**使用方式**：
1. 首次请求：`GET /api/sessions/{id}/live-events?after_seq=0`
2. 记录返回的 `next_seq`
3. 下次请求：`GET /api/sessions/{id}/live-events?after_seq=2`
4. 重复步骤 2-3，实现实时轮询

**事件类型说明**：
- `system`：系统消息（启动、停止等）
- `status`：状态更新
- `speech_start`：发言开始
- `speech_token`：流式发言内容（payload 包含 `token` 和累积的 `streamingContent`）
- `speech_end`：发言结束
- `score_update`：评分更新
- `error`：错误信息

---

## 二、会话管理 API

### 2.1 创建会话

```
POST /api/sessions
```

**请求体**：
```json
{
  "topic": "AI 安全是否应该优先考虑发展速度而非安全性",
  "participants": ["proposer", "opposer"],
  "max_turns": 5,
  "agent_configs": {
    "proposer": {
      "model": "gpt-4",
      "provider_type": "openai",
      "provider_id": "config-123"
    },
    "opposer": {
      "model": "claude-3-opus",
      "provider_type": "anthropic",
      "provider_id": "config-456"
    }
  },
  "team_config": {
    "agents_per_team": 0,
    "discussion_rounds": 0
  },
  "jury_config": {
    "agents_per_jury": 0,
    "discussion_rounds": 0
  },
  "reasoning_config": {
    "steelman_enabled": true,
    "counterfactual_enabled": true,
    "consensus_enabled": true
  },
  "debate_mode": "standard"
}
```

**响应**：`201 Created`
```json
{
  "id": "abc123def456",
  "topic": "AI 安全是否应该优先考虑发展速度而非安全性",
  "status": "pending",
  "participants": ["proposer", "opposer"],
  "max_turns": 5,
  "current_turn": 0,
  "created_at": "2026-04-06T10:00:00Z"
}
```

**字段说明**：
- `topic`：辩论主题（必填）
- `participants`：参与方角色列表（默认 `["proposer", "opposer"]`）
- `max_turns`：最大轮次（1-20，默认 5）
- `agent_configs`：各参与方的模型配置（可选）
  - `model`：模型名称
  - `provider_type`：提供商类型（openai/anthropic/gemini）
  - `provider_id`：引用已配置的模型 ID
  - `api_base_url`：自定义 API 地址
  - `custom_parameters`：自定义参数
- `debate_mode`：模式（`standard` 或 `sophistry_experiment`）

---

### 2.2 列出会话

```
GET /api/sessions
```

**查询参数**：
- `offset`（integer，默认 0）：偏移量
- `limit`（integer，默认 50，最大 200）：每页数量

**响应**：`200 OK`
```json
{
  "sessions": [
    {
      "id": "abc123def456",
      "topic": "AI 安全",
      "status": "completed",
      "current_turn": 5,
      "max_turns": 5,
      "created_at": "2026-04-06T10:00:00Z"
    }
  ],
  "total": 1
}
```

---

### 2.3 获取会话详情

```
GET /api/sessions/{session_id}
```

**响应**：`200 OK`（完整的 SessionResponse 对象）

---

### 2.4 删除会话

```
DELETE /api/sessions/{session_id}
```

**响应**：`204 No Content`

---

### 2.5 导出会话

```
GET /api/sessions/{session_id}/export
```

**查询参数**：
- `format`（string，默认 `json`）：`json` 或 `markdown`

**响应**：文件下载

---

### 2.6 管理会话文档

```
POST   /api/sessions/{session_id}/documents          # 上传文档
GET    /api/sessions/{session_id}/documents          # 列出文档
GET    /api/sessions/{session_id}/documents/{doc_id} # 获取文档详情
DELETE /api/sessions/{session_id}/documents/{doc_id} # 删除文档
GET    /api/sessions/{session_id}/reference-library  # 获取参考文库
```

---

## 三、模型配置 API

### 3.1 列出模型配置

```
GET /api/models
```

**响应**：`200 OK`
```json
[
  {
    "id": "config-123",
    "name": "OpenAI GPT-4",
    "provider_type": "openai",
    "api_key_configured": true,
    "default_max_tokens": 64000,
    "models": ["gpt-4", "gpt-4-turbo"],
    "is_default": true
  }
]
```

---

### 3.2 创建模型配置

```
POST /api/models
```

**请求体**：
```json
{
  "name": "OpenAI GPT-4",
  "provider_type": "openai",
  "api_key": "sk-xxx",
  "default_max_tokens": 64000,
  "models": ["gpt-4", "gpt-4-turbo"],
  "is_default": true
}
```

---

### 3.3 更新模型配置

```
PUT /api/models/{config_id}
```

---

### 3.4 删除模型配置

```
DELETE /api/models/{config_id}
```

---

## 四、搜索配置 API

### 4.1 获取搜索配置

```
GET /api/search/config
```

### 4.2 更新搜索配置

```
PUT /api/search/config
```

### 4.3 列出搜索引擎

```
GET /api/search/providers
```

### 4.4 健康检查

```
GET /api/search/health
```

---

## 五、SearXNG 管理 API

### 5.1 获取 SearXNG 状态

```
GET /api/searxng/status
```

**响应**：`200 OK`
```json
{
  "docker_available": true,
  "searxng_running": true,
  "searxng_healthy": true,
  "searxng_url": "http://localhost:8080"
}
```

### 5.2 启动 SearXNG

```
POST /api/searxng/start
```

### 5.3 停止 SearXNG

```
POST /api/searxng/stop
```

---

## 六、WebSocket 实时通信

> 如果需要真正的实时推送（而非轮询），可以使用 WebSocket。

```
WebSocket /api/ws/{session_id}
```

**客户端动作**：
```json
{"action": "start"}       // 启动辩论
{"action": "stop"}        // 停止辩论
{"action": "ping"}        // 心跳
{"action": "intervene", "content": "..."}  // 干预
```

**服务端事件**：
- `system`：系统消息
- `status`：状态更新
- `error`：错误
- `pong`：心跳响应
- `audience_message`：观众干预

---

## 七、错误码说明

| 状态码 | 说明 | 处理建议 |
|--------|------|---------|
| 400 | 请求参数错误 | 检查请求体格式和必填字段 |
| 404 | 会话不存在 | 检查 session_id 是否正确 |
| 409 | 冲突（如重复启动） | 先检查状态再操作 |
| 500 | 服务器内部错误 | 检查后端日志 |

---

## 八、完整工作流示例

### 场景：创建并监控一场辩论

```bash
# 1. 创建会话
curl -X POST http://localhost:8001/api/sessions \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "AI 是否会取代人类工作",
    "participants": ["proposer", "opposer"],
    "max_turns": 3
  }'

# 返回：{"id": "abc123def456", ...}

# 2. 启动辩论
curl -X POST http://localhost:8001/api/sessions/abc123def456/start

# 3. 轮询状态
curl http://localhost:8001/api/sessions/abc123def456/status

# 返回：{"is_running": true, "current_turn": 1, ...}

# 4. 轮询事件
curl "http://localhost:8001/api/sessions/abc123def456/live-events?after_seq=0&limit=50"

# 返回事件列表，记录 next_seq

# 5. 干预（可选）
curl -X POST http://localhost:8001/api/sessions/abc123def456/intervene \
  -H "Content-Type: application/json" \
  -d '{"content": "请双方回应的更深入一些"}'

# 6. 停止辩论
curl -X POST http://localhost:8001/api/sessions/abc123def456/stop

# 7. 导出结果
curl http://localhost:8001/api/sessions/abc123def456/export?format=markdown \
  --output debate_result.md
```

---

## 附录：Swagger UI

启动后端后，访问 `http://localhost:8001/docs` 查看交互式 API 文档。
