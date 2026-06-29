from __future__ import annotations

import re
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
    "thinking_content",
    "judge_messages",
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
LEADING_WHITESPACE_RE = re.compile(r"\s*")
THINK_OPEN_RE = re.compile(r"<think\b[^>]*>", re.IGNORECASE)
THINK_CLOSE_RE = re.compile(r"</think\s*>", re.IGNORECASE)
LEADING_LINE_BREAKS_RE = re.compile(r"^(?:[ \t]*\r?\n)+")
LEADING_INLINE_SPACES_RE = re.compile(r"^[ \t]+")
TRAILING_LINE_BREAKS_RE = re.compile(r"(?:\r?\n[ \t]*)+$")


def _normalize_thinking_segment(value: str) -> str:
    return TRAILING_LINE_BREAKS_RE.sub("", LEADING_LINE_BREAKS_RE.sub("", value))


def _strip_response_padding(value: str) -> str:
    without_leading_breaks = LEADING_LINE_BREAKS_RE.sub("", value)
    if without_leading_breaks != value:
        return without_leading_breaks
    return LEADING_INLINE_SPACES_RE.sub("", value)


def split_leading_thinking_content(content: Any) -> tuple[str | None, str]:
    text = str(content or "")
    if not text:
        return None, ""

    cursor = 0
    thinking_segments: list[str] = []

    while cursor < len(text):
        leading_match = LEADING_WHITESPACE_RE.match(text, cursor)
        open_tag_start = leading_match.end() if leading_match else cursor
        open_tag_match = THINK_OPEN_RE.match(text, open_tag_start)
        if not open_tag_match:
            break

        after_open_tag = open_tag_match.end()
        close_tag_match = THINK_CLOSE_RE.search(text, after_open_tag)
        if not close_tag_match:
            return None, text

        segment = _normalize_thinking_segment(text[after_open_tag:close_tag_match.start()])
        if segment:
            thinking_segments.append(segment)
        cursor = close_tag_match.end()

    if cursor == 0:
        return None, text

    thinking = "\n\n".join(thinking_segments) if thinking_segments else None
    return thinking, _strip_response_padding(text[cursor:])


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


def _should_include_thinking(categories: list[str] | None) -> bool:
    return categories is None or "thinking_content" in categories


def _render_markdown_content_with_optional_thinking(
    lines: list[str],
    content: Any,
    *,
    include_thinking: bool,
) -> None:
    thinking, response = split_leading_thinking_content(content)

    if thinking and include_thinking:
        lines.append("<details>")
        lines.append("<summary>思维链</summary>")
        lines.append("")
        lines.append(thinking)
        lines.append("")
        lines.append("</details>")
        lines.append("")

    visible_content = response if thinking else str(content or "")
    lines.append(visible_content if visible_content else "（无内容）")


def render_markdown_entry_block(
    lines: list[str],
    entry: dict[str, Any],
    index: int,
    *,
    include_thinking: bool = True,
) -> None:
    content = entry.get("content", "")
    timestamp = entry.get("timestamp", "")
    citations = entry.get("citations", [])

    lines.append(f"### [{format_role_heading(entry)}] {format_turn_label(entry, index)}")
    if timestamp:
        lines.append(f"*{timestamp}*")
    lines.append("")
    _render_markdown_content_with_optional_thinking(
        lines,
        content,
        include_thinking=include_thinking,
    )

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
    include_thinking = _should_include_thinking(categories)
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
                render_markdown_entry_block(
                    lines,
                    entry,
                    index,
                    include_thinking=include_thinking,
                )
        return

    participants_raw = session_data.get("participants", [])
    participants = {str(role) for role in participants_raw if isinstance(role, str) and role}

    category_entries: dict[str, list[dict[str, Any]]] = {
        "debater_speeches": [
            entry for entry in history if isinstance(entry, dict) and is_debater_speech_entry(entry, participants)
        ],
        "judge_messages": [
            entry for entry in history if isinstance(entry, dict) and str(entry.get("role", "")) == "judge"
        ],
        "consensus_summary": [
            entry
            for entry in history
            if isinstance(entry, dict) and str(entry.get("role", "")) == "consensus_summary"
        ],
    }
    category_titles = {
        "debater_speeches": "## 辩手发言",
        "thinking_content": "",
        "judge_messages": "## 裁判消息",
        "consensus_summary": "## 共识收敛消息",
    }

    rendered_any = False
    for category in categories:
        if category == "thinking_content":
            continue
        entries = category_entries.get(category, [])
        if not entries:
            continue
        lines.append(category_titles[category])
        lines.append("")
        for index, entry in enumerate(entries, start=1):
            render_markdown_entry_block(
                lines,
                entry,
                index,
                include_thinking=include_thinking,
            )
        rendered_any = True

    if rendered_any:
        return

    fallback_entries = category_entries["debater_speeches"]
    if not fallback_entries:
        return
    lines.append(category_titles["debater_speeches"])
    lines.append("")
    for index, entry in enumerate(fallback_entries, start=1):
        render_markdown_entry_block(
            lines,
            entry,
            index,
            include_thinking=include_thinking,
        )


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
