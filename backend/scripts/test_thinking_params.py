"""
验证 thinking mode 参数是否正确构建
"""
import sys
from pathlib import Path

backend_root = Path(__file__).resolve().parent.parent
if str(backend_root) not in sys.path:
    sys.path.insert(0, str(backend_root))

from app.agents.providers.clients import build_thinking_parameters

print("=" * 60)
print("测试 1: enable_thinking=True")
result = build_thinking_parameters({}, True)
print(f"结果: {result}")
assert result.get("extra_body") == {"chat_template_kwargs": {"enable_thinking": True}}
print("✅ 通过")

print()
print("=" * 60)
print("测试 2: enable_thinking=False")
result = build_thinking_parameters({}, False)
print(f"结果: {result}")
assert "extra_body" not in result
print("✅ 通过")

print()
print("=" * 60)
print("测试 3: enable_thinking=True, custom_parameters 已有 extra_body（不覆盖）")
result = build_thinking_parameters({"extra_body": {"foo": "bar"}}, True)
print(f"结果: {result}")
assert result.get("extra_body") == {"foo": "bar"}  # 应该保留用户自定义的
print("✅ 通过")

print()
print("=" * 60)
print("测试 4: enable_thinking=True, custom_parameters 有 enable_thinking 字段")
result = build_thinking_parameters({"enable_thinking": True}, True)
print(f"结果: {result}")
# 用户已在 custom_parameters 中设置，不应覆盖
assert "extra_body" not in result or result.get("enable_thinking") == True
print("✅ 通过")

print()
print("=" * 60)
print("所有测试通过！")
