"""
详细测试 google-gemma-4-31b-it 模型的响应结构

运行: cd backend && python scripts/test_thinking_chain_detailed.py
"""
import asyncio
import sys
from pathlib import Path

backend_root = Path(__file__).resolve().parent.parent
if str(backend_root) not in sys.path:
    sys.path.insert(0, str(backend_root))

from app.agents.openai_transport import invoke_openai_chat_raw_streaming
from app.agents.llm import ResolvedLLMConfig
from app.runtime_config_store import load_runtime_config
from langchain_core.messages import HumanMessage, SystemMessage


def get_resolved_config(model_name: str):
    """获取解析后的LLM配置"""
    config = load_runtime_config()
    providers = config.get("providers", [])
    
    for provider in providers:
        models = provider.get("models", [])
        if model_name in models:
            return ResolvedLLMConfig(
                provider_type=provider.get("provider_type", "openai"),
                model=model_name,
                api_base_url=provider.get("api_base_url"),
                api_key=provider.get("api_key"),
                temperature=0.7,
                max_tokens=provider.get("default_max_tokens", 128000),
                custom_parameters=provider.get("custom_parameters", {}),
            )
    return None


async def test_detailed_response():
    """详细测试模型响应"""
    model_name = "google-gemma-4-31b-it"
    
    print(f"🔍 测试模型: {model_name}")
    print("=" * 80)
    
    config = get_resolved_config(model_name)
    if not config:
        print("❌ 未找到配置")
        return
    
    print(f"✅ API URL: {config.api_base_url}")
    print(f"✅ API Key: {'已配置' if config.api_key else '未配置'}")
    print(f"✅ Max Tokens: {config.max_tokens}")
    print(f"✅ Custom Parameters: {config.custom_parameters}")
    print("-" * 80)
    
    messages = [
        SystemMessage(content="你是一个有帮助的助手。"),
        HumanMessage(content="请解释量子计算是什么？"),
    ]
    
    print("\n📡 发送请求...\n")
    
    all_chunks = []
    full_content_list = []
    
    async def on_token(token: str):
        all_chunks.append(token)
        full_content_list.append(token)
        # 只打印前100个字符避免刷屏
        if len(''.join(full_content_list)) <= 100:
            print(token, end="", flush=True)
    
    try:
        response = await invoke_openai_chat_raw_streaming(
            messages=messages,
            config=config,
            on_token=on_token,
        )
        
        print("\n" + "=" * 80)
        print("📊 详细分析:")
        print("=" * 80)
        
        print(f"\n响应类型: {type(response)}")
        print(f"\n所有属性:")
        for attr in dir(response):
            if not attr.startswith('_'):
                try:
                    value = getattr(response, attr)
                    if not callable(value):
                        print(f"  {attr}: {type(value).__name__} = {repr(value)[:100]}")
                except:
                    pass
        
        print(f"\n\n📝 完整响应内容长度: {len(''.join(full_content_list))} 字符")
        print(f"📦 Token 数量: {len(all_chunks)}")
        
        full_content = ''.join(full_content_list)
        
        # 检查是否包含思维链标记
        if '<think>' in full_content.lower():
            print("\n✅ 包含 <think> 标签")
        if '<think>' in full_content:
            print("\n✅ 包含 <think> 标签")
        if hasattr(response, 'reasoning_content'):
            print(f"\n✅ 包含 reasoning_content: {response.reasoning_content}")
        
        # 打印完整内容
        print("\n" + "=" * 80)
        print("完整内容:")
        print("=" * 80)
        print(full_content)
        
    except Exception as e:
        print(f"\n❌ 错误: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(test_detailed_response())
