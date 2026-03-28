"""
Export service - converts session data to Markdown or JSON for download.
"""

from __future__ import annotations

import json
import re
from datetime import UTC, datetime
from typing import Any
from urllib.parse import quote

from .export_runtime_service import (
    compute_runtime_events_checksum,
    export_runtime_events_snapshot,
)

_DIM_LABELS = {
    "logical_rigor": "逻辑严密度",
    "evidence_quality": "证据质量",
    "topic_focus": "切题度与定义稳定",
    "rebuttal_strength": "反驳力度",
    "consistency": "前后一致性",
    "persuasiveness": "价值立意与说服力",
}

_DIM_WEIGHTS = {
    "evidence_quality": 15,
    "topic_focus": 15,
    "logical_rigor": 20,
    "rebuttal_strength": 20,
    "consistency": 15,
    "persuasiveness": 15,
}

_MODULE_LABELS = {
    "foundation": "基础建设",
    "confrontation": "对抗推演",
    "stability": "系统稳健",
    "vision": "终极视野",
}

_MODULE_WEIGHTS = {
    "foundation": 30,
    "confrontation": 40,
    "stability": 15,
    "vision": 15,
}

_MODULE_DIMENSIONS = {
    "foundation": ("evidence_quality", "topic_focus"),
    "confrontation": ("logical_rigor", "rebuttal_strength"),
    "stability": ("consistency",),
    "vision": ("persuasiveness",),
}

_ROLE_LABELS = {
    "proposer": "正方 (Proposer)",
    "opposer": "反方 (Opposer)",
    "system": "系统",
    "fact_checker": "事实核查",
    "judge": "裁判",
    "audience": "观众",
    "error": "系统错误",
}


_INVALID_FILENAME_CHARS = re.compile(r'[<>:"/\\|?*\x00-\x1F]')
_WINDOWS_RESERVED_NAMES = {
    "CON",
    "PRN",
    "AUX",
    "NUL",
    "COM1",
    "COM2",
    "COM3",
    "COM4",
    "COM5",
    "COM6",
    "COM7",
    "COM8",
    "COM9",
    "LPT1",
    "LPT2",
    "LPT3",
    "LPT4",
    "LPT5",
    "LPT6",
    "LPT7",
    "LPT8",
    "LPT9",
}
_MAX_FILENAME_BASE_LENGTH = 120
_MARKDOWN_EXPORT_CATEGORY_ORDER = (
    "debater_speeches",
    "group_discussion",
    "judge_messages",
    "jury_messages",
    "consensus_summary",
)
_MARKDOWN_EXPORT_CATEGORY_SET = set(_MARKDOWN_EXPORT_CATEGORY_ORDER)
_NON_DEBATER_DIALOGUE_ROLES = {
    "judge",
    "system",
    "fact_checker",
    "audience",
    "error",
    "sophistry_round_report",
    "sophistry_final_report",
}


def _role_label(role: str) -> str:
    return _ROLE_LABELS.get(role, role)


def _format_turn_label(entry: dict[str, Any], index: int) -> str:
    turn = entry.get("turn")
    if isinstance(turn, int) and turn >= 0:
        return f"第 {turn + 1} 轮"
    return f"片段 {index}"


def _format_role_heading(entry: dict[str, Any]) -> str:
    role = str(entry.get("role", "unknown"))
    target_role = entry.get("target_role")
    label = _role_label(role)
    if role == "judge" and isinstance(target_role, str) and target_role:
        return f"{label} -> {_role_label(target_role)}"
    return label


def _format_score(score_value: Any) -> str:
    if isinstance(score_value, (int, float)):
        rounded = round(float(score_value), 1)
        display = str(int(rounded)) if rounded.is_integer() else f"{rounded:.1f}"
        return f"{display}/10"
    return "-"


def _format_cumulative_value(value: Any) -> str:
    if isinstance(value, list):
        compact_values = [str(item) for item in value]
        return " -> ".join(compact_values) if compact_values else "-"
    if value in (None, ""):
        return "-"
    return str(value)


def _sanitize_filename_base(raw: Any) -> str:
    text = str(raw or "").strip()
    if not text:
        return "未命名辩题"

    sanitized = _INVALID_FILENAME_CHARS.sub("_", text)
    sanitized = re.sub(r"\s+", " ", sanitized).strip().rstrip(". ")
    if not sanitized:
        sanitized = "未命名辩题"

    if sanitized.upper() in _WINDOWS_RESERVED_NAMES:
        sanitized = f"{sanitized}_"

    if len(sanitized) > _MAX_FILENAME_BASE_LENGTH:
        sanitized = sanitized[:_MAX_FILENAME_BASE_LENGTH].rstrip(". ")

    return sanitized or "未命名辩题"


def build_export_filename(session_data: dict[str, Any], extension: str) -> str:
    base = _sanitize_filename_base(session_data.get("topic"))
    normalized_extension = extension.lstrip(".") or "txt"
    return f"{base}.{normalized_extension}"


def build_content_disposition(filename: str) -> str:
    fallback = filename.encode("ascii", "ignore").decode("ascii").strip()
    fallback_base = fallback.rsplit(".", 1)[0].strip(". ") if "." in fallback else fallback.strip(". ")
    if not fallback_base:
        extension = filename.rsplit(".", 1)[-1] if "." in filename else "txt"
        fallback = f"debate-export.{extension}"
    return f'attachment; filename="{fallback}"; filename*=UTF-8\'\'{quote(filename)}'


def export_json(session_data: dict[str, Any]) -> str:
    """Return pretty-printed JSON of the full session data."""
    return json.dumps(session_data, ensure_ascii=False, indent=2, default=str)


def _extract_dimension_score_map(scores: dict[str, Any]) -> dict[str, float]:
    dimension_scores: dict[str, float] = {}
    for dim_key in _DIM_LABELS:
        dim_data = scores.get(dim_key, {})
        if not isinstance(dim_data, dict):
            continue
        raw_score = dim_data.get("score")
        if isinstance(raw_score, (int, float)):
            dimension_scores[dim_key] = float(raw_score)
    return dimension_scores


def _weighted_average(
    score_map: dict[str, float],
    dimensions: tuple[str, ...],
) -> float | None:
    available_dimensions = [dim for dim in dimensions if dim in score_map]
    if not available_dimensions:
        return None

    total_weight = sum(_DIM_WEIGHTS[dim] for dim in available_dimensions)
    weighted_sum = sum(score_map[dim] * _DIM_WEIGHTS[dim] for dim in available_dimensions)
    return round(weighted_sum / total_weight + 1e-9, 1)


def _resolve_module_scores(scores: dict[str, Any]) -> dict[str, float]:
    resolved: dict[str, float] = {}
    precomputed = scores.get("module_scores")
    if isinstance(precomputed, dict):
        for module_key in _MODULE_LABELS:
            value = precomputed.get(module_key)
            if isinstance(value, (int, float)):
                resolved[module_key] = round(float(value), 1)

    dimension_scores = _extract_dimension_score_map(scores)
    for module_key, dimensions in _MODULE_DIMENSIONS.items():
        if module_key in resolved:
            continue
        value = _weighted_average(dimension_scores, dimensions)
        if value is not None:
            resolved[module_key] = value

    return resolved


def _resolve_comprehensive_score(scores: dict[str, Any]) -> float | None:
    precomputed = scores.get("comprehensive_score")
    if isinstance(precomputed, (int, float)):
        return round(float(precomputed), 1)

    return _weighted_average(scores_map := _extract_dimension_score_map(scores), tuple(scores_map.keys()))


def normalize_markdown_export_categories(categories: list[str] | tuple[str, ...] | None) -> list[str] | None:
    if categories is None:
        return None

    normalized: list[str] = []
    seen: set[str] = set()
    for category in categories:
        if category not in _MARKDOWN_EXPORT_CATEGORY_SET or category in seen:
            continue
        normalized.append(category)
        seen.add(category)

    if normalized:
        return normalized
    return ["debater_speeches"]


def _render_markdown_entry_block(
    lines: list[str],
    entry: dict[str, Any],
    index: int,
) -> None:
    content = entry.get("content", "")
    timestamp = entry.get("timestamp", "")
    citations = entry.get("citations", [])

    lines.append(f"### [{_format_role_heading(entry)}] {_format_turn_label(entry, index)}")
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


def _is_debater_speech_entry(entry: dict[str, Any], participants: set[str]) -> bool:
    role = str(entry.get("role", ""))
    if role in participants:
        return True
    return role not in _NON_DEBATER_DIALOGUE_ROLES


def _append_markdown_transcript_sections(
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
                _render_markdown_entry_block(lines, entry, index)
        return

    participants_raw = session_data.get("participants", [])
    participants = {
        str(role)
        for role in participants_raw
        if isinstance(role, str) and role
    }

    category_entries: dict[str, list[dict[str, Any]]] = {
        "debater_speeches": [
            entry for entry in history
            if isinstance(entry, dict) and _is_debater_speech_entry(entry, participants)
        ],
        "group_discussion": [
            entry for entry in session_data.get("team_dialogue_history", [])
            if isinstance(entry, dict)
        ],
        "judge_messages": [
            entry for entry in history
            if isinstance(entry, dict) and str(entry.get("role", "")) == "judge"
        ],
        "jury_messages": [
            entry for entry in session_data.get("jury_dialogue_history", [])
            if isinstance(entry, dict) and str(entry.get("role", "")) != "consensus_summary"
        ],
        "consensus_summary": [
            entry for entry in session_data.get("jury_dialogue_history", [])
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
            _render_markdown_entry_block(lines, entry, index)
        rendered_any = True

    if rendered_any:
        return

    fallback_entries = category_entries["debater_speeches"]
    if not fallback_entries:
        return
    lines.append(category_titles["debater_speeches"])
    lines.append("")
    for index, entry in enumerate(fallback_entries, start=1):
        _render_markdown_entry_block(lines, entry, index)


def export_markdown(session_data: dict[str, Any], categories: list[str] | tuple[str, ...] | None = None) -> str:
    """
    Generate a structured Markdown document from session data.
    Includes metadata, dialogue transcript, and score summaries.
    """
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
    lines.append(
        f"| **参与者** | {', '.join(_role_label(str(p)) for p in participants) or '-'} |"
    )
    lines.append(f"| **创建时间** | {created or '-'} |")
    lines.append(f"| **导出时间** | {datetime.now(UTC).isoformat()} |")
    lines.append("")

    normalized_categories = normalize_markdown_export_categories(categories)
    _append_markdown_transcript_sections(lines, session_data, normalized_categories)


    current_scores = session_data.get("current_scores", {})
    if current_scores:
        lines.append("## 当前评分")
        lines.append("")

        for role, scores in current_scores.items():
            if not isinstance(scores, dict):
                continue

            lines.append(f"### {_role_label(str(role))}")
            lines.append("")
            comprehensive_score = _resolve_comprehensive_score(scores)
            if comprehensive_score is not None:
                lines.append(f"**综合评分：** {_format_score(comprehensive_score)}")
                lines.append("")

            module_scores = _resolve_module_scores(scores)
            if module_scores:
                lines.append("| 模块 | 占比 | 得分 |")
                lines.append("|------|------|------|")
                for module_key, module_label in _MODULE_LABELS.items():
                    lines.append(
                        f"| {module_label} | {_MODULE_WEIGHTS[module_key]}% | {_format_score(module_scores.get(module_key))} |"
                    )
                lines.append("")

            lines.append("| 底层维度 | 权重 | 得分 | 评语 |")
            lines.append("|------|------|------|------|")
            for dim_key, dim_label in _DIM_LABELS.items():
                dim_data = scores.get(dim_key, {})
                if isinstance(dim_data, dict):
                    score = _format_score(dim_data.get("score"))
                    rationale = dim_data.get("rationale") or "-"
                else:
                    score = "-"
                    rationale = "-"
                lines.append(f"| {dim_label} | {_DIM_WEIGHTS[dim_key]}% | {score} | {rationale} |")

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

            lines.append(f"### {_role_label(str(role))}")
            lines.append("")
            for dim_key, dim_label in _DIM_LABELS.items():
                value = _format_cumulative_value(score_data.get(dim_key))
                lines.append(f"- **{dim_label}**：{value}")
            lines.append("")

    lines.append("---")
    lines.append("*由 Elenchus 导出*")
    lines.append("")

    return "\n".join(lines)
