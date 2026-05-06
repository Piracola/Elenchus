"""File-backed agent persona library under runtime/agent_personas."""

from __future__ import annotations

import hashlib
import logging
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.runtime_paths import get_runtime_paths

logger = logging.getLogger(__name__)

SUPPORTED_PERSONA_SUFFIXES = {".md", ".markdown", ".txt"}
FRONTMATTER_DELIMITER = "---"


@dataclass(frozen=True)
class AgentPersona:
    id: str
    name: str
    description: str
    roles: list[str]
    filename: str
    content: str

    def summary(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "roles": self.roles,
            "filename": self.filename,
        }

    def detail(self) -> dict[str, Any]:
        return {
            **self.summary(),
            "content": self.content,
        }


class AgentPersonaService:
    """Read user-editable persona files from the runtime persona folder."""

    def __init__(self, personas_dir: Path | None = None) -> None:
        self._personas_dir = personas_dir or get_runtime_paths().agent_personas_dir

    @property
    def personas_dir(self) -> Path:
        return self._personas_dir

    def list_personas(self) -> list[dict[str, Any]]:
        return [persona.summary() for persona in self._load_personas()]

    def get_persona(self, persona_id: str) -> dict[str, Any] | None:
        normalized_id = str(persona_id or "").strip()
        if not normalized_id:
            return None
        for persona in self._load_personas():
            if persona.id == normalized_id:
                return persona.detail()
        return None

    def build_config_snapshot(self, persona_id: str) -> dict[str, Any] | None:
        persona = self.get_persona(persona_id)
        if not persona:
            return None
        return {
            "persona_id": persona["id"],
            "persona_name": persona["name"],
            "persona_filename": persona["filename"],
            "custom_name": persona["name"],
            "custom_prompt": persona["content"],
        }

    def _load_personas(self) -> list[AgentPersona]:
        self._personas_dir.mkdir(parents=True, exist_ok=True)
        personas: list[AgentPersona] = []
        for path in sorted(self._personas_dir.iterdir(), key=lambda item: item.name.lower()):
            if not path.is_file() or path.suffix.lower() not in SUPPORTED_PERSONA_SUFFIXES:
                continue
            try:
                personas.append(self._load_persona_file(path))
            except Exception as exc:
                logger.warning("Failed to load persona file %s: %s", path, exc)
        return personas

    def _load_persona_file(self, path: Path) -> AgentPersona:
        text = _read_persona_text(path)
        metadata, content = _split_frontmatter(text)
        name = _metadata_text(metadata, "name") or path.stem
        description = _metadata_text(metadata, "description")
        roles = _metadata_roles(metadata.get("roles"))
        if not description:
            description = _first_content_line(content)
        return AgentPersona(
            id=_persona_id_for(path, self._personas_dir),
            name=name,
            description=description,
            roles=roles,
            filename=path.name,
            content=content.strip(),
        )


def _read_persona_text(path: Path) -> str:
    raw = path.read_bytes()
    for encoding in ("utf-8-sig", "utf-8", "gb18030"):
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="replace")


def _persona_id_for(path: Path, root: Path) -> str:
    try:
        relative = path.relative_to(root).as_posix()
    except ValueError:
        relative = path.name
    digest = hashlib.sha1(relative.encode("utf-8")).hexdigest()[:12]
    return digest


def _split_frontmatter(text: str) -> tuple[dict[str, Any], str]:
    normalized = text.replace("\r\n", "\n").replace("\r", "\n")
    lines = normalized.split("\n")
    if not lines or lines[0].strip() != FRONTMATTER_DELIMITER:
        return {}, normalized

    for index in range(1, len(lines)):
        if lines[index].strip() == FRONTMATTER_DELIMITER:
            return _parse_frontmatter_lines(lines[1:index]), "\n".join(lines[index + 1 :])
    return {}, normalized


def _parse_frontmatter_lines(lines: list[str]) -> dict[str, Any]:
    metadata: dict[str, Any] = {}
    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or ":" not in stripped:
            continue
        key, value = stripped.split(":", 1)
        metadata[key.strip().lower()] = value.strip()
    return metadata


def _metadata_text(metadata: dict[str, Any], key: str) -> str:
    value = metadata.get(key)
    if value is None:
        return ""
    text = str(value).strip().strip("\"'")
    return text[:500]


def _metadata_roles(value: Any) -> list[str]:
    if value is None:
        return []
    text = str(value).strip()
    if not text:
        return []
    if text.startswith("[") and text.endswith("]"):
        text = text[1:-1]
    roles = [item.strip().strip("\"'") for item in text.split(",")]
    return [role for role in roles if re.fullmatch(r"[a-zA-Z0-9_:-]+", role)]


def _first_content_line(content: str) -> str:
    for line in content.splitlines():
        stripped = line.strip().lstrip("#").strip()
        if stripped:
            return stripped[:160]
    return ""
