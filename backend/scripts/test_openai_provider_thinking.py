"""
测试 OpenAIProviderClient 是否正确处理 enable_thinking
"""
import sys
from pathlib import Path

backend_root = Path(__file__).resolve().parent.parent
if str(backend_root) not in sys.path:
    sys.path.insert(0, str(backend_root))

from app.agents.providers.clients import OpenAIProviderClient

print("=" * 60)
print("测试 OpenAIProviderClient 创建客户端")
print("=" * 60)

client = OpenAIProviderClient()

# 测试 1: enable_thinking=True
custom_params = {"enable_thinking": True, "top_p": 0.9}
llm = client.create_client(
    model="google-gemma-4-31b-it",
    api_key="test-key",
    api_base_url="https://example.com/v1",
    custom_parameters=custom_params,
    temperature=0.7,
    max_tokens=2048,
    streaming=True,
)

print(f"\nLLM 类型: {type(llm)}")
print(f"模型: {llm.model_name}")
print(f"extra_body: {getattr(llm, 'extra_body', 'N/A')}")
print(f"temperature: {llm.temperature}")
print(f"max_tokens: {llm.max_tokens}")
print(f"streaming: {llm.streaming}")

# 验证 extra_body 是否正确
expected_extra_body = {"chat_template_kwargs": {"enable_thinking": True}}
actual_extra_body = getattr(llm, "extra_body", None)
assert actual_extra_body == expected_extra_body, f"extra_body 不匹配: {actual_extra_body} != {expected_extra_body}"
print(f"\n✅ extra_body 验证通过!")

# 测试 2: enable_thinking=False
print("\n" + "=" * 60)
print("测试 2: enable_thinking=False")
print("=" * 60)

custom_params2 = {"enable_thinking": False, "top_p": 0.9}
llm2 = client.create_client(
    model="google-gemma-4-31b-it",
    api_key="test-key",
    api_base_url="https://example.com/v1",
    custom_parameters=custom_params2,
)

print(f"\nextra_body: {getattr(llm2, 'extra_body', 'N/A')}")
assert getattr(llm2, "extra_body", None) is None, f"extra_body 应该为空: {llm2.extra_body}"
print("✅ 通过!")

print("\n" + "=" * 60)
print("所有测试通过！")
print("=" * 60)
