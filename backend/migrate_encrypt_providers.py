"""
One-shot migration: encrypt plaintext api_keys in providers.json.
Run once after setting PROVIDERS_ENCRYPTION_KEY in your .env.

Usage:
    cd backend
    python migrate_encrypt_providers.py
"""

import json
import os
import sys
from pathlib import Path

# Bootstrap env
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / ".env")

from app.services.crypto import encrypt_key, is_encrypted

PROVIDERS_FILE = Path(__file__).parent / "data" / "providers.json"

if not PROVIDERS_FILE.exists():
    print("providers.json not found, nothing to migrate.")
    sys.exit(0)

with open(PROVIDERS_FILE, "r", encoding="utf-8") as f:
    data = json.load(f)

migrated = 0
for item in data:
    key = item.get("api_key")
    if key and not is_encrypted(key):
        item["api_key"] = encrypt_key(key)
        migrated += 1

with open(PROVIDERS_FILE, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=4)

print(f"Done. {migrated} key(s) encrypted.")
