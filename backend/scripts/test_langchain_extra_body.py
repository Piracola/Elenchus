"""
直接测试 LangChain ChatOpenAI 的 extra_body 参数

运行: cd backend && python scripts/test_langchain_extra_body.py
"""
import asyncio
import sys
from pathlib import Path

backend_root = Path(__file__).resolve().parent.parent
if str(backend_root) not in sys.path:
    sys.path.insert(0, str(backend_root))

from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage


async def test_extra_body():
    """测试 extra_body 参数"""
    print("🔍 测试 LangChain ChatOpenAI 的 extra_body 参数")
    print("=" * 80)
    
    # 创建 ChatOpenAI 实例，启用 thinking mode
    llm = ChatOpenAI(
        model="google-gemma-4-31b-it",
        api_key="sk-eWvDVMPY6Ph6v8fH26gvEVOAyh1ZtzxizsPlM4Vt284LnxMH",
        base_url="https://api.icecola.eu.cc/v1",
        temperature=0.7,
        max_tokens=2048,
        extra_body={
            "chat_template_kwargs": {
                "enable_thinking": True
            }
        }
    )
    
    print(f"✅ 模型: google-gemma-4-31b-it")
    print(f"✅ API URL: https://api.icecola.eu.cc/v1")
    print(f"✅ extra_body: {llm.extra_body}")
    print("-" * 80)
    
    messages = [
        SystemMessage(content="你是一个有帮助的助手。"),
        HumanMessage(content="请解释量子计算是什么？"),
    ]
    
    print("\n🚀 开始调用模型...\n")
    
    collected_tokens = []
    
    async for chunk in llm.astream(messages):
        content = chunk.content
        if content:
            if isinstance(content, str):
                collected_tokens.append(content)
                print(content, end="", flush=True)
            elif isinstance(content, list):
                for item in content:
                    if isinstance(item, dict) and 'text' in item:
                        collected_tokens.append(item['text'])
                        print(item['text'], end="", flush=True)
    
    full_content = ''.join(collected_tokens)
    
    print("\n" + "=" * 80)
    print("📊 调试信息:")
    print("=" * 80)
    
    print(f"\n📝 响应长度: {len(full_content)} 字符")
    print(f"✅ 包含 <think> 标签: {'<think>' in full_content}")
    print(f"✅ 包含 <thought> 标签: {'<thought>' in full_content.lower()}")
    
    if '<think>' in full_content or '<thought>' in full_content.lower():
        print("\n💭 找到思维链内容!")
    else:
        print("\n❌ 未找到思维链")
        print("\n📄 响应内容 (前500字符):")
        print(full_content[:500])


if __name__ == "__main__":
    asyncio.run(test_extra_body())
