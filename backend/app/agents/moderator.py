"""Moderator directive selection and prompt fragments.

A directive is a user intervention injected into the debate as an audience-role
entry. It stays "unanswered" until a participant speaks after it; the next
speaker is required to address it head-on.
"""

from __future__ import annotations

from typing import Any

MODERATOR_AGENT_NAME = "主持人"
MODERATOR_DIRECTIVE_KIND = "moderator_directive"

# Only the most recent directives are enforced; older ones stay visible in the
# transcript but no longer block a speaker.
_MAX_ENFORCED_DIRECTIVES = 2

DEBATER_LIVE_CONSTRAINT = (
    "本轮存在主持人指令，你必须在发言的第一段正面回应它，不得回避或忽略。"
)

JUDGE_LIVE_CONSTRAINT = (
    "本轮存在主持人指令，请把「是否正面回应主持人指令」纳入 topic_focus 与 "
    "rebuttal_strength 的评估。"
)


def _is_moderator_entry(entry: Any) -> bool:
    if not isinstance(entry, dict):
        return False
    if str(entry.get("role", "") or "") != "audience":
        return False
    kind = str(entry.get("intervention_kind", "") or "")
    # Legacy audience entries carry no kind marker; treat them as directives too.
    return kind in {"", MODERATOR_DIRECTIVE_KIND}


def select_unanswered_directives(
    dialogue_history: list[dict[str, Any]] | None,
    participants: list[str] | None,
) -> list[dict[str, Any]]:
    """Return directives that no participant has spoken after yet."""
    if not isinstance(dialogue_history, list):
        return []
    participant_set = {str(role) for role in (participants or [])}

    unanswered: list[dict[str, Any]] = []
    for entry in reversed(dialogue_history):
        if not isinstance(entry, dict):
            continue
        if str(entry.get("role", "") or "") in participant_set:
            break
        if _is_moderator_entry(entry):
            unanswered.append(entry)
    unanswered.reverse()
    return unanswered[-_MAX_ENFORCED_DIRECTIVES:]


def render_directive_block(directives: list[dict[str, Any]]) -> str:
    """Render the highest-priority prompt fragment for pending directives."""
    if not directives:
        return ""
    lines = ["## 主持人强制指令（最高优先级，必须正面回应）"]
    for directive in directives:
        content = str(directive.get("content", "") or "").strip()
        if content:
            lines.append(f"- {content}")
    lines.append(
        "要求：在发言的第一段直接回应上述指令（同意、反驳或修正均可，但不得回避），"
        "随后再展开本方论证。"
    )
    return "\n".join(lines)


def render_judge_directive_note(directives: list[dict[str, Any]]) -> str:
    """Render the directive summary shown to the judge."""
    if not directives:
        return ""
    contents = [
        str(directive.get("content", "") or "").strip()
        for directive in directives
        if str(directive.get("content", "") or "").strip()
    ]
    if not contents:
        return ""
    joined = "；".join(f"「{content}」" for content in contents)
    return f"本轮主持人下达了指令：{joined}"
