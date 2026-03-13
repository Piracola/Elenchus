import json
import logging
import uuid
from datetime import datetime
from pathlib import Path

from app.config import get_settings
from app.models.schemas import ModelConfigCreate, ModelConfigUpdate, ModelConfigResponse

logger = logging.getLogger(__name__)

# Usually we'd put this in a configurable data dir, but project root is fine for now
_PROVIDERS_FILE = get_settings().project_root / "data" / "providers.json"

class ProviderService:
    def __init__(self):
        # Ensure directory exists
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
        data = self._read_data()
        # Sort so defaults are at the top, then by creation date descending
        data.sort(key=lambda x: (not x.get("is_default", False), x.get("created_at", "")), reverse=True)
        return [ModelConfigResponse(**item) for item in data]

    def get_default_config(self) -> ModelConfigResponse | None:
        data = self._read_data()
        for item in data:
            if item.get("is_default"):
                return ModelConfigResponse(**item)
        return None

    def create_config(self, config_in: ModelConfigCreate) -> ModelConfigResponse:
        data = self._read_data()
        
        # Enforce unique name
        if any(item["name"] == config_in.name for item in data):
            raise ValueError("A model configuration with this name already exists.")

        now = datetime.utcnow().isoformat() + "Z"
        
        # If this is the first config being added, make it default automatically
        # Or if the user explicitly requested it to be default
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
        data = self._read_data()
        target_idx = next((i for i, item in enumerate(data) if item["id"] == config_id), None)
        
        if target_idx is None:
            return None

        update_data = config_in.model_dump(exclude_unset=True)
        now = datetime.utcnow().isoformat() + "Z"
        
        # Handle default toggling
        if update_data.get("is_default") is True:
            self._clear_defaults(data)

        data[target_idx].update(update_data)
        data[target_idx]["updated_at"] = now
        
        self._write_data(data)
        return ModelConfigResponse(**data[target_idx])

    def delete_config(self, config_id: str) -> bool:
        data = self._read_data()
        initial_length = len(data)
        
        # Find if we are deleting the default
        was_default = any(item["id"] == config_id and item.get("is_default") for item in data)
        
        data = [item for item in data if item["id"] != config_id]
        
        if len(data) == initial_length:
            return False
            
        # Reassign default if we deleted it and there are others left
        if was_default and len(data) > 0:
            data[0]["is_default"] = True
            
        self._write_data(data)
        return True

    def _clear_defaults(self, data: list[dict]) -> None:
        for item in data:
            item["is_default"] = False

# Singleton instance
provider_service = ProviderService()
