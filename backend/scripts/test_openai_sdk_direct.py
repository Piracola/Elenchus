"""
直接使用 OpenAI SDK 测试不同的参数格式
"""
import asyncio
from openai import AsyncOpenAI


async def test_openai_sdk_direct():
    """直接使用 OpenAI SDK 测试"""
    print("🔍 直接使用 OpenAI SDK 测试")
    print("=" * 80)
    
    client = AsyncOpenAI(
        api_key="sk-eWvDVMPY6Ph6v8fH26gvEVOAyh1ZtzxizsPlM4Vt284LnxMH",
        base_url="https://api.icecola.eu.cc/v1",
    )
    
    test_cases = [
        # 测试 1: extra_body.chat_template_kwargs.enable_thinking
        {
            "name": "extra_body.chat_template_kwargs.enable_thinking",
            "kwargs": {
                "extra_body": {
                    "chat_template_kwargs": {
                        "enable_thinking": True
                    }
                }
            }
        },
        # 测试 2: 直接在请求体中添加 chat_template_kwargs
        {
            "name": "直接 chat_template_kwargs",
            "kwargs": {
                "chat_template_kwargs": {
                    "enable_thinking": True
                }
            }
        },
        # 测试 3: extra_body.enable_thinking (直接)
        {
            "name": "extra_body.enable_thinking (直接)",
            "kwargs": {
                "extra_body": {
                    "enable_thinking": True
                }
            }
        },
    ]
    
    for test_case in test_cases:
        print(f"\n{'=' * 80}")
        print(f"🧪 测试: {test_case['name']}")
        print(f"参数: {test_case['kwargs']}")
        print("-" * 80)
        
        try:
            response = await client.chat.completions.create(
                model="google-gemma-4-31b-it",
                messages=[
                    {"role": "user", "content": "量子计算是什么？请用简短回答。"},
                ],
                max_tokens=1024,
                temperature=0.7,
                **test_case["kwargs"],
            )
            
            message = response.choices[0].message
            content = message.content or ""
            reasoning = getattr(message, "reasoning_content", None)
            
            print(f"\n响应长度: {len(content)} 字符")
            print(f"has reasoning_content: {reasoning is not None}")
            
            if reasoning:
                print(f"\n✅ 找到 reasoning_content!")
                print(f"思维链长度: {len(str(reasoning))} 字符")
                print(f"思维链预览: {str(reasoning)[:300]}")
            
            has_think = '<think>' in content or '<thought>' in content.lower()
            if has_think:
                print(f"\n✅ 响应中包含思维链标签")
                print(f"内容预览: {content[:300]}")
            else:
                print(f"\n❌ 未找到思维链")
                print(f"响应内容: {content[:300]}")
            
        except Exception as e:
            print(f"\n❌ 错误: {e}")
    
    await client.close()


if __name__ == "__main__":
    asyncio.run(test_openai_sdk_direct())
