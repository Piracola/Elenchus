# 思维链内容未显示问题诊断

## 问题描述

用户在使用 `doubao-seed-2.0-pro` 模型并设置 `"reasoning_effort": "high"` 后，在辩手输出的消息中没有看到思维链（Thinking Chain）内容。

## 问题分析

### 1. 参数传递流程 ✅ 正常

```
前端设置 custom_parameters
  ↓
保存到 provider 配置
  ↓
辩论时加载到 ResolvedLLMConfig
  ↓
传递给 ChatOpenAI(**client_kwargs)
  ↓
发送到 API 端点
```

**检查结果**：`reasoning_effort` 参数会被正确传递到 API 请求中。

### 2. 前端解析逻辑 ✅ 正常

前端 `thinkingContent.ts` 使用正则表达式解析 `<think>...</think>` 标签：

```typescript
const THINK_OPEN_TAG_REGEX = /^<think\b[^>]*>/i;
const THINK_CLOSE_TAG_REGEX = /<\/think\s*>/i;
```

**检查结果**：前端会正确解析包含 `<think>` 标签的内容并显示为思维链面板。

### 3. 可能的根本原因 🔴

#### 原因 A：模型不支持思维链输出

`doubao-seed-2.0-pro` 模型可能：
- 不支持 `reasoning_effort` 参数
- 即使支持，也不在响应中返回 `<think>` 标签包裹的内容
- 返回的思维链格式与前端期望不一致

#### 原因 B：API 代理层过滤了思维链内容

如果使用了 API 代理（如 One-API、New-API 等）：
- 代理层可能过滤或转换了 `reasoning_effort` 参数
- 代理层可能没有正确转发思维链内容

#### 原因 C：模型返回了思维链，但格式不同

某些模型使用不同的标签或格式，例如：
- `<thinking>...</thinking>`
- `<think>...</think>`
- 特殊的 JSON 字段

## 诊断步骤

### 步骤 1：检查原始响应内容

在浏览器开发者工具中：
1. 打开 Network 面板
2. 找到辩论会话的 API 请求
3. 查看返回的 `content` 字段原始内容
4. 搜索是否包含 `<think>` 或类似标签

### 步骤 2：检查后端日志

查看 `runtime/logs/elenchus_2026-04-05.log`：
```bash
grep -i "thinking\|reasoning" runtime/logs/elenchus_2026-04-05.log
```

### 步骤 3：直接测试 API

使用 curl 或 Postman 直接调用模型 API：

```bash
curl -X POST "https://your-api-base/v1/chat/completions" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "doubao-seed-2.0-pro",
    "messages": [{"role": "user", "content": "请逐步思考：1+1等于几？"}],
    "reasoning_effort": "high",
    "temperature": 0.7
  }'
```

检查返回的 `choices[0].message.content` 中是否包含思维链内容。

## 解决方案

### 方案 1：确认模型支持情况

联系模型提供商或查看文档，确认：
1. `doubao-seed-2.0-pro` 是否支持 `reasoning_effort` 参数
2. 思维链内容的输出格式是什么
3. 是否需要额外的参数来启用思维链输出

### 方案 2：调整前端解析逻辑

如果模型使用不同的标签格式（例如 `<think>...</think>`），修改 `thinkingContent.ts`：

```typescript
// 添加对 <think> 标签的支持
const THINK_OPEN_TAG_REGEX = /^<(?:think|thinking|Thought)\b[^>]*>/i;
const THINK_CLOSE_TAG_REGEX = /<\/(?:think|thinking|Thought)\s*>/i;
```

### 方案 3：使用支持思维链的模型

切换到明确支持思维链输出的模型，例如：
- `deepseek-reasoner`
- `o1` / `o3-mini`（OpenAI 推理模型）
- 其他明确返回 `<think>` 标签的模型

### 方案 4：添加思维链后处理

如果模型返回思维链但在不同字段中，修改后端代码提取并合并：

```python
# 在 openai_transport.py 或 safe_invoke.py 中
if hasattr(chunk.choices[0].delta, 'reasoning_content'):
    reasoning = chunk.choices[0].delta.reasoning_content
    if reasoning:
        # 包装为 <think> 标签格式
        content = f"<think>{reasoning}</think>\n\n{content}"
```

## 参考信息

### 前端思维链解析代码位置
- 文件：`frontend/src/utils/thinkingContent.ts`
- 组件：`frontend/src/components/chat/messageRow/ThinkingBlock.tsx`

### 后端参数传递代码位置
- 文件：`backend/app/agents/providers/clients.py`
- 函数：`OpenAIProviderClient.create_client()`

### 相关配置
- 设置位置：前端侧边栏 → 模型提供商管理 → 自定义参数
- 格式：JSON 对象，例如 `{"reasoning_effort": "high"}`

## 建议的优先顺序

1. **首先**：直接测试 API，确认模型是否返回思维链内容
2. **其次**：检查 API 代理层是否有特殊配置要求
3. **最后**：根据模型实际输出格式调整前端解析逻辑
