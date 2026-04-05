# Elenchus openclaw 技能指南

> 本文档指导 openclaw（或其他 AI 代理）如何通过 REST API 操控 Elenchus 多智能体辩论平台。

---

## 快速开始

### 服务器配置

- **基础 URL**：`http://<服务器地址>:8001`
- **API 前缀**：`/api`
- **认证**：当前无需认证
- **CORS**：默认允许所有来源（开发环境）

### 连通性测试

```bash
curl http://localhost:8001/api/health
# 预期返回：{"status": "ok", "service": "elenchus"}
```

### API 文档

- Swagger UI：`http://localhost:8001/docs`
- 完整参考文档：`docs/API_REFERENCE.md`

---

## 核心技能

### 技能 1：创建辩论会话

**触发条件**：用户要求创建辩论

**执行步骤**：

1. 调用 `POST /api/sessions` 创建会话
2. 解析返回的 `session_id`
3. 向用户确认创建成功

**请求示例**：

```http
POST /api/sessions
Content-Type: application/json

{
  "topic": "辩论主题",
  "participants": ["proposer", "opposer"],
  "max_turns": 5,
  "agent_configs": {
    "proposer": {
      "model": "gpt-4",
      "provider_type": "openai"
    },
    "opposer": {
      "model": "claude-3-opus",
      "provider_type": "anthropic"
    }
  }
}
```

**参数说明**：

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| topic | string | 是 | - | 辩论主题 |
| participants | string[] | 否 | `["proposer", "opposer"]` | 参与方角色列表 |
| max_turns | integer | 否 | 5 | 最大轮次（1-20） |
| agent_configs | object | 否 | null | 各参与方的模型配置 |
| debate_mode | string | 否 | "standard" | 模式：standard 或 sophistry_experiment |

**agent_configs 配置说明**：

如果你需要为每个参与方指定不同的模型：

```json
{
  "agent_configs": {
    "proposer": {
      "model": "gpt-4",
      "provider_type": "openai",
      "provider_id": "模型配置ID（可选）",
      "api_base_url": "自定义API地址（可选）",
      "custom_parameters": {"temperature": 0.7}
    }
  }
}
```

**成功响应**：

```json
{
  "id": "abc123def456",
  "topic": "辩论主题",
  "status": "pending",
  "participants": ["proposer", "opposer"],
  "max_turns": 5,
  "current_turn": 0,
  "created_at": "2026-04-06T10:00:00Z"
}
```

**错误处理**：

- `400`：参数错误（如 topic 为空）
- `500`：服务器错误

---

### 技能 2：启动辩论

**触发条件**：用户要求开始辩论

**执行步骤**：

1. 调用 `POST /api/sessions/{session_id}/start`
2. 检查返回的 `success` 字段
3. 向用户报告启动状态
4. 开始轮询获取辩论进展

**请求示例**：

```http
POST /api/sessions/abc123def456/start
```

**成功响应**：

```json
{
  "success": true,
  "session_id": "abc123def456",
  "message": "Debate session started successfully",
  "session": { ... }
}
```

**错误处理**：

- `404`：会话不存在 → 提示用户检查 ID
- `409`：会话已在运行 → 告知用户"辩论已在运行中，无需重复启动"

---

### 技能 3：监控辩论进度

**触发条件**：用户询问辩论进展 / 定时更新（建议每 3-5 秒轮询一次）

**执行步骤**：

1. 调用 `GET /api/sessions/{session_id}/status` 获取整体状态
2. 调用 `GET /api/sessions/{session_id}/live-events?after_seq={last_seq}` 获取最新事件
3. 格式化事件内容后展示给用户
4. 更新 `last_seq` 为返回的 `next_seq`

**状态查询请求**：

```http
GET /api/sessions/abc123def456/status
```

**状态响应**：

```json
{
  "session_id": "abc123def456",
  "is_running": true,
  "topic": "AI 安全",
  "current_turn": 2,
  "max_turns": 5,
  "status": "in_progress",
  "participants": ["proposer", "opposer"]
}
```

**事件轮询请求**：

```http
GET /api/sessions/abc123def456/live-events?after_seq=0&limit=50
```

**事件响应**：

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
        "streamingContent": "我认为 AI 安全非常重要..."
      },
      "timestamp": "2026-04-06T10:00:01Z"
    },
    {
      "seq": 3,
      "event_type": "speech_end",
      "phase": "speaking",
      "source": "proposer",
      "payload": {
        "speaker": "proposer",
        "content": "完整的发言内容..."
      },
      "timestamp": "2026-04-06T10:00:30Z"
    }
  ],
  "has_more": true,
  "next_seq": 3
}
```

**事件类型格式化指南**：

| 事件类型 | 如何展示给用户 |
|---------|--------------|
| `system` | 显示系统消息（如"辩论已开始"） |
| `status` | 显示状态更新 |
| `speech_start` | 显示"【正方/反方】开始发言..." |
| `speech_token` | 实时更新发言内容（使用 `payload.streamingContent`） |
| `speech_end` | 显示完整发言内容 |
| `score_update` | 显示评分变化 |
| `error` | 显示错误信息 |

**轮询循环伪代码**：

```
last_seq = 0
while debate_is_running:
    events = GET /api/sessions/{id}/live-events?after_seq={last_seq}
    for event in events.events:
        display_formatted_event(event)
    last_seq = events.next_seq
    sleep(3)  # 3秒轮询一次
    
    status = GET /api/sessions/{id}/status
    if not status.is_running:
        break  # 辩论已结束
```

---

### 技能 4：干预辩论

**触发条件**：用户要求向辩论中插入内容（提问、建议、评论等）

**执行步骤**：

1. 调用 `POST /api/sessions/{session_id}/intervene`
2. 检查 `was_running` 字段
3. 向用户报告干预是否已提交

**请求示例**：

```http
POST /api/sessions/abc123def456/intervene
Content-Type: application/json

{
  "content": "请双方回应关于监管滞后的问题"
}
```

**响应**：

```json
{
  "success": true,
  "session_id": "abc123def456",
  "message": "Intervention successfully queued",
  "was_running": true
}
```

**字段说明**：

- `was_running: true`：辩论正在运行，干预将在下一轮传递
- `was_running: false`：辩论未运行，干预已排队，将在下次启动时传递

**错误处理**：

- 如果 `success: false`，告知用户"干预已记录，但辩论当前未运行"

---

### 技能 5：停止辩论

**触发条件**：用户要求停止辩论

**执行步骤**：

1. 调用 `POST /api/sessions/{session_id}/stop`
2. 向用户报告停止状态

**请求示例**：

```http
POST /api/sessions/abc123def456/stop
```

**响应**：

```json
{
  "success": true,
  "session_id": "abc123def456",
  "message": "Debate session stopped successfully"
}
```

**注意**：

- 如果辩论未运行，返回 `success: false`，这不是错误，只是告知用户
- 停止后仍可导出辩论结果

---

### 技能 6：导出辩论结果

**触发条件**：用户要求导出辩论结果 / 辩论自动结束后

**执行步骤**：

1. 调用 `GET /api/sessions/{session_id}/export?format=markdown`
2. 保存返回的内容到文件
3. 向用户提供下载链接或展示内容

**请求示例**：

```http
GET /api/sessions/abc123def456/export?format=markdown
```

**响应**：Markdown 文件下载

**也可以使用 JSON 格式**：

```http
GET /api/sessions/abc123def456/export?format=json
```

---

### 技能 7：管理模型配置

**触发条件**：用户要求配置/查看/切换模型

#### 7.1 列出已配置的模型

```http
GET /api/models
```

**响应**：

```json
[
  {
    "id": "config-123",
    "name": "OpenAI GPT-4",
    "provider_type": "openai",
    "api_key_configured": true,
    "models": ["gpt-4", "gpt-4-turbo"],
    "is_default": true
  }
]
```

#### 7.2 创建新模型配置

```http
POST /api/models
Content-Type: application/json

{
  "name": "Claude 3 Opus",
  "provider_type": "anthropic",
  "api_key": "sk-ant-xxx",
  "models": ["claude-3-opus-20240229"],
  "is_default": false
}
```

---

### 技能 8：管理参考文档

**触发条件**：用户要求上传辩论参考文档

#### 8.1 上传文档

```http
POST /api/sessions/{session_id}/documents
Content-Type: multipart/form-data

file: <文件>
```

#### 8.2 列出文档

```http
GET /api/sessions/{session_id}/documents
```

#### 8.3 获取参考文库

```http
GET /api/sessions/{session_id}/reference-library
```

---

## 完整工作流示例

### 场景 1：简单辩论

**用户**："帮我辩论一下 AI 是否会取代人类"

**openclaw 执行流程**：

```python
# 1. 创建会话
response = POST /api/sessions {
    "topic": "AI 是否会取代人类",
    "max_turns": 5
}
session_id = response.id

# 2. 启动辩论
POST /api/sessions/{session_id}/start

# 3. 轮询事件
last_seq = 0
while True:
    events = GET /api/sessions/{session_id}/live-events?after_seq={last_seq}
    for event in events.events:
        print(format_event(event))
    last_seq = events.next_seq
    
    status = GET /api/sessions/{session_id}/status
    if not status.is_running:
        break
    sleep(3)

# 4. 导出结果
result = GET /api/sessions/{session_id}/export?format=markdown
save_to_file("debate_result.md", result)
```

---

### 场景 2：带干预的辩论

**用户**："辩论 AI 安全，帮我在第 2 轮插入一个问题：'请回应监管滞后的问题'"

**openclaw 执行流程**：

```python
# 1. 创建并启动辩论
session = POST /api/sessions {"topic": "AI 安全"}
POST /api/sessions/{session.id}/start

# 2. 轮询等待第 2 轮
while True:
    status = GET /api/sessions/{session.id}/status
    if status.current_turn >= 2:
        break
    sleep(3)

# 3. 插入干预
POST /api/sessions/{session.id}/intervene {
    "content": "请回应监管滞后的问题"
}

# 4. 继续轮询至结束
```

---

### 场景 3：多模型对比

**用户**："用 GPT-4 和 Claude 辩论 AI 安全"

**openclaw 执行流程**：

```python
# 1. 确保模型配置存在
# （如果未配置，先创建）
POST /api/models {
    "name": "GPT-4",
    "provider_type": "openai",
    "api_key": "sk-xxx",
    "models": ["gpt-4"]
}

POST /api/models {
    "name": "Claude 3",
    "provider_type": "anthropic",
    "api_key": "sk-ant-xxx",
    "models": ["claude-3-opus"]
}

# 2. 创建会话并指定模型
session = POST /api/sessions {
    "topic": "AI 安全",
    "agent_configs": {
        "proposer": {
            "model": "gpt-4",
            "provider_type": "openai"
        },
        "opposer": {
            "model": "claude-3-opus",
            "provider_type": "anthropic"
        }
    }
}

# 3. 启动并监控
POST /api/sessions/{session.id}/start
# ... 轮询事件 ...
```

---

### 场景 4：高级模式配置

**用户**："创建一个有团队讨论和陪审团评分的辩论"

**openclaw 执行流程**：

```python
POST /api/sessions {
    "topic": "是否应该征收碳税",
    "max_turns": 5,
    "team_config": {
        "agents_per_team": 2,      # 每方 2 个 AI 先内部讨论
        "discussion_rounds": 1     # 1 轮团队讨论
    },
    "jury_config": {
        "agents_per_jury": 3,      # 3 个陪审团 AI
        "discussion_rounds": 1     # 1 轮陪审团讨论
    },
    "reasoning_config": {
        "steelman_enabled": true,    # 启用最强论点强化
        "counterfactual_enabled": true,  # 启用反事实推理
        "consensus_enabled": true    # 启用共识提取
    }
}
```

---

## 错误处理指南

| 错误码 | 原因 | 处理方式 |
|--------|------|---------|
| 400 | 请求参数错误 | 检查必填字段和格式 |
| 404 | 会话不存在 | 提示用户"找不到该会话，请检查 ID" |
| 409 | 冲突（如重复启动） | 告知用户"辩论已在运行中" |
| 500 | 服务器错误 | 建议用户"服务器出错，请检查后端日志" |

**网络错误重试**：

```python
max_retries = 3
for attempt in range(max_retries):
    try:
        response = requests.post(url, json=data)
        return response.json()
    except requests.exceptions.RequestException as e:
        if attempt == max_retries - 1:
            raise
        sleep(2 ** attempt)  # 指数退避
```

---

## 响应格式化规范

### 如何展示辩论事件

**发言开始**：
```
🎤 【正方】开始发言（第 1 轮）
```

**发言结束**：
```
✅ 【正方】发言完毕

{完整的发言内容}
```

**评分更新**：
```
📊 评分更新：
- 正方：8.5 分
- 反方：7.8 分
```

**系统消息**：
```
ℹ️ 系统：辩论已开始
ℹ️ 系统：辩论已结束
```

**错误**：
```
❌ 错误：{错误信息}
```

---

## 高级技巧

### 1. 使用 team_config 启用团队内部讨论

设置 `agents_per_team > 0` 可以让同一方的多个 AI 先进行内部讨论，形成统一论点后再与对方辩论。

### 2. 使用 jury_config 启用陪审团评分

设置 `agents_per_jury > 0` 可以引入独立的陪审团 AI，对每轮辩论进行客观评分。

### 3. 使用 reasoning_config 启用深度推理

- `steelman_enabled`：强化双方最强论点
- `counterfactual_enabled`：生成反事实推理
- `consensus_enabled`：提取双方共识

### 4. sophistry_experiment 模式

设置 `debate_mode: "sophistry_experiment"` 启用诡辩实验模式，该模式会：
- 生成种子参考文档
- 启用观察者 AI
- 产详细的模式分析报告

### 5. 自定义模型参数

在 `agent_configs` 中添加 `custom_parameters`：

```json
{
  "agent_configs": {
    "proposer": {
      "model": "gpt-4",
      "custom_parameters": {
        "temperature": 0.8,
        "top_p": 0.9
      }
    }
  }
}
```

### 6. 使用 SearXNG 增强搜索

如果服务器部署了 SearXNG，可以在创建会话前启用：

```bash
POST /api/searxng/start  # 启动 SearXNG
PUT /api/search/config   # 切换到 SearXNG 搜索引擎
```

---

## 常见问题

### Q: 如何知道辩论已结束？

A: 轮询 `GET /api/sessions/{id}/status`，当 `is_running` 变为 `false` 时，辩论结束。

### Q: 辩论结束后还能干预吗？

A: 不能。干预只能在辩论运行时进行。但未运行的干预会排队，下次启动时传递。

### Q: 可以同时运行多个辩论吗？

A: 可以。每个会话独立运行，互不干扰。

### Q: 如何查看历史辩论？

A: 使用 `GET /api/sessions` 列出所有会话，再用 `GET /api/sessions/{id}` 获取详情。

### Q: 事件轮询的频率应该是多少？

A: 建议 3-5 秒一次。过于频繁会增加服务器负担。

---

## 附录：快速参考卡片

### 创建辩论
```
POST /api/sessions
Body: {"topic": "...", "max_turns": 5}
```

### 启动辩论
```
POST /api/sessions/{id}/start
```

### 查看状态
```
GET /api/sessions/{id}/status
```

### 获取事件
```
GET /api/sessions/{id}/live-events?after_seq={seq}
```

### 干预
```
POST /api/sessions/{id}/intervene
Body: {"content": "..."}
```

### 停止
```
POST /api/sessions/{id}/stop
```

### 导出
```
GET /api/sessions/{id}/export?format=markdown
```

---

## 更新日志

- **2026-04-06**：初始版本，添加 REST 辩论控制 API 完整文档
