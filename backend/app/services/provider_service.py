import json
import logging
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path

from app.config import get_settings
from app.models.schemas import ModelConfigCreate, ModelConfigUpdate, ModelConfigResponse

logger = logging.getLogger(__name__)

_PROVIDERS_FILE = get_settings().project_root / "data" / "providers.json"

class ProviderService:
    def __init__(self):
        self._lock = threading.RLock()
        _PROVIDERS_FILE.parent.mkdir(parents=True, exist_ok=True)
        if not _PROVIDERS_FILE.exists():
            self._write_data([])

    def _read_data(self) -> list[dict]:
        try:
            with open(_PROVIDERS_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                return data if isinstance(data, list) else []
        except (json.JSONDecodeError, FileNotFoundError):
            return []

    def _write_data(self, data: list[dict]) -> None:
        with open(_PROVIDERS_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=4)

    def list_configs(self) -> list[ModelConfigResponse]:
        with self._lock:
            data = self._read_data()
        data.sort(key=lambda x: (not x.get("is_default", False), x.get("created_at", "")), reverse=True)
        return [ModelConfigResponse(**item) for item in data]

    def list_configs_raw(self) -> list[dict]:
        """Return raw dicts with api_key for internal server-side use."""
        with self._lock:
            data = self._read_data()
        return [dict(item) for item in data]

    def get_default_config(self) -> ModelConfigResponse | None:
        with self._lock:
            data = self._read_data()
        for item in data:
            if item.get("is_default"):
                return ModelConfigResponse(**item)
        return None

    def create_config(self, config_in: ModelConfigCreate) -> ModelConfigResponse:
        with self._lock:
            data = self._read_data()

            if any(item["name"] == config_in.name for item in data):
                raise ValueError("A model configuration with this name already exists.")

            now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"

            make_default = config_in.is_default or len(data) == 0

            new_item = {
                "id": str(uuid.uuid4()),
                "name": config_in.name,
                "provider_type": config_in.provider_type,
                "api_key": config_in.api_key,
                "api_base_url": config_in.api_base_url,
                "models": config_in.models,
                "is_default": make_default,
                "created_at": now,
                "updated_at": now,
            }

            if make_default:
                self._clear_defaults(data)

            data.append(new_item)
            self._write_data(data)
        return ModelConfigResponse(**new_item)

    def update_config(self, config_id: str, config_in: ModelConfigUpdate) -> ModelConfigResponse | None:
        with self._lock:
            data = self._read_data()
            target_idx = next((i for i, item in enumerate(data) if item["id"] == config_id), None)

            if target_idx is None:
                return None

            update_data = config_in.model_dump(exclude_unset=True)
            now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"

            if update_data.get("is_default") is True:
                self._clear_defaults(data)

            data[target_idx].update(update_data)
            data[target_idx]["updated_at"] = now

            self._write_data(data)
            result = data[target_idx]
        return ModelConfigResponse(**result)

    def delete_config(self, config_id: str) -> bool:
        with self._lock:
            data = self._read_data()
            initial_length = len(data)

            was_default = any(item["id"] == config_id and item.get("is_default") for item in data)

            data = [item for item in data if item["id"] != config_id]

            if len(data) == initial_length:
                return False

            if was_default and len(data) > 0:
                data[0]["is_default"] = True

            self._write_data(data)
        return True

    def _clear_defaults(self, data: list[dict]) -> None:
        for item in data:
            item["is_default"] = False


provider_service = ProviderService()
