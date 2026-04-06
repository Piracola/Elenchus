"""
测试 Gemma 4 thinking mode 启用参数

根据 Google 官方文档，Gemma 4 支持 thinking mode，启用方式取决于 API 服务端：
1. vLLM OpenAI-compatible API: extra_body={"chat_template_kwargs": {"enable_thinking": true}}
2. 某些服务可能直接使用 enable_thinking: true

运行: cd backend && python scripts/test_gemma4_thinking.py
"""
import asyncio
import sys
from pathlib import Path

backend_root = Path(__file__).resolve().parent.parent
if str(backend_root) not in sys.path:
    sys.path.insert(0, str(backend_root))

from app.agents.safe_invoke import invoke_chat_model
from app.runtime_config_store import load_runtime_config


def get_model_config_with_thinking(model_name: str):
    """从配置文件读取模型配置并启用 thinking mode"""
    config = load_runtime_config()
    providers = config.get("providers", [])
    
    for provider in providers:
        models = provider.get("models", [])
        if model_name in models:
            return {
                "provider_type": provider.get("provider_type", "openai"),
                "model": model_name,
                "api_base_url": provider.get("api_base_url"),
                "api_key": provider.get("api_key"),
                "temperature": 0.7,
                "max_tokens": provider.get("default_max_tokens", 128000),
                # 尝试不同的 thinking 参数
                "custom_parameters": {
                    "extra_body": {
                        "chat_template_kwargs": {
                            "enable_thinking": True
                        }
                    }
                }
            }
    
    return None


async def test_gemma4_thinking():
    """测试 Gemma 4 thinking mode"""
    model_name = "google-gemma-4-31b-it"
    
    print(f"🔍 测试模型: {model_name}")
    print(f"💡 尝试启用 thinking mode")
    print("=" * 80)
    
    test_config = get_model_config_with_thinking(model_name)
    
    if not test_config:
        print("❌ 未找到配置")
        return
    
    print(f"✅ API URL: {test_config['api_base_url']}")
    print(f"✅ API Key: {'已配置' if test_config.get('api_key') else '未配置'}")
    print(f"✅ Max Tokens: {test_config['max_tokens']}")
    print(f"✅ Custom Parameters: {test_config['custom_parameters']}")
    print("-" * 80)
    
    messages = [
        {"role": "system", "content": "你是一个有帮助的助手。"},
        {"role": "user", "content": "请解释量子计算是什么？"}
    ]
    
    collected_tokens = []
    
    async def on_token(token: str):
        collected_tokens.append(token)
        print(token, end="", flush=True)
    
    try:
        print("\n🚀 开始调用模型...\n")
        response = await invoke_chat_model(
            messages,
            override=test_config,
            on_token=on_token,
            timeout_seconds=180.0,
        )
        
        print("\n" + "=" * 80)
        print("📊 调试信息:")
        print("=" * 80)
        
        if hasattr(response, 'content'):
            content = response.content
            print(f"\n📝 content 总长度: {len(content)} 字符")
            
            # 检查思维链标签
            has_think_open = '<think>' in content or '<thought>' in content.lower()
            has_think_close = '</think>' in content or '</thought>' in content.lower()
            
            print(f"✅ 包含 <think> 或 <thought> 标签: {has_think_open}")
            print(f"✅ 包含 </think> 或 </thought> 标签: {has_think_close}")
            print(f"✅ 包含 reasoning_content 属性: {hasattr(response, 'reasoning_content')}")
            
            if has_think_open:
                print("\n💭 思维链内容:")
                # 提取思维链部分
                for tag_start, tag_end in [('<think>', '</think>'), ('<thought>', '</thought>')]:
                    start = content.find(tag_start)
                    if start != -1:
                        end = content.find(tag_end, start)
                        if end == -1:
                            end = len(content)
                        else:
                            end += len(tag_end)
                        print(content[start:end])
                        break
            else:
                print(f"\n📄 响应内容 (前500字符):")
                print(content[:500])
            
            if hasattr(response, 'additional_kwargs'):
                print(f"\n🔍 additional_kwargs: {response.additional_kwargs}")
            
            if hasattr(response, 'model_extra'):
                print(f"\n🔍 model_extra: {response.model_extra}")
        
        print(f"\n\n📈 统计信息:")
        print(f"  收集的 token 数量: {len(collected_tokens)}")
        print(f"  收集的 token 总长度: {len(''.join(collected_tokens))} 字符")
        
    except Exception as e:
        print(f"\n❌ 错误: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(test_gemma4_thinking())
