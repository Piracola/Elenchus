"""
Export service - converts session data to Markdown or JSON for download.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any

_DIM_LABELS = {
    "logical_rigor": "逻辑严密度",
    "evidence_quality": "证据质量",
    "rebuttal_strength": "反驳力度",
    "consistency": "前后一致性",
    "persuasiveness": "说服力",
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
        return f"{score_value}/10"
    return "-"


def _format_cumulative_value(value: Any) -> str:
    if isinstance(value, list):
        compact_values = [str(item) for item in value]
        return " -> ".join(compact_values) if compact_values else "-"
    if value in (None, ""):
        return "-"
    return str(value)


def export_json(session_data: dict[str, Any]) -> str:
    """Return pretty-printed JSON of the full session data."""
    return json.dumps(session_data, ensure_ascii=False, indent=2, default=str)


def export_markdown(session_data: dict[str, Any]) -> str:
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

    history = session_data.get("dialogue_history", [])
    if history:
        lines.append("## 辩论全文")
        lines.append("")

        for index, entry in enumerate(history, start=1):
            content = entry.get("content", "")
            timestamp = entry.get("timestamp", "")
            citations = entry.get("citations", [])

            lines.append(
                f"### [{_format_role_heading(entry)}] {_format_turn_label(entry, index)}"
            )
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

    current_scores = session_data.get("current_scores", {})
    if current_scores:
        lines.append("## 当前评分")
        lines.append("")

        for role, scores in current_scores.items():
            if not isinstance(scores, dict):
                continue

            lines.append(f"### {_role_label(str(role))}")
            lines.append("")
            lines.append("| 维度 | 得分 | 评语 |")
            lines.append("|------|------|------|")

            for dim_key, dim_label in _DIM_LABELS.items():
                dim_data = scores.get(dim_key, {})
                if isinstance(dim_data, dict):
                    score = _format_score(dim_data.get("score"))
                    rationale = dim_data.get("rationale") or "-"
                else:
                    score = "-"
                    rationale = "-"
                lines.append(f"| {dim_label} | {score} | {rationale} |")

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
