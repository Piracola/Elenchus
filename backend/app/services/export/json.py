from __future__ import annotations

import json
from typing import Any


def export_json(session_data: dict[str, Any]) -> str:
    return json.dumps(session_data, ensure_ascii=False, indent=2, default=str)
