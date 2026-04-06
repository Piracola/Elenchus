# 思维链诊断报告 - google-gemma-4-31b-it

## 问题
用户反馈 `google-gemma-4-31b-it` 模型无法正常显示思维链

## 测试结果

### 测试时间
2026年4月6日

### 测试配置
- **模型**: google-gemma-4-31b-it
- **API URL**: https://api.icecola.eu.cc/v1
- **提供商**: cola
- **Max Tokens**: 128000

### 测试结论

❌ **该模型当前不支持思维链输出**

#### 详细分析

1. **响应结构检查**
   - ✅ 模型正常返回内容
   - ❌ 响应中没有 `reasoning_content` 字段
   - ❌ 响应内容中没有 `<think>` 标签
   - ❌ `AIMessage.model_extra` 为空

2. **可能的原因**

   **原因 1: 模型不支持思维链**
   - `google-gemma-4-31b-it` 是 Google 的 Gemma 系列模型
   - 该模型可能本身就不支持输出思维链/推理过程
   
   **原因 2: 需要特殊API参数**
   - 某些模型需要在请求中添加特殊参数才能启用思维链
   - 例如 OpenAI 的 `o1` 系列需要特定配置
   - 但目前代码中 `custom_parameters` 为空 `{}`

3. **与 doubao-seed 的对比**
   
   根据代码注释（`safe_invoke.py` 第271行），`doubao-seed` 模型支持 `reasoning_content` 字段：
   ```python
   # 处理 reasoning_content 字段（如 doubao-seed 模型的思维链）
   ```
   
   但 `google-gemma-4-31b-it` 不在支持列表中。

## 建议解决方案

### 方案 1: 使用支持思维链的模型（推荐）

推荐使用以下支持思维链的模型：
- `doubao-seed-2.0-pro` (已在配置中)
- `doubao-seed-2.0-lite` (已在配置中)
- `deepseek-reasoner` (已在配置中)

### 方案 2: 查询API文档

联系 API 提供商 (api.icecola.eu.cc) 确认：
1. `google-gemma-4-31b-it` 是否支持思维链输出
2. 如果支持，需要添加什么参数

可能需要的配置示例：
```json
{
  "custom_parameters": {
    "thinking": true,
    "enable_reasoning": true
  }
}
```

### 方案 3: 添加通用思维链支持

如果模型支持但在API响应中不包含 `reasoning_content`，可以尝试：
1. 在系统提示词中添加 "请展示你的思考过程"
2. 让模型在回答前输出 `<think>` 标签
3. 但这需要模型本身支持遵循指令

## 测试脚本

相关测试脚本已创建：
- `backend/scripts/test_thinking_chain.py` - 基础测试
- `backend/scripts/test_thinking_chain_detailed.py` - 详细测试

运行方式：
```bash
cd backend
python scripts/test_thinking_chain.py
python scripts/test_thinking_chain_detailed.py
```
