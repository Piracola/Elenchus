from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from .scoring import (
    DIM_LABELS,
    DIM_WEIGHTS,
    MODULE_LABELS,
    MODULE_WEIGHTS,
    format_cumulative_value,
    format_score,
    resolve_comprehensive_score,
    resolve_module_scores,
)

ROLE_LABELS = {
    "proposer": "正方 (Proposer)",
    "opposer": "反方 (Opposer)",
    "system": "系统",
    "fact_checker": "事实核查",
    "judge": "裁判",
    "audience": "观众",
    "error": "系统错误",
}

MARKDOWN_EXPORT_CATEGORY_ORDER = (
    "debater_speeches",
    "group_discussion",
    "judge_messages",
    "jury_messages",
    "consensus_summary",
)
MARKDOWN_EXPORT_CATEGORY_SET = set(MARKDOWN_EXPORT_CATEGORY_ORDER)
NON_DEBATER_DIALOGUE_ROLES = {
    "judge",
    "system",
    "fact_checker",
    "audience",
    "error",
    "sophistry_round_report",
    "sophistry_final_report",
}


def role_label(role: str) -> str:
    return ROLE_LABELS.get(role, role)


def format_turn_label(entry: dict[str, Any], index: int) -> str:
    turn = entry.get("turn")
    if isinstance(turn, int) and turn >= 0:
        return f"第 {turn + 1} 轮"
    return f"片段 {index}"


def format_role_heading(entry: dict[str, Any]) -> str:
    role = str(entry.get("role", "unknown"))
    target_role = entry.get("target_role")
    label = role_label(role)
    if role == "judge" and isinstance(target_role, str) and target_role:
        return f"{label} -> {role_label(target_role)}"
    return label


def normalize_markdown_export_categories(categories: list[str] | tuple[str, ...] | None) -> list[str] | None:
    if categories is None:
        return None

    normalized: list[str] = []
    seen: set[str] = set()
    for category in categories:
        if category not in MARKDOWN_EXPORT_CATEGORY_SET or category in seen:
            continue
        normalized.append(category)
        seen.add(category)

    if normalized:
        return normalized
    return ["debater_speeches"]


def render_markdown_entry_block(lines: list[str], entry: dict[str, Any], index: int) -> None:
    content = entry.get("content", "")
    timestamp = entry.get("timestamp", "")
    citations = entry.get("citations", [])

    lines.append(f"### [{format_role_heading(entry)}] {format_turn_label(entry, index)}")
    if timestamp:
        lines.append(f"*{timestamp}*")
    lines.append("")
    lines.append(str(content) if content else "（无内容）")

    if citations:
        lines.append("")
        lines.append("**引用来源：**")
        for url in citations:
            lines.append(f"- {url}")

    lines.append("")
    lines.append("---")
    lines.append("")


def is_debater_speech_entry(entry: dict[str, Any], participants: set[str]) -> bool:
    role = str(entry.get("role", ""))
    if role in participants:
        return True
    return role not in NON_DEBATER_DIALOGUE_ROLES


def append_markdown_transcript_sections(
    lines: list[str],
    session_data: dict[str, Any],
    categories: list[str] | None,
) -> None:
    history = session_data.get("dialogue_history", [])
    if not isinstance(history, list):
        history = []

    if categories is None:
        if not history:
            return
        lines.append("## 辩论全文")
        lines.append("")
        for index, entry in enumerate(history, start=1):
            if isinstance(entry, dict):
                render_markdown_entry_block(lines, entry, index)
        return

    participants_raw = session_data.get("participants", [])
    participants = {str(role) for role in participants_raw if isinstance(role, str) and role}

    category_entries: dict[str, list[dict[str, Any]]] = {
        "debater_speeches": [
            entry for entry in history if isinstance(entry, dict) and is_debater_speech_entry(entry, participants)
        ],
        "group_discussion": [
            entry for entry in session_data.get("team_dialogue_history", []) if isinstance(entry, dict)
        ],
        "judge_messages": [
            entry for entry in history if isinstance(entry, dict) and str(entry.get("role", "")) == "judge"
        ],
        "jury_messages": [
            entry
            for entry in session_data.get("jury_dialogue_history", [])
            if isinstance(entry, dict) and str(entry.get("role", "")) != "consensus_summary"
        ],
        "consensus_summary": [
            entry
            for entry in session_data.get("jury_dialogue_history", [])
            if isinstance(entry, dict) and str(entry.get("role", "")) == "consensus_summary"
        ],
    }
    category_titles = {
        "debater_speeches": "## 辩手发言",
        "group_discussion": "## 组内讨论",
        "judge_messages": "## 裁判消息",
        "jury_messages": "## 审判团消息",
        "consensus_summary": "## 共识收敛消息",
    }

    rendered_any = False
    for category in categories:
        entries = category_entries.get(category, [])
        if not entries:
            continue
        lines.append(category_titles[category])
        lines.append("")
        for index, entry in enumerate(entries, start=1):
            render_markdown_entry_block(lines, entry, index)
        rendered_any = True

    if rendered_any:
        return

    fallback_entries = category_entries["debater_speeches"]
    if not fallback_entries:
        return
    lines.append(category_titles["debater_speeches"])
    lines.append("")
    for index, entry in enumerate(fallback_entries, start=1):
        render_markdown_entry_block(lines, entry, index)


def export_markdown(session_data: dict[str, Any], categories: list[str] | tuple[str, ...] | None = None) -> str:
    lines: list[str] = []

    topic = session_data.get("topic", "未命名辩题")
    status = session_data.get("status", "unknown")
    current_turn = session_data.get("current_turn", 0)
    max_turns = session_data.get("max_turns", 0)
    participants = session_data.get("participants", [])
    created = session_data.get("created_at", "")

    lines.append(f"# 辩论记录：{topic}")
    lines.append("")
    lines.append("## 基本信息")
    lines.append("")
    lines.append("| 项目 | 内容 |")
    lines.append("|------|------|")
    lines.append(f"| **主题** | {topic} |")
    lines.append(f"| **状态** | {status} |")
    lines.append(f"| **轮次** | {current_turn} / {max_turns} |")
    lines.append(f"| **参与者** | {', '.join(role_label(str(p)) for p in participants) or '-'} |")
    lines.append(f"| **创建时间** | {created or '-'} |")
    lines.append(f"| **导出时间** | {datetime.now(UTC).isoformat()} |")
    lines.append("")

    normalized_categories = normalize_markdown_export_categories(categories)
    append_markdown_transcript_sections(lines, session_data, normalized_categories)

    current_scores = session_data.get("current_scores", {})
    if current_scores:
        lines.append("## 当前评分")
        lines.append("")

        for role, scores in current_scores.items():
            if not isinstance(scores, dict):
                continue

            lines.append(f"### {role_label(str(role))}")
            lines.append("")
            comprehensive_score = resolve_comprehensive_score(scores)
            if comprehensive_score is not None:
                lines.append(f"**综合评分：** {format_score(comprehensive_score)}")
                lines.append("")

            module_scores = resolve_module_scores(scores)
            if module_scores:
                lines.append("| 模块 | 占比 | 得分 |")
                lines.append("|------|------|------|")
                for module_key, module_label in MODULE_LABELS.items():
                    lines.append(
                        f"| {module_label} | {MODULE_WEIGHTS[module_key]}% | {format_score(module_scores.get(module_key))} |"
                    )
                lines.append("")

            lines.append("| 底层维度 | 权重 | 得分 | 评语 |")
            lines.append("|------|------|------|------|")
            for dim_key, dim_label in DIM_LABELS.items():
                dim_data = scores.get(dim_key, {})
                if isinstance(dim_data, dict):
                    score = format_score(dim_data.get("score"))
                    rationale = dim_data.get("rationale") or "-"
                else:
                    score = "-"
                    rationale = "-"
                lines.append(f"| {dim_label} | {DIM_WEIGHTS[dim_key]}% | {score} | {rationale} |")

            overall = scores.get("overall_comment")
            if overall:
                lines.append("")
                lines.append(f"**整体评语：** {overall}")

            lines.append("")

    cumulative_scores = session_data.get("cumulative_scores", {})
    if cumulative_scores:
        lines.append("## 累计得分趋势")
        lines.append("")

        for role, score_data in cumulative_scores.items():
            if not isinstance(score_data, dict):
                continue

            lines.append(f"### {role_label(str(role))}")
            lines.append("")
            for dim_key, dim_label in DIM_LABELS.items():
                value = format_cumulative_value(score_data.get(dim_key))
                lines.append(f"- **{dim_label}**：{value}")
            lines.append("")

    lines.append("---")
    lines.append("*由 Elenchus 导出*")
    lines.append("")

    return "\n".join(lines)
