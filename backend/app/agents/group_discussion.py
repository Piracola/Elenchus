"""Group discussion node for standard debates."""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

from app.agents.config_resolver import resolve_agent_override
from app.agents.context_builder import build_runtime_context_for_agent
from app.agents.context_engine import build_context_helper_override
from app.agents.live_agent_config import refresh_agent_configs_for_session
from app.agents.prompt_loader import get_group_discussion_prompt
from app.agents.runtime_progress import (
    MODEL_HEARTBEAT_INTERVAL_SECONDS,
    MODEL_INVOCATION_TIMEOUT_SECONDS,
    build_status_heartbeat_callback,
    build_usage_callback,
)
from app.agents.speech_limits import (
    build_speech_limit_instruction,
    get_role_speech_limit_chars,
)
from app.llm.invoke import _sleep_before_retry, invoke_text_model, normalize_model_text
from app.text_repair import format_runtime_error_message

logger = logging.getLogger(__name__)

_MAX_GROUP_DISCUSSION_ROUNDS = 5
_GROUP_DISCUSSION_MAX_RETRIES = 3


def _coerce_discussion_rounds(value: Any) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return 0
    return max(0, min(_MAX_GROUP_DISCUSSION_ROUNDS, parsed))


def _coerce_turn(value: Any, fallback: int) -> int:
    if isinstance(value, int) and not isinstance(value, bool):
        return value
    try:
        return int(value)
    except (TypeError, ValueError):
        return fallback


def _format_group_discussion_error(exc: Exception) -> str:
    message = format_runtime_error_message(exc).strip()
    if not message:
        return "组内讨论生成失败，本轮将直接进入正式发言。"

    lowered = message.lower()
    normalized_message = message.rstrip("。.!！?？")
    if (
        "gateway time-out" in lowered
        or "gateway timeout" in lowered
        or "origin_gateway_timeout" in lowered
        or "超时" in normalized_message
    ):
        return "组内讨论生成失败：上游模型服务超时，本轮将直接进入正式发言。"
    return f"组内讨论生成失败：{normalized_message}。本轮将直接进入正式发言。"


def _current_turn_group_discussions(state: dict[str, Any]) -> list[dict[str, Any]]:
    current_turn = _coerce_turn(state.get("current_turn", 0), 0)
    dialogue_history = state.get("dialogue_history", [])
    if not isinstance(dialogue_history, list):
        return []

    discussions = [
        entry
        for entry in dialogue_history
        if isinstance(entry, dict)
        and entry.get("role") == "group_discussion"
        and _coerce_turn(entry.get("turn", -1), -1) == current_turn
    ]
    return sorted(
        discussions,
        key=lambda entry: (
            _coerce_turn(entry.get("discussion_round", 0), 0),
            str(entry.get("timestamp", "") or ""),
        ),
    )


def _build_instruction(
    state: dict[str, Any],
    *,
    round_index: int,
    prior_discussions: list[str],
) -> str:
    topic = str(state.get("topic", "") or "")
    current_turn = int(state.get("current_turn", 0) or 0)
    max_turns = int(state.get("max_turns", 5) or 5)
    context_block = build_runtime_context_for_agent(
        state,
        agent_role="group_discussion",
        topic=topic,
        current_turn=current_turn,
        max_turns=max_turns,
        live_constraints=[
            "只输出本轮赛前讨论纪要，不要替任何一方写完整发言。",
        ],
    )

    parts = [
        f"辩题：{topic}",
        f"当前是第 {current_turn + 1} / {max_turns} 回合开始前的组内讨论，第 {round_index + 1} 次讨论。",
        "请只输出本轮赛前讨论纪要，供本轮正式辩手吸收，不要替任何一方直接写完整发言。",
        "建议结构：",
        "1. 本轮最值得展开的争议焦点",
        "2. 正方可推进的论证角度与证据需求",
        "3. 反方可推进的反驳角度与证据需求",
        "4. 双方都应避免的薄弱论证或跑题风险",
        "5. 本轮最值得追问的问题",
        context_block,
    ]

    if prior_discussions:
        parts.append("## 此前组内讨论")
        for index, discussion in enumerate(prior_discussions, start=1):
            parts.append(f"### 讨论 {index}\n{discussion}")
        parts.append("请避免重复此前讨论，继续推进分析。")

    speech_limit_instruction = build_speech_limit_instruction(
        get_role_speech_limit_chars(state.get("speech_config", {}), "group_discussion")
    )
    if speech_limit_instruction:
        parts.append(speech_limit_instruction)

    return "\n\n".join(parts)


async def run_group_discussion(state: dict[str, Any]) -> dict[str, Any]:
    """Generate configured group discussion notes for the current turn."""
    reasoning_config = state.get("reasoning_config", {})
    if not isinstance(reasoning_config, dict):
        return {}

    rounds = _coerce_discussion_rounds(reasoning_config.get("group_discussion_rounds", 0))
    if rounds <= 0:
        return {}

    existing_discussions = _current_turn_group_discussions(state)
    rounds_to_generate = max(0, rounds - len(existing_discussions))
    if rounds_to_generate <= 0:
        return {}

    session_id = str(state.get("session_id", "") or "")
    runtime_event_emitter = state.get("runtime_event_emitter")
    if session_id and runtime_event_emitter is not None:
        await runtime_event_emitter.emit_runtime_event(
            session_id=session_id,
            event_type="status",
            payload={
                "content": "组内讨论正在生成本轮赛前简报...",
                "node": "group_discussion",
            },
            source="runtime.node.group_discussion",
            phase="processing",
        )

    agent_configs = await refresh_agent_configs_for_session(state)
    override = resolve_agent_override(agent_configs, "group_discussion")
    context_override = await build_context_helper_override()
    if isinstance(context_override, dict):
        override = {
            **(override if isinstance(override, dict) else {}),
            **context_override,
        }
    custom_prompt = ""
    agent_name = "组内讨论"
    if isinstance(override, dict):
        custom_prompt = str(override.get("custom_prompt", "") or "")
        agent_name = str(override.get("custom_name", "") or "") or agent_name

    system_prompt = get_group_discussion_prompt()
    if custom_prompt:
        system_prompt += f"\n\n## Custom Group Discussion Instructions\n{custom_prompt}"

    entries: list[dict[str, Any]] = []
    prior_discussions: list[str] = [
        str(entry.get("content", "") or "")
        for entry in existing_discussions
        if str(entry.get("content", "") or "").strip()
    ]
    progress_callback = build_status_heartbeat_callback(
        state,
        node_name="group_discussion",
        template="组内讨论仍在生成，已等待 {seconds} 秒...",
    )
    usage_callback = build_usage_callback(state, node_name="group_discussion")

    for offset in range(rounds_to_generate):
        round_index = len(existing_discussions) + offset
        content = ""
        last_error: Exception | None = None
        for attempt_index in range(_GROUP_DISCUSSION_MAX_RETRIES):
            try:
                content = await invoke_text_model(
                    [
                        SystemMessage(content=system_prompt),
                        HumanMessage(
                            content=_build_instruction(
                                state,
                                round_index=round_index,
                                prior_discussions=prior_discussions,
                            )
                        ),
                    ],
                    override=override,
                    on_progress=progress_callback,
                    on_usage=usage_callback,
                    timeout_seconds=MODEL_INVOCATION_TIMEOUT_SECONDS,
                    heartbeat_interval_seconds=MODEL_HEARTBEAT_INTERVAL_SECONDS,
                    max_retries=0,
                )
                content = normalize_model_text(content)
                last_error = None
                break
            except Exception as exc:
                last_error = exc
                if attempt_index < _GROUP_DISCUSSION_MAX_RETRIES - 1:
                    logger.warning(
                        "Group discussion failed on round %d attempt %d/%d: %s",
                        round_index + 1,
                        attempt_index + 1,
                        _GROUP_DISCUSSION_MAX_RETRIES,
                        exc,
                    )
                    await _sleep_before_retry(exc, attempt_index)
                    continue
        if last_error is not None:
            logger.error(
                "Group discussion failed on round %d after retries: %s",
                round_index + 1,
                last_error,
            )
            content = _format_group_discussion_error(last_error)

        prior_discussions.append(content)
        entries.append(
            {
                "role": "group_discussion",
                "agent_name": agent_name,
                "content": content,
                "citations": [],
                "timestamp": datetime.now(UTC).isoformat(),
                "turn": int(state.get("current_turn", 0) or 0),
                "discussion_kind": "group_discussion",
                "discussion_round": round_index + 1,
            }
        )

    return {
        "dialogue_history": entries,
        "recent_dialogue_history": [
            *(
                state.get("recent_dialogue_history", [])
                if isinstance(state.get("recent_dialogue_history"), list)
                else []
            ),
            *entries,
        ],
        "agent_configs": agent_configs,
    }
