"""
端到端测试：使用 LangChain ChatOpenAI + extra_body 调用真实 API

验证思考模式参数是否正确传递到服务端
"""
import asyncio
import sys
from pathlib import Path

backend_root = Path(__file__).resolve().parent.parent
if str(backend_root) not in sys.path:
    sys.path.insert(0, str(backend_root))

from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage


async def test_e2e_thinking():
    """端到端测试 thinking mode"""
    print("🔍 端到端测试：LangChain ChatOpenAI + extra_body")
    print("=" * 80)
    
    # 创建 ChatOpenAI 实例，启用 thinking mode
    llm = ChatOpenAI(
        model="google-gemma-4-31b-it",
        api_key="sk-eWvDVMPY6Ph6v8fH26gvEVOAyh1ZtzxizsPlM4Vt284LnxMH",
        base_url="https://api.icecola.eu.cc/v1",
        temperature=0.7,
        max_tokens=4096,
        extra_body={
            "chat_template_kwargs": {
                "enable_thinking": True
            }
        },
        streaming=True,
    )
    
    print(f"模型: {llm.model_name}")
    print(f"API URL: https://api.icecola.eu.cc/v1")
    print(f"extra_body: {llm.extra_body}")
    print("-" * 80)
    
    messages = [
        SystemMessage(content="你是一个有帮助的助手。"),
        HumanMessage(content="量子计算是什么？"),
    ]
    
    print("\n🚀 发送请求...\n")
    
    collected_tokens = []
    async for chunk in llm.astream(messages):
        content = chunk.content
        if content:
            if isinstance(content, str):
                collected_tokens.append(content)
                # 只打印前200个字符
                full = ''.join(collected_tokens)
                if len(full) <= 200:
                    print(content, end="", flush=True)
    
    full_content = ''.join(collected_tokens)
    
    print("\n" + "=" * 80)
    print("📊 响应分析:")
    print("=" * 80)
    
    print(f"\n响应长度: {len(full_content)} 字符")
    
    # 检查思维链标签
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
        # 提取并显示
        for tag_start, tag_end in [
            ('<think>', '</think>'),
            ('<thought>', '</thought>'),
            ('<|channel>thought', '<channel|>')
        ]:
            start = full_content.lower().find(tag_start.lower())
            if start != -1:
                end = full_content.lower().find(tag_end.lower(), start)
                if end == -1:
                    end = min(start + 500, len(full_content))
                else:
                    end += len(tag_end)
                print(f"\n💭 思维链内容 (使用 {tag_start} 标签):")
                print(full_content[start:end])
                break
    else:
        print("\n❌ 未找到思维链")
        print(f"\n📄 完整响应 (前500字符):")
        print(full_content[:500])


if __name__ == "__main__":
    asyncio.run(test_e2e_thinking())
