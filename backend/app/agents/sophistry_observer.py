"""Observer/report nodes for the standalone sophistry experiment mode."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

from app.agents.runtime_progress import (
    MODEL_HEARTBEAT_INTERVAL_SECONDS,
    MODEL_INVOCATION_TIMEOUT_SECONDS,
    build_status_heartbeat_callback,
)
from app.llm.invoke import invoke_text_model, normalize_model_text
from app.agents.sophistry_prompt_loader import get_sophistry_observer_prompt

logger = logging.getLogger(__name__)


def _speaker_entries_for_turn(
    dialogue_history: Any,
    participants: list[str],
    current_turn: int,
) -> list[dict[str, Any]]:
    if not isinstance(dialogue_history, list):
        return []
    return [
        entry
        for entry in dialogue_history
        if isinstance(entry, dict)
        and entry.get("role") in participants
        and int(entry.get("turn", -1) if entry.get("turn", -1) is not None else -1) == current_turn
    ]


def _render_turn_excerpt(entries: list[dict[str, Any]]) -> str:
    if not entries:
        return "本轮暂无可分析的公开发言。"
    parts: list[str] = []
    for entry in entries:
        role = str(entry.get("role", "") or "")
        agent_name = str(entry.get("agent_name", role) or role)
        content = str(entry.get("content", "") or "")
        parts.append(f"### [{agent_name} / {role}]\n{content}")
    return "\n\n".join(parts)


def _render_artifact_digest(mode_artifacts: Any) -> str:
    if not isinstance(mode_artifacts, list) or not mode_artifacts:
        return "暂无已生成的观察报告。"

    parts: list[str] = []
    for artifact in mode_artifacts:
        if not isinstance(artifact, dict):
            continue
        title = str(artifact.get("title", artifact.get("type", "report")) or "report")
        content = str(artifact.get("content", "") or "")
        turn = artifact.get("turn")
        prefix = f"第 {int(turn) + 1} 轮" if isinstance(turn, int) else "全局"
        parts.append(f"## {prefix} / {title}\n{content}")
    return "\n\n".join(parts[-6:])


async def sophistry_observer_report(state: dict[str, Any]) -> dict[str, Any]:
    mode_config = state.get("mode_config", {})
    if isinstance(mode_config, dict) and not bool(mode_config.get("observer_enabled", True)):
        return {}

    participants = state.get("participants", ["proposer", "opposer"])
    current_turn = int(state.get("current_turn", 0) or 0)
    turn_entries = _speaker_entries_for_turn(
        state.get("dialogue_history", []),
        participants if isinstance(participants, list) else ["proposer", "opposer"],
        current_turn,
    )
    if not turn_entries:
        return {}

    system_prompt = get_sophistry_observer_prompt()
    prompt = (
        f"辩题：{state.get('topic', '')}\n"
        f"当前回合：第 {current_turn + 1} 轮\n\n"
        "请基于下面这组公开发言生成一份“诡辩观察报告”。\n\n"
        f"{_render_turn_excerpt(turn_entries)}"
    )

    agent_configs = state.get("agent_configs", {})
    override = agent_configs.get("observer") or agent_configs.get("judge")
    progress_callback = build_status_heartbeat_callback(
        state,
        node_name="sophistry_observer",
        template="诡辩观察员仍在分析本轮发言，已等待 {seconds} 秒...",
    )
    report = normalize_model_text(
        await invoke_text_model(
            [
                SystemMessage(content=system_prompt),
                HumanMessage(content=prompt),
            ],
            override=override,
            on_progress=progress_callback,
            timeout_seconds=MODEL_INVOCATION_TIMEOUT_SECONDS,
            heartbeat_interval_seconds=MODEL_HEARTBEAT_INTERVAL_SECONDS,
        )
    )

    entry = {
        "role": "sophistry_round_report",
        "agent_name": "诡辩观察员",
        "content": report,
        "citations": [],
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "turn": current_turn,
        "source_turn": current_turn,
        "source_roles": [
            str(item.get("role", "") or "")
            for item in turn_entries
            if isinstance(item, dict)
        ],
    }
    artifact = {
        "type": "sophistry_round_report",
        "title": "本轮观察",
        "turn": current_turn,
        "source_turn": current_turn,
        "source_roles": entry["source_roles"],
        "content": report,
        "created_at": entry["timestamp"],
    }

    logger.info("Sophistry observer created turn report for turn=%d", current_turn + 1)
    return {
        "dialogue_history": [entry],
        "mode_artifacts": [artifact],
        "current_mode_report": artifact,
    }


async def sophistry_final_report(state: dict[str, Any]) -> dict[str, Any]:
    mode_config = state.get("mode_config", {})
    if isinstance(mode_config, dict) and not bool(mode_config.get("observer_enabled", True)):
        return {}

    system_prompt = get_sophistry_observer_prompt()
    prompt = (
        f"辩题：{state.get('topic', '')}\n"
        f"总轮数：{int(state.get('current_turn', 0) or 0)}\n\n"
        "请基于整场实验生成一份最终总览，不要判输赢，不要打分。\n\n"
        f"{_render_artifact_digest(state.get('mode_artifacts', []))}\n\n"
        "如果已有阶段观察不足，请补充整场辩论中最关键的转折句与高频套路。"
    )

    agent_configs = state.get("agent_configs", {})
    override = agent_configs.get("observer") or agent_configs.get("judge")
    progress_callback = build_status_heartbeat_callback(
        state,
        node_name="sophistry_postmortem",
        template="诡辩实验总览仍在生成，已等待 {seconds} 秒...",
    )
    report = normalize_model_text(
        await invoke_text_model(
            [
                SystemMessage(content=system_prompt),
                HumanMessage(content=prompt),
            ],
            override=override,
            on_progress=progress_callback,
            timeout_seconds=MODEL_INVOCATION_TIMEOUT_SECONDS,
            heartbeat_interval_seconds=MODEL_HEARTBEAT_INTERVAL_SECONDS,
        )
    )

    timestamp = datetime.now(timezone.utc).isoformat()
    entry = {
        "role": "sophistry_final_report",
        "agent_name": "实验总览",
        "content": report,
        "citations": [],
        "timestamp": timestamp,
    }
    artifact = {
        "type": "sophistry_final_report",
        "title": "实验总览",
        "content": report,
        "created_at": timestamp,
    }

    logger.info("Sophistry observer created final report")
    return {
        "dialogue_history": [entry],
        "mode_artifacts": [artifact],
        "final_mode_report": artifact,
    }
