"""
Export service — converts session data to Markdown or JSON for download.
"""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any


# ── Dimension labels ─────────────────────────────────────────────

_DIM_LABELS = {
    "logical_rigor": "逻辑严密度",
    "evidence_quality": "证据质量",
    "rebuttal_strength": "反驳力度",
    "consistency": "前后自洽",
    "persuasiveness": "说服力",
}

_ROLE_LABELS = {
    "proposer": "正方 (Proposer)",
    "opposer": "反方 (Opposer)",
    "system": "系统",
    "fact_checker": "事实核查",
    "judge": "裁判",
}


def _role_label(role: str) -> str:
    return _ROLE_LABELS.get(role, role)


# ── JSON Export ──────────────────────────────────────────────────

def export_json(session_data: dict[str, Any]) -> str:
    """Return pretty-printed JSON of the full session data."""
    return json.dumps(session_data, ensure_ascii=False, indent=2, default=str)


# ── Markdown Export ──────────────────────────────────────────────

def export_markdown(session_data: dict[str, Any]) -> str:
    """
    Generate a structured Markdown document from session data.
    Includes metadata, dialogue transcript, and scoring tables.
    """
    lines: list[str] = []

    # ── Header ───────────────────────────────────────────────────
    topic = session_data.get("topic", "Unknown")
    status = session_data.get("status", "unknown")
    current_turn = session_data.get("current_turn", 0)
    max_turns = session_data.get("max_turns", 0)
    participants = session_data.get("participants", [])
    created = session_data.get("created_at", "")

    lines.append(f"# 辩论记录: {topic}")
    lines.append("")
    lines.append("## 基本信息")
    lines.append("")
    lines.append(f"| 项目 | 值 |")
    lines.append(f"|------|-----|")
    lines.append(f"| **主题** | {topic} |")
    lines.append(f"| **状态** | {status} |")
    lines.append(f"| **轮次** | {current_turn} / {max_turns} |")
    lines.append(f"| **参与者** | {', '.join(_role_label(p) for p in participants)} |")
    lines.append(f"| **创建时间** | {created} |")
    lines.append("")

    # ── Dialogue transcript ─────────────────────────────────────
    history = session_data.get("dialogue_history", [])
    if history:
        lines.append("## 辩论全文")
        lines.append("")

        for i, entry in enumerate(history):
            role = entry.get("role", "unknown")
            content = entry.get("content", "")
            timestamp = entry.get("timestamp", "")
            citations = entry.get("citations", [])

            lines.append(f"### [{_role_label(role)}] — Turn {(i // len(participants)) + 1 if participants else i + 1}")
            if timestamp:
                lines.append(f"*{timestamp}*")
            lines.append("")
            lines.append(content)

            if citations:
                lines.append("")
                lines.append("**引用来源:**")
                for url in citations:
                    lines.append(f"- {url}")

            lines.append("")
            lines.append("---")
            lines.append("")

    # ── Scoring summary ─────────────────────────────────────────
    current_scores = session_data.get("current_scores", {})
    cumulative_scores = session_data.get("cumulative_scores", {})

    if current_scores:
        lines.append("## 最终轮评分")
        lines.append("")

        for role, scores in current_scores.items():
            if not isinstance(scores, dict):
                continue
            lines.append(f"### {_role_label(role)}")
            lines.append("")
            lines.append("| 维度 | 得分 | 理由 |")
            lines.append("|------|------|------|")

            for dim_key, dim_label in _DIM_LABELS.items():
                dim_data = scores.get(dim_key, {})
                if isinstance(dim_data, dict):
                    score = dim_data.get("score", "—")
                    rationale = dim_data.get("rationale", "—")
                else:
                    score = "—"
                    rationale = "—"
                lines.append(f"| {dim_label} | {score}/10 | {rationale} |")

            overall = scores.get("overall_comment", "")
            if overall:
                lines.append("")
                lines.append(f"**整体评语:** {overall}")

            lines.append("")

    # ── Cumulative scores ───────────────────────────────────────
    if cumulative_scores:
        lines.append("## 累积得分趋势")
        lines.append("")

        for role, score_data in cumulative_scores.items():
            if not isinstance(score_data, dict):
                continue
            lines.append(f"### {_role_label(role)}")
            lines.append("")
            for dim_key, dim_label in _DIM_LABELS.items():
                value = score_data.get(dim_key, "—")
                lines.append(f"- **{dim_label}**: {value}")
            lines.append("")

    # ── Footer ──────────────────────────────────────────────────
    lines.append("---")
    lines.append(f"*Exported by Elenchus — Multi-Agent Debate Framework*")
    lines.append("")

    return "\n".join(lines)
