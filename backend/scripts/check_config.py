"""查看配置文件结构"""
import sys
from pathlib import Path

backend_root = Path(__file__).resolve().parent.parent
if str(backend_root) not in sys.path:
    sys.path.insert(0, str(backend_root))

from app.runtime_config_store import load_runtime_config
import json

config = load_runtime_config()
print("配置结构:")
print(json.dumps(config, ensure_ascii=False, indent=2))
