"""
测试 Gemma 4 thinking mode - 尝试不同的参数格式

运行: cd backend && python scripts/test_gemma4_thinking_v2.py
"""
import asyncio
import sys
from pathlib import Path

backend_root = Path(__file__).resolve().parent.parent
if str(backend_root) not in sys.path:
    sys.path.insert(0, str(backend_root))

from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage


async def test_thinking_with_params(params_name: str, extra_body: dict):
    """使用指定参数测试 thinking mode"""
    print(f"\n{'=' * 80}")
    print(f"🧪 测试参数格式: {params_name}")
    print(f"📋 extra_body: {extra_body}")
    print("=" * 80)
    
    llm = ChatOpenAI(
        model="google-gemma-4-31b-it",
        api_key="sk-eWvDVMPY6Ph6v8fH26gvEVOAyh1ZtzxizsPlM4Vt284LnxMH",
        base_url="https://api.icecola.eu.cc/v1",
        temperature=0.7,
        max_tokens=4096,
        extra_body=extra_body,
        streaming=True,
    )
    
    messages = [
        SystemMessage(content="你是一个有帮助的助手。"),
        HumanMessage(content="量子计算是什么？"),
    ]
    
    try:
        collected_tokens = []
        async for chunk in llm.astream(messages):
            content = chunk.content
            if content:
                if isinstance(content, str):
                    collected_tokens.append(content)
                elif isinstance(content, list):
                    for item in content:
                        if isinstance(item, dict) and 'text' in item:
                            collected_tokens.append(item['text'])
        
        full_content = ''.join(collected_tokens)
        
        print(f"\n📝 响应长度: {len(full_content)} 字符")
        
        # 检查各种可能的思维链标签
        checks = {
            '<think>': '<think>' in full_content,
            '</think>': '</think>' in full_content,
            '<thought>': '<thought>' in full_content.lower(),
            '</thought>': '</thought>' in full_content.lower(),
            '<|channel>thought': '<|channel>thought' in full_content,
            '<channel|>': '<channel|>' in full_content,
        }
        
        print("\n🔍 标签检查:")
        for tag, found in checks.items():
            status = "✅" if found else "❌"
            print(f"  {status} {tag}: {found}")
        
        thinking_found = any(v for v in checks.values())
        
        if thinking_found:
            print("\n✅ 找到思维链!")
            # 提取并显示思维链内容
            for tag_start, tag_end in [
                ('<think>', '</think>'),
                ('<thought>', '</thought>'),
                ('<|channel>thought', '<channel|>')
            ]:
                start = full_content.lower().find(tag_start.lower())
                if start != -1:
                    end = full_content.lower().find(tag_end.lower(), start)
                    if end == -1:
                        end = len(full_content)
                    else:
                        end += len(tag_end)
                    print(f"\n💭 思维链内容 (使用 {tag_start} 标签):")
                    print(full_content[start:end])
                    break
        else:
            print("\n❌ 未找到思维链")
            print(f"\n📄 响应内容 (前300字符):")
            print(full_content[:300])
        
        return thinking_found
        
    except Exception as e:
        print(f"\n❌ 错误: {e}")
        import traceback
        traceback.print_exc()
        return False


async def main():
    """测试不同的参数格式"""
    print("🔍 测试 Gemma 4 Thinking Mode - 多参数格式")
    
    test_cases = [
        # 测试 1: chat_template_kwargs 格式
        (
            "chat_template_kwargs",
            {
                "chat_template_kwargs": {
                    "enable_thinking": True
                }
            }
        ),
        # 测试 2: 直接 enable_thinking
        (
            "enable_thinking (direct)",
            {
                "enable_thinking": True
            }
        ),
        # 测试 3: thinking 对象格式
        (
            "thinking object",
            {
                "thinking": {
                    "type": "enabled"
                }
            }
        ),
    ]
    
    results = {}
    
    for name, extra_body in test_cases:
        thinking_found = await test_thinking_with_params(name, extra_body)
        results[name] = thinking_found
        await asyncio.sleep(1)  # 避免请求过快
    
    print("\n" + "=" * 80)
    print("📊 测试结果汇总:")
    print("=" * 80)
    for name, found in results.items():
        status = "✅" if found else "❌"
        print(f"  {status} {name}: {'找到思维链' if found else '未找到'}")


if __name__ == "__main__":
    asyncio.run(main())
