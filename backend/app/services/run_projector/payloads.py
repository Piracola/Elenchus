from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from app.models.ledger import SessionRecord

_DOCUMENT_CONTEXT_LIMIT = 12000


def _utcnow() -> datetime:
    return datetime.now(UTC)


def default_projection(session: SessionRecord) -> dict[str, Any]:
    return {
        "topic": session.topic,
        "debate_mode": session.debate_mode,
        "mode_config": session.mode_config or {},
        "participants": session.participants or [],
        "max_turns": session.max_turns,
        "dialogue_history": [],
        "judge_history": [],
        "shared_knowledge": [],
        "current_scores": {},
        "cumulative_scores": {},
        "token_usage": {"total": {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0, "calls": 0}, "by_role": {}},
        "mode_artifacts": [],
        "current_mode_report": None,
        "final_mode_report": None,
        "builtin_reference_docs": [],
        "reasoning_config": session.reasoning_config or {},
        "speech_config": session.speech_config or {},
        "agent_configs": session.agent_configs or {},
        "last_executed_node": "",
        "last_progress_at": "",
        "last_status_message": "",
        "resume_count": 0,
        "interrupted_at": None,
    }


def document_context_entry(
    *,
    document_id: str,
    filename: str,
    normalized_text: str | None,
) -> dict[str, Any] | None:
    text = str(normalized_text or "").strip()
    if not text:
        return None
    content = text
    if len(content) > _DOCUMENT_CONTEXT_LIMIT:
        content = content[:_DOCUMENT_CONTEXT_LIMIT].rstrip() + "\n\n[内容已截断，仅保留前文作为辩论背景。]"
    return {
        "type": "context",
        "source_kind": "session_document",
        "document_id": document_id,
        "document_name": filename,
        "title": filename,
        "content": content,
    }

