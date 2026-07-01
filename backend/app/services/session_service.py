from __future__ import annotations

from typing import Any

from app.db.db_utils import _gen_id, _utcnow
from app.dependencies import get_agent_config_service
from app.models.schemas import SessionCreate
from app.services.run_ledger_service import RunLedgerService
from app.services.session_service_helpers import effective_configs_for_mode, normalize_mode_config

_ledger = RunLedgerService()


async def create_session(body: SessionCreate) -> dict[str, Any]:
    agent_config_service = get_agent_config_service()
    debate_mode = body.debate_mode.value
    mode_config = normalize_mode_config(debate_mode, body.mode_config)
    reasoning_config = effective_configs_for_mode(
        debate_mode,
        body.reasoning_config.model_dump(),
    )
    agent_configs = await agent_config_service.build_session_agent_configs(
        body.agent_configs,
        body.participants,
    )
    record = await _ledger.create_session(
        {
            "id": _gen_id(),
            "topic": body.topic,
            "debate_mode": debate_mode,
            "participants": list(body.participants),
            "max_turns": body.max_turns,
            "mode_config": mode_config,
            "agent_configs": agent_configs,
            "reasoning_config": reasoning_config,
            "speech_config": body.speech_config.model_dump(),
            "created_at": _utcnow(),
            "updated_at": _utcnow(),
        }
    )
    return await get_session(record.id) or {}


async def list_sessions(offset: int = 0, limit: int = 50) -> list[dict[str, Any]]:
    return await _ledger.list_sessions(offset=offset, limit=limit)


async def count_sessions() -> int:
    return await _ledger.count_sessions()


async def get_session(session_id: str) -> dict[str, Any] | None:
    return await _ledger.get_session(session_id)


async def get_session_record(session_id: str):
    return await _ledger.get_session_record(session_id)


async def update_session_agent_configs(
    session_id: str,
    agent_configs: dict[str, dict[str, Any]] | None,
) -> dict[str, Any] | None:
    return await _ledger.update_session_agent_configs(session_id, agent_configs)


async def delete_session(session_id: str) -> bool:
    return await _ledger.delete_session(session_id)


async def list_session_documents(session_id: str) -> list[dict[str, Any]]:
    return await _ledger.session_documents(session_id)
