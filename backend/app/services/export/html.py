from __future__ import annotations

import re
from datetime import UTC, datetime
from html import escape, unescape
from typing import Any

from markdown_it import MarkdownIt

from .markdown import (
    is_debater_speech_entry,
    normalize_markdown_export_categories,
    role_label,
    split_leading_thinking_content,
)
from .scoring import (
    DIM_LABELS,
    format_score,
    resolve_comprehensive_score,
    weighted_average,
)

ROLE_ACCENTS = {
    "proposer": ("#5b8073", "#edf4f0"),
    "opposer": ("#9a6a72", "#f7eef0"),
    "judge": ("#9b7a4d", "#f7f2e9"),
    "group_discussion": ("#5f7f8a", "#eef5f7"),
    "system": ("#64748b", "#f1f5f9"),
    "fact_checker": ("#5f7895", "#eef4f8"),
    "audience": ("#7a7286", "#f3f0f6"),
    "error": ("#9b6060", "#f7eeee"),
    "sophistry_round_report": ("#766f93", "#f2f0f7"),
    "sophistry_final_report": ("#766f93", "#f2f0f7"),
}
ACCENT_POOL = (
    ("#637a63", "#eef4ee"),
    ("#6f7892", "#eef2f7"),
    ("#89705e", "#f5f0ec"),
    ("#7a6f88", "#f2eff5"),
    ("#787b5f", "#f2f3ea"),
    ("#687f83", "#edf4f5"),
)
COMPACT_ROLE_LABELS = {
    "proposer": "正方",
    "opposer": "反方",
    "judge": "裁判",
    "group_discussion": "组内讨论",
    "system": "系统",
    "fact_checker": "事实核查",
    "audience": "观众",
    "error": "错误",
    "sophistry_round_report": "诡辩观察",
    "sophistry_final_report": "诡辩总结",
}
PRIMARY_SCORE_ROLES = ("proposer", "opposer")
URL_RE = re.compile(r"(https?://[^\s<>()]+)")
FENCE_RE = re.compile(r"^\s*(```+|~~~+)")
INLINE_CODE_RE = re.compile(r"(`+[^`]*`+)")
HTML_TAG_RE = re.compile(r"<[^>]+>")
TRAILING_TIMEZONE_RE = re.compile(r"(?:Z|[+-]\d{2}:?\d{2})$")


def _build_markdown_renderer() -> MarkdownIt:
    renderer = MarkdownIt(
        "gfm-like",
        {
            "html": False,
            "linkify": False,
            "typographer": False,
        },
    )

    def link_open(tokens, idx, options, env):
        token = tokens[idx]
        token.attrSet("target", "_blank")
        token.attrSet("rel", "noopener noreferrer")
        return renderer.renderer.renderToken(tokens, idx, options, env)

    renderer.renderer.rules["link_open"] = link_open
    return renderer


MARKDOWN_RENDERER = _build_markdown_renderer()


def _html(value: Any) -> str:
    return escape(str(value), quote=True)


def _plain(value: Any, fallback: str = "-") -> str:
    text = str(value or "").strip()
    return text or fallback


def _format_minute_timestamp(value: Any, fallback: str = "-") -> str:
    text = str(value or "").strip()
    if not text:
        return fallback

    normalized = text.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        compact = text.replace("T", " ")
        compact = TRAILING_TIMEZONE_RE.sub("", compact)
        return compact[:16] if len(compact) >= 16 else compact

    return parsed.strftime("%Y-%m-%d %H:%M")


def _slug(value: str) -> str:
    text = re.sub(r"[^a-zA-Z0-9_-]+", "-", value).strip("-")
    return text or "section"


def _turn_number(entry: dict[str, Any]) -> int | None:
    turn = entry.get("turn")
    if isinstance(turn, int) and turn >= 0:
        return turn + 1
    return None


def _turn_label(entry: dict[str, Any], index: int) -> str:
    turn_number = _turn_number(entry)
    if turn_number is not None:
        return f"第 {turn_number} 轮"
    return f"片段 {index}"


def _role_heading(entry: dict[str, Any]) -> str:
    role = str(entry.get("role", "unknown"))
    target_role = entry.get("target_role")
    label = role_label(role)
    if role == "judge" and isinstance(target_role, str) and target_role:
        return f"{label} -> {role_label(target_role)}"
    return label


def _compact_role_label(role: str) -> str:
    return COMPACT_ROLE_LABELS.get(role, re.sub(r"\s*\([^)]*\)$", "", role_label(role)))


def _compact_entry_role_heading(entry: dict[str, Any]) -> str:
    role = str(entry.get("role", "unknown"))
    target_role = entry.get("target_role")
    label = _compact_role_label(role)
    if role == "judge" and isinstance(target_role, str) and target_role:
        return f"{label} -> {_compact_role_label(target_role)}"
    return label


def _agent_label(entry: dict[str, Any]) -> str:
    agent_name = str(entry.get("agent_name") or "").strip()
    return agent_name or _compact_entry_role_heading(entry)


def _accent_for_role(role: str) -> tuple[str, str]:
    if role in ROLE_ACCENTS:
        return ROLE_ACCENTS[role]
    checksum = sum(ord(char) for char in role)
    return ACCENT_POOL[checksum % len(ACCENT_POOL)]


def _autolink_plain_urls_outside_code(text: str) -> str:
    """Convert bare URLs into Markdown autolinks without touching fenced or inline code."""
    lines: list[str] = []
    in_fence = False

    for line in text.splitlines():
        if FENCE_RE.match(line):
            in_fence = not in_fence
            lines.append(line)
            continue

        if in_fence:
            lines.append(line)
            continue

        parts = INLINE_CODE_RE.split(line)
        for index in range(0, len(parts), 2):
            part = parts[index]

            def replace(match: re.Match[str]) -> str:
                start, end = match.span()
                before = part[start - 1] if start > 0 else ""
                after = part[end] if end < len(part) else ""
                if before == "<" and after == ">":
                    return match.group(1)
                return f"<{match.group(1)}>"

            parts[index] = URL_RE.sub(replace, part)

        lines.append("".join(parts))

    return "\n".join(lines)


def _should_include_thinking(categories: list[str] | None) -> bool:
    return categories is None or "thinking_content" in categories


def _render_markdown_content(content: Any) -> str:
    text = str(content or "")
    if not text.strip():
        return '<p class="empty-content">（无内容）</p>'
    prepared_text = _autolink_plain_urls_outside_code(text.strip())
    return MARKDOWN_RENDERER.render(prepared_text)


def _markdown_visible_text(content: Any) -> str:
    text = str(content or "")
    if not text.strip():
        return ""
    rendered = MARKDOWN_RENDERER.render(_autolink_plain_urls_outside_code(text.strip()))
    return unescape(HTML_TAG_RE.sub(" ", rendered))


def _content_stat_count(content: Any) -> int:
    thinking, response = split_leading_thinking_content(content)
    visible_content = response if thinking else str(content or "")
    visible_text = _markdown_visible_text(visible_content)
    return len(re.sub(r"\s+", "", visible_text))


def _render_text_content(content: Any, *, include_thinking: bool) -> str:
    thinking, response = split_leading_thinking_content(content)
    parts: list[str] = []

    if thinking and include_thinking:
        parts.append(
            '<details class="thinking-panel">'
            '<summary><span>思维链</span><small>默认已折叠</small></summary>'
            f'<div class="thinking-body markdown-body">{_render_markdown_content(thinking)}</div>'
            "</details>"
        )

    visible_content = response if thinking else content
    parts.append(_render_markdown_content(visible_content))
    return "\n".join(parts)


def _entry_summary(entry: dict[str, Any]) -> str:
    thinking, response = split_leading_thinking_content(entry.get("content"))
    content_value = response if thinking else str(entry.get("content") or "")
    content = re.sub(r"\s+", " ", content_value).strip()
    if not content:
        return "无内容"
    if len(content) <= 120:
        return content
    return f"{content[:120].rstrip()}..."


def _entry_sort_key(entry: dict[str, Any], index: int) -> tuple[int, str, int]:
    turn_number = _turn_number(entry)
    return (turn_number if turn_number is not None else 999999, str(entry.get("timestamp") or ""), index)


def _collect_category_entries(session_data: dict[str, Any], categories: list[str] | None) -> list[tuple[str, str, list[dict[str, Any]]]]:
    history = session_data.get("dialogue_history", [])
    if not isinstance(history, list):
        history = []

    if categories is None:
        entries = [entry for entry in history if isinstance(entry, dict)]
        return [("full_transcript", "辩论全文", entries)] if entries else []

    participants_raw = session_data.get("participants", [])
    participants = {str(role) for role in participants_raw if isinstance(role, str) and role}
    category_entries: dict[str, list[dict[str, Any]]] = {
        "debater_speeches": [
            entry for entry in history if isinstance(entry, dict) and is_debater_speech_entry(entry, participants)
        ],
        "judge_messages": [
            entry for entry in history if isinstance(entry, dict) and str(entry.get("role", "")) == "judge"
        ],
        "group_discussion": [
            entry
            for entry in history
            if isinstance(entry, dict) and str(entry.get("role", "")) == "group_discussion"
        ],
        "consensus_summary": [
            entry
            for entry in history
            if isinstance(entry, dict) and str(entry.get("role", "")) == "consensus_summary"
        ],
    }
    category_titles = {
        "debater_speeches": "辩手发言",
        "group_discussion": "组内讨论",
        "judge_messages": "裁判消息",
        "consensus_summary": "共识收敛消息",
    }

    sections = [
        (category, category_titles[category], category_entries.get(category, []))
        for category in categories
        if category_entries.get(category)
    ]
    if sections:
        return sections

    fallback_entries = category_entries["debater_speeches"]
    return [("debater_speeches", category_titles["debater_speeches"], fallback_entries)] if fallback_entries else []


def _collect_roles(sections: list[tuple[str, str, list[dict[str, Any]]]], participants: list[Any]) -> list[str]:
    roles: list[str] = []
    seen: set[str] = set()
    for participant in participants:
        role = str(participant or "").strip()
        if role and role not in seen:
            roles.append(role)
            seen.add(role)
    for _, _, entries in sections:
        for entry in entries:
            role = str(entry.get("role", "unknown"))
            if role not in seen:
                roles.append(role)
                seen.add(role)
    return roles


def _collect_speech_text_stats(session_data: dict[str, Any]) -> dict[str, int]:
    stats = {"proposer": 0, "opposer": 0}
    history = session_data.get("dialogue_history", [])
    if not isinstance(history, list):
        return stats

    for entry in history:
        if not isinstance(entry, dict):
            continue
        role = str(entry.get("role", ""))
        if role in stats:
            stats[role] += _content_stat_count(entry.get("content"))
    return stats


def _render_meta_strip(session_data: dict[str, Any]) -> str:
    items = [
        ("轮次", f"{_plain(session_data.get('current_turn'), '0')} / {_plain(session_data.get('max_turns'), '0')}"),
        ("创建", _format_minute_timestamp(session_data.get("created_at"))),
        ("导出", _format_minute_timestamp(datetime.now(UTC))),
    ]
    return "\n".join(
        f'<span class="meta-item"><span>{_html(label)}</span><strong>{_html(value)}</strong></span>'
        for label, value in items
    )


def _render_speech_stats(stats: dict[str, int]) -> str:
    proposer_count = stats.get("proposer", 0)
    opposer_count = stats.get("opposer", 0)
    total_count = proposer_count + opposer_count
    items = [
        ("正方", proposer_count, "proposer"),
        ("反方", opposer_count, "opposer"),
        ("合计", total_count, "total"),
    ]
    rendered_items = "\n".join(
        '<div class="speech-stat-item" data-role="'
        f'{_html(role)}">'
        f'<span>{_html(label)}</span>'
        f'<strong>{_html(f"{count:,}")}</strong>'
        "<small>字符</small>"
        "</div>"
        for label, count, role in items
    )
    return f"""
<section class="speech-stats" aria-label="发言文本量统计">
  <div class="speech-stats-heading">
    <span>发言文本量</span>
    <small>不含思维链</small>
  </div>
  <div class="speech-stats-grid">
    {rendered_items}
  </div>
</section>
""".strip()


def _render_legend(roles: list[str]) -> str:
    if not roles:
        return ""
    items = []
    for role in roles:
        accent, soft = _accent_for_role(role)
        items.append(
            '<span class="legend-item" style="--agent-accent: '
            f'{_html(accent)}; --agent-soft: {_html(soft)};">'
            '<i></i>'
            f"{_html(_compact_role_label(role))}"
            "</span>"
        )
    return f'<section class="legend" aria-label="智能体颜色图例">{"".join(items)}</section>'


def _render_turn_nav(turns: list[int]) -> str:
    if not turns:
        return ""
    links = "\n".join(
        f'<a href="#turn-{turn}" class="turn-link">第 {turn} 轮</a>'
        for turn in turns
    )
    return f'<nav class="turn-nav" aria-label="轮次导航">{links}</nav>'


def _render_reading_map(
    sections: list[tuple[str, str, list[dict[str, Any]]]],
    *,
    has_scores: bool,
) -> str:
    items: list[str] = []
    for category, title, entries in sections:
        if not entries:
            continue
        turn_numbers = sorted({
            turn
            for entry in entries
            for turn in [_turn_number(entry)]
            if turn is not None
        })
        if turn_numbers:
            if len(turn_numbers) == 1:
                detail = f"{len(entries)} 条 · 第 {turn_numbers[0]} 轮"
            else:
                detail = f"{len(entries)} 条 · 第 {turn_numbers[0]}-{turn_numbers[-1]} 轮"
        else:
            detail = f"{len(entries)} 条"
        items.append(
            '<a class="reading-map-card" '
            f'href="#{_html(_slug(category))}">'
            f'<span>{_html(title)}</span>'
            f'<strong>{_html(detail)}</strong>'
            "</a>"
        )

    if has_scores:
        items.append(
            '<a class="reading-map-card" href="#scores">'
            "<span>评分走势</span>"
            "<strong>综合分与逐轮变化</strong>"
            "</a>"
        )

    if not items:
        return ""

    return f"""
<section class="reading-map" aria-label="阅读地图">
  <div class="reading-map-head">
    <span>阅读地图</span>
    <small>快速跳转到正文、裁判或评分区域</small>
  </div>
  <div class="reading-map-grid">
    {"".join(items)}
  </div>
</section>
""".strip()


def _render_entry(entry: dict[str, Any], index: int, *, include_thinking: bool) -> str:
    role = str(entry.get("role", "unknown"))
    accent, soft = _accent_for_role(role)
    citations = entry.get("citations", [])
    citation_links = ""
    if isinstance(citations, list) and citations:
        items = "\n".join(
            f'<li><a href="{_html(url)}" target="_blank" rel="noopener noreferrer">{_html(url)}</a></li>'
            for url in citations
            if str(url or "").strip()
        )
        if items:
            citation_links = f'<div class="citations"><strong>引用来源</strong><ul>{items}</ul></div>'

    agent = _agent_label(entry)
    role_heading = _compact_entry_role_heading(entry)
    summary = _entry_summary(entry)
    timestamp = str(entry.get("timestamp") or "").strip()
    timestamp_text = _format_minute_timestamp(timestamp, "") if timestamp else ""
    timestamp_html = f'<span class="message-time">{_html(timestamp_text)}</span>' if timestamp_text else ""
    agent_html = f'<strong class="agent-name">{_html(agent)}</strong>' if agent != role_heading else ""

    return f"""
<details class="message-card" open data-role="{_html(role)}" style="--agent-accent: {_html(accent)}; --agent-soft: {_html(soft)};">
  <summary class="message-header">
    <span class="message-identity">
      <span class="speaker-mark" aria-hidden="true"></span>
      <span class="speaker-text">
        <span class="speaker-row">
          <span class="agent-pill">{_html(role_heading)}</span>
          {agent_html}
        </span>
        <span class="message-context">
          <span class="turn-badge">{_html(_turn_label(entry, index))}</span>
          {timestamp_html}
        </span>
      </span>
    </span>
    <span class="message-toggle" aria-hidden="true">
      <span class="toggle-open">收起</span>
      <span class="toggle-closed">展开</span>
    </span>
    <span class="message-summary-text">{_html(summary)}</span>
  </summary>
  <div class="message-body-wrap">
    <div class="message-body markdown-body">
      {_render_text_content(entry.get("content"), include_thinking=include_thinking)}
      {citation_links}
    </div>
  </div>
</details>
""".strip()


def _render_transcript_sections(
    sections: list[tuple[str, str, list[dict[str, Any]]]],
    *,
    include_thinking: bool,
) -> tuple[str, list[int]]:
    rendered_sections: list[str] = []
    all_turns: list[int] = []
    seen_turns: set[int] = set()
    entry_global_index = 1

    for category, title, entries in sections:
        if not entries:
            continue
        ordered = sorted(enumerate(entries, start=1), key=lambda item: _entry_sort_key(item[1], item[0]))
        section_parts = [f'<section class="transcript-section" id="{_html(_slug(category))}">', f"<h2>{_html(title)}</h2>"]

        current_turn: int | None = None
        for local_index, entry in ordered:
            turn_number = _turn_number(entry)
            if turn_number is not None:
                should_anchor_turn = turn_number not in seen_turns
                if should_anchor_turn:
                    all_turns.append(turn_number)
                    seen_turns.add(turn_number)
                if turn_number != current_turn:
                    if current_turn is not None:
                        section_parts.append("</div>")
                    current_turn = turn_number
                    turn_id = f' id="turn-{turn_number}"' if should_anchor_turn else ""
                    section_parts.append(f'<div class="turn-group"{turn_id}>')
                    section_parts.append(f"<h3>第 {turn_number} 轮</h3>")
            elif current_turn is None:
                current_turn = -1
                section_parts.append('<div class="turn-group">')
                section_parts.append("<h3>未标记轮次</h3>")

            section_parts.append(
                _render_entry(
                    entry,
                    entry_global_index or local_index,
                    include_thinking=include_thinking,
                )
            )
            entry_global_index += 1

        if current_turn is not None:
            section_parts.append("</div>")
        section_parts.append("</section>")
        rendered_sections.append("\n".join(section_parts))

    return "\n".join(rendered_sections), sorted(all_turns)


def _is_numeric_score(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _format_score_plain(score: float | None) -> str:
    if score is None:
        return "-"
    rounded = round(score, 1)
    return str(int(rounded)) if rounded.is_integer() else f"{rounded:.1f}"


def _format_score_delta(delta: float) -> str:
    rounded = round(abs(delta), 1)
    return str(int(rounded)) if rounded.is_integer() else f"{rounded:.1f}"


def _score_bar_width(score: float | None) -> str:
    if score is None:
        return "0%"
    clamped = min(max(score, 0), 10)
    return f"{clamped * 10:.1f}%"


def _score_role_sort_key(role: str) -> tuple[int, str]:
    if role in PRIMARY_SCORE_ROLES:
        return (PRIMARY_SCORE_ROLES.index(role), role)
    return (len(PRIMARY_SCORE_ROLES), role)


def _score_value_at(value: Any, round_index: int) -> float | None:
    if isinstance(value, (list, tuple)):
        if round_index >= len(value):
            return None
        item = value[round_index]
        return float(item) if _is_numeric_score(item) else None
    if round_index == 0 and _is_numeric_score(value):
        return float(value)
    return None


def _cumulative_round_count(score_data: dict[str, Any]) -> int:
    round_count = 0
    for dim_key in DIM_LABELS:
        value = score_data.get(dim_key)
        if isinstance(value, (list, tuple)):
            round_count = max(round_count, len(value))
        elif _is_numeric_score(value):
            round_count = max(round_count, 1)
    return round_count


def _weighted_score_for_round(score_data: dict[str, Any], round_index: int) -> float | None:
    score_map: dict[str, float] = {}
    for dim_key in DIM_LABELS:
        score = _score_value_at(score_data.get(dim_key), round_index)
        if score is not None:
            score_map[dim_key] = score
    return weighted_average(score_map, tuple(score_map.keys()))


def _collect_cumulative_score_series(cumulative_scores: Any) -> dict[str, list[float | None]]:
    if not isinstance(cumulative_scores, dict):
        return {}

    series: dict[str, list[float | None]] = {}
    for role, score_data in sorted(cumulative_scores.items(), key=lambda item: _score_role_sort_key(str(item[0]))):
        if not isinstance(score_data, dict):
            continue
        round_count = _cumulative_round_count(score_data)
        values = [_weighted_score_for_round(score_data, index) for index in range(round_count)]
        if any(value is not None for value in values):
            series[str(role)] = values
    return series


def _collect_current_score_series(current_scores: Any) -> dict[str, list[float | None]]:
    if not isinstance(current_scores, dict):
        return {}

    series: dict[str, list[float | None]] = {}
    for role, score_data in sorted(current_scores.items(), key=lambda item: _score_role_sort_key(str(item[0]))):
        if not isinstance(score_data, dict):
            continue
        score = resolve_comprehensive_score(score_data)
        if score is not None:
            series[str(role)] = [score]
    return series


def _last_score(values: list[float | None]) -> float | None:
    for value in reversed(values):
        if value is not None:
            return value
    return None


def _average_score(values: list[float | None]) -> float | None:
    numeric_values = [value for value in values if value is not None]
    if not numeric_values:
        return None
    return round(sum(numeric_values) / len(numeric_values), 1)


def _round_leader_text(round_scores: dict[str, float | None]) -> str:
    available = [
        (role, score)
        for role, score in round_scores.items()
        if score is not None
    ]
    if not available:
        return "暂无评分"
    if len(available) == 1:
        role, score = available[0]
        return f"{_compact_role_label(role)} {_format_score_plain(score)} 分"

    ordered = sorted(available, key=lambda item: item[1], reverse=True)
    best_role, best_score = ordered[0]
    _, second_score = ordered[1]
    delta = round(best_score - second_score, 1)
    if delta <= 0:
        return "本轮持平"
    return f"{_compact_role_label(best_role)}领先 {_format_score_delta(delta)} 分"


def _render_score_outcome(series: dict[str, list[float | None]]) -> str:
    latest_scores = {
        role: _last_score(values)
        for role, values in series.items()
    }
    preferred_scores = {
        role: latest_scores.get(role)
        for role in PRIMARY_SCORE_ROLES
        if latest_scores.get(role) is not None
    }
    comparison_scores = preferred_scores if len(preferred_scores) >= 2 else latest_scores
    available = [
        (role, score)
        for role, score in comparison_scores.items()
        if score is not None
    ]
    if len(available) < 2:
        return ""

    ordered = sorted(available, key=lambda item: item[1], reverse=True)
    best_role, best_score = ordered[0]
    second_role, second_score = ordered[1]
    delta = round(best_score - second_score, 1)
    if delta <= 0:
        headline = "最终轮双方持平"
        detail = f"{_compact_role_label(best_role)}与{_compact_role_label(second_role)}同为 {_format_score_plain(best_score)} 分"
    else:
        headline = f"{_compact_role_label(best_role)}暂时领先"
        detail = f"领先{_compact_role_label(second_role)} {_format_score_delta(delta)} 分"

    return f"""
<div class="score-outcome">
  <span>最终轮概览</span>
  <strong>{_html(headline)}</strong>
  <small>{_html(detail)}</small>
</div>
""".strip()


def _render_score_summary(series: dict[str, list[float | None]]) -> str:
    items: list[str] = []
    for role, values in series.items():
        accent, soft = _accent_for_role(role)
        latest = _last_score(values)
        average = _average_score(values)
        round_count = len([value for value in values if value is not None])
        items.append(
            '<div class="score-summary-card" style="--agent-accent: '
            f'{_html(accent)}; --agent-soft: {_html(soft)};">'
            f'<span>{_html(_compact_role_label(role))}</span>'
            f'<strong>{_html(format_score(latest))}</strong>'
            f'<small>平均 {_html(format_score(average))} · {_html(round_count)} 轮</small>'
            "</div>"
        )
    return f'<div class="score-summary-grid">{"".join(items)}</div>' if items else ""


def _render_score_timeline(series: dict[str, list[float | None]]) -> str:
    if not series:
        return ""

    role_order = list(series.keys())
    round_count = max((len(values) for values in series.values()), default=0)
    rounds: list[str] = []
    for round_index in range(round_count):
        round_scores = {
            role: values[round_index] if round_index < len(values) else None
            for role, values in series.items()
        }
        bar_rows: list[str] = []
        for role in role_order:
            score = round_scores.get(role)
            if score is None:
                continue
            accent, soft = _accent_for_role(role)
            bar_rows.append(
                '<div class="score-bar-row" style="--agent-accent: '
                f'{_html(accent)}; --agent-soft: {_html(soft)};">'
                f'<span class="score-bar-label">{_html(_compact_role_label(role))}</span>'
                '<span class="score-bar-track">'
                f'<span class="score-bar-fill" style="--score-size: {_html(_score_bar_width(score))};"></span>'
                "</span>"
                f'<strong>{_html(_format_score_plain(score))}</strong>'
                "</div>"
            )
        if not bar_rows:
            continue
        rounds.append(
            '<article class="score-round">'
            '<div class="score-round-head">'
            f'<span>第 {round_index + 1} 轮</span>'
            f'<strong>{_html(_round_leader_text(round_scores))}</strong>'
            "</div>"
            f'<div class="score-bars">{"".join(bar_rows)}</div>'
            "</article>"
        )

    return f'<div class="score-timeline">{"".join(rounds)}</div>' if rounds else ""


def _render_scores(session_data: dict[str, Any]) -> str:
    cumulative_series = _collect_cumulative_score_series(session_data.get("cumulative_scores", {}))
    series = cumulative_series or _collect_current_score_series(session_data.get("current_scores", {}))
    if not series:
        return ""

    is_cumulative = bool(cumulative_series)
    title = "逐轮综合分走势" if is_cumulative else "最新评分概览"
    note = (
        "按六项评分权重汇总每轮结果，已隐藏最后一轮逐项评分表。"
        if is_cumulative
        else "当前导出只包含最新轮评分，因此仅保留综合分概览。"
    )

    return f"""
<section class="score-section score-trend-section" id="scores" aria-label="{_html(title)}">
  <div class="score-section-head">
    <div>
      <p class="section-kicker">评分</p>
      <h2>{_html(title)}</h2>
    </div>
    <p>{_html(note)}</p>
  </div>
  {_render_score_outcome(series)}
  {_render_score_summary(series)}
  {_render_score_timeline(series)}
</section>
""".strip()


def _styles() -> str:
    return """
:root {
  color-scheme: light;
  --page-bg: #f7f8fa;
  --surface: #ffffff;
  --surface-muted: #f2f4f7;
  --surface-hover: #eef1f5;
  --text: #1d232b;
  --text-secondary: #56616f;
  --text-muted: #7d8794;
  --border: #dce1e8;
  --border-strong: #c6ced8;
  --focus: #516a8d;
  --shadow: 0 10px 28px rgba(29, 35, 43, 0.06);
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  margin: 0;
  background: var(--page-bg);
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", "PingFang SC", "Microsoft YaHei", Arial, sans-serif;
  font-size: 16px;
  line-height: 1.8;
}
a { color: #3f6382; overflow-wrap: anywhere; }
.page {
  width: min(100%, 960px);
  margin: 0 auto;
  padding: 32px 24px 64px;
}
.hero {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 22px 24px;
  box-shadow: var(--shadow);
}
.hero-main {
  display: block;
}
.title-block {
  min-width: 0;
}
.eyebrow {
  margin: 0 0 6px;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
h1 {
  margin: 0;
  font-size: clamp(22px, 3.5vw, 30px);
  line-height: 1.3;
  letter-spacing: 0;
}
.meta-strip {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-start;
  gap: 6px;
  margin-top: 12px;
}
.meta-item {
  min-width: 0;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 30px;
  padding: 4px 10px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface-muted);
}
.meta-item span {
  color: var(--text-muted);
  font-size: 12px;
}
.meta-item strong {
  color: var(--text);
  font-size: 12px;
  font-weight: 650;
  overflow-wrap: anywhere;
}
.speech-stats {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid var(--border);
}
.speech-stats-heading {
  flex: 0 0 auto;
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.speech-stats-heading span {
  color: var(--text);
  font-size: 13px;
  font-weight: 750;
}
.speech-stats-heading small {
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 600;
}
.speech-stats-grid {
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.speech-stat-item {
  min-width: 0;
  display: inline-flex;
  align-items: baseline;
  gap: 5px;
  min-height: 30px;
  padding: 4px 10px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface);
}
.speech-stat-item::before {
  content: "";
  flex: 0 0 auto;
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: var(--border-strong);
}
.speech-stat-item[data-role="proposer"]::before {
  background: #5b8073;
}
.speech-stat-item[data-role="opposer"]::before {
  background: #9a6a72;
}
.speech-stat-item span,
.speech-stat-item small {
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 650;
}
.speech-stat-item strong {
  color: var(--text);
  font-size: 14px;
  line-height: 1.15;
  font-weight: 760;
  font-variant-numeric: tabular-nums;
}
.reading-map {
  margin: 20px 0;
  padding: 18px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface);
}
.reading-map-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.reading-map-head span {
  color: var(--text);
  font-size: 14px;
  font-weight: 760;
}
.reading-map-head small {
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 600;
  text-align: right;
}
.reading-map-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 8px;
}
.reading-map-card {
  display: grid;
  gap: 3px;
  min-width: 0;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-muted);
  color: inherit;
  text-decoration: none;
  transition: background 0.15s ease;
}
.reading-map-card:hover {
  background: var(--surface-hover);
}
.reading-map-card span {
  color: var(--text);
  font-size: 13px;
  font-weight: 720;
}
.reading-map-card strong {
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 620;
  overflow-wrap: anywhere;
}
.toolbar {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 16px 0;
  padding: 10px 12px;
  background: rgba(247, 248, 250, 0.92);
  border: 1px solid var(--border);
  border-radius: 10px;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}
.toolbar button {
  appearance: none;
  border: 1px solid var(--border-strong);
  background: var(--surface);
  color: var(--text);
  border-radius: 7px;
  padding: 7px 13px;
  font: inherit;
  font-size: 13px;
  font-weight: 650;
  cursor: pointer;
  transition: background 0.15s ease;
  white-space: nowrap;
}
.toolbar button:hover {
  background: var(--surface-hover);
}
.toolbar button:focus-visible,
.reading-map-card:focus-visible,
.turn-link:focus-visible,
summary:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
.turn-nav {
  min-width: 0;
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding: 2px 0 4px;
  margin-left: auto;
  -webkit-overflow-scrolling: touch;
}
.turn-link {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  min-height: 32px;
  padding: 5px 12px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 650;
  text-decoration: none;
  transition: background 0.15s ease;
}
.turn-link:hover {
  background: var(--surface-hover);
}
.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 20px 0;
}
.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 6px 12px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 650;
}
.legend-item i {
  width: 9px;
  height: 9px;
  border-radius: 999px;
  background: var(--agent-accent);
}
.transcript-section,
.score-section {
  margin-top: 24px;
  padding: 28px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface);
}
h2 {
  margin: 0 0 20px;
  font-size: 20px;
  line-height: 1.4;
}
.turn-group {
  scroll-margin-top: 100px;
  margin-top: 28px;
  padding-top: 4px;
}
.turn-group h3 {
  display: flex;
  align-items: center;
  gap: 14px;
  margin: 0 0 16px;
  padding-bottom: 12px;
  color: var(--text-secondary);
  font-size: 15px;
  font-weight: 600;
  line-height: 1.5;
}
.turn-group h3::after {
  content: "";
  flex: 1 1 auto;
  height: 1px;
  background: linear-gradient(to right, var(--border), transparent);
}
.message-card {
  position: relative;
  margin: 10px 0;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
  overflow: hidden;
  transition: border-color 0.15s ease;
}
.message-card::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: var(--agent-accent);
}
.message-card[open] {
  border-color: var(--border-strong);
}
.message-header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px 12px;
  padding: 13px 16px 13px 20px;
  cursor: pointer;
  list-style: none;
  background: var(--surface);
  transition: background 0.15s ease;
}
.message-header:hover {
  background: var(--surface-muted);
}
summary::-webkit-details-marker { display: none; }
.message-identity {
  min-width: 0;
  display: flex;
  align-items: flex-start;
  gap: 10px;
}
.speaker-mark {
  flex: 0 0 auto;
  width: 8px;
  height: 8px;
  margin-top: 10px;
  border-radius: 999px;
  background: var(--agent-accent);
  box-shadow: 0 0 0 4px var(--agent-soft);
}
.speaker-text {
  min-width: 0;
  display: grid;
  gap: 3px;
}
.speaker-row {
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.agent-pill {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 2px 10px;
  border-radius: 999px;
  background: var(--agent-soft);
  color: var(--agent-accent);
  font-size: 12px;
  font-weight: 760;
}
.agent-name {
  color: var(--text);
  font-size: 13px;
  font-weight: 600;
  overflow-wrap: anywhere;
}
.message-context {
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.turn-badge,
.message-time {
  color: var(--text-muted);
  font-size: 11px;
}
.message-time::before {
  content: "·";
  margin-right: 6px;
  color: var(--border-strong);
}
.message-toggle {
  align-self: start;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 42px;
  min-height: 28px;
  padding: 4px 10px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface);
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 650;
  line-height: 1.2;
}
.message-card:not([open]) .toggle-open,
.message-card[open] .toggle-closed {
  display: none;
}
.message-summary-text {
  grid-column: 1 / -1;
  padding-left: 20px;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.6;
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.message-card[open] .message-summary-text { display: none; }
.message-body-wrap {
  border-top: 1px solid var(--border);
  background: var(--surface);
}
.message-body {
  padding: 18px 20px 22px;
  color: var(--text);
  overflow-wrap: anywhere;
}
.thinking-panel {
  margin: 0 0 16px;
  border: 1px solid var(--border);
  border-left: 3px solid var(--agent-accent);
  border-radius: 10px;
  background: var(--surface-muted);
  overflow: hidden;
}
.thinking-panel summary {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 14px;
  background: var(--surface-muted);
  cursor: pointer;
}
.thinking-panel summary::after {
  content: "";
  display: none;
}
.thinking-panel summary span {
  color: var(--agent-accent);
  font-size: 12px;
  font-weight: 750;
}
.thinking-panel summary small {
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 600;
}
.thinking-body {
  padding: 0 14px 14px;
}
.empty-content {
  color: var(--text-muted);
}
.citations {
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid var(--border);
}
.citations strong {
  display: block;
  margin-bottom: 6px;
  color: var(--text-secondary);
  font-size: 13px;
}
.citations ul {
  margin: 0;
  padding-left: 18px;
}
.citations li {
  margin: 4px 0;
  word-break: break-all;
}
.markdown-body {
  color: var(--text);
  line-height: 1.85;
  width: 100%;
}
.markdown-body > :first-child {
  margin-top: 0;
}
.markdown-body > :last-child {
  margin-bottom: 0;
}
.markdown-body h1,
.markdown-body h2,
.markdown-body h3,
.markdown-body h4,
.markdown-body h5,
.markdown-body h6 {
  margin: 1.5em 0 0.7em;
  color: var(--text);
  line-height: 1.35;
  font-weight: 700;
}
.markdown-body h1 { font-size: 1.5em; }
.markdown-body h2 { font-size: 1.3em; }
.markdown-body h3 { font-size: 1.15em; }
.markdown-body h4,
.markdown-body h5,
.markdown-body h6 { font-size: 1em; }
.markdown-body p {
  margin: 1em 0;
}
.markdown-body ul,
.markdown-body ol,
.markdown-body blockquote,
.markdown-body pre,
.markdown-body table {
  margin: 0.85em 0;
}
.markdown-body ul,
.markdown-body ol {
  padding-left: 1.6em;
}
.markdown-body li {
  margin: 0.35em 0;
}
.markdown-body li > ul,
.markdown-body li > ol {
  margin-top: 0.2em;
}
.markdown-body code {
  padding: 0.15em 0.4em;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--surface-muted);
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", "PingFang SC Mono", monospace;
  font-size: 0.88em;
  word-break: break-word;
}
.markdown-body pre {
  overflow-x: auto;
  padding: 14px 16px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface-muted);
  -webkit-overflow-scrolling: touch;
}
.markdown-body pre code {
  padding: 0;
  border: 0;
  background: transparent;
}
.markdown-body blockquote {
  margin-left: 0;
  margin-right: 0;
  padding: 12px 16px;
  border-left: 3px solid var(--agent-accent);
  border-radius: 0 10px 10px 0;
  background: var(--surface-muted);
  color: var(--text-secondary);
}
.markdown-body blockquote p {
  margin: 0.4em 0;
}
.markdown-body table {
  display: block;
  width: 100%;
  overflow-x: auto;
  border-collapse: collapse;
  font-size: 0.95em;
  -webkit-overflow-scrolling: touch;
}
.markdown-body th,
.markdown-body td {
  padding: 9px 12px;
  border: 1px solid var(--border);
  text-align: left;
  vertical-align: top;
}
.markdown-body th {
  background: var(--surface-muted);
  color: var(--text-secondary);
  font-weight: 700;
}
.markdown-body tr:nth-child(even) {
  background: #fafbfc;
}
.markdown-body hr {
  border: 0;
  border-top: 1px solid var(--border);
  margin: 1.6em 0;
}
.markdown-body img {
  max-width: 100%;
  height: auto;
  border-radius: 8px;
}
.score-section-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}
.score-section-head h2 {
  margin-bottom: 0;
}
.score-section-head p:last-child {
  max-width: 360px;
  margin: 2px 0 0;
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1.6;
  text-align: right;
}
.section-kicker {
  margin: 0 0 4px;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 750;
}
.score-outcome {
  display: grid;
  gap: 3px;
  margin-bottom: 12px;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-muted);
}
.score-outcome span,
.score-outcome small {
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 650;
}
.score-outcome strong {
  color: var(--text);
  font-size: 18px;
  line-height: 1.35;
}
.score-summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 10px;
  margin-bottom: 16px;
}
.score-summary-card {
  display: grid;
  gap: 4px;
  padding: 12px 13px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  box-shadow: inset 3px 0 0 var(--agent-accent);
}
.score-summary-card span {
  color: var(--agent-accent);
  font-size: 12px;
  font-weight: 760;
}
.score-summary-card strong {
  color: var(--text);
  font-size: 24px;
  line-height: 1.15;
  font-variant-numeric: tabular-nums;
}
.score-summary-card small {
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 600;
}
.score-timeline {
  display: grid;
  gap: 10px;
}
.score-round {
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
}
.score-round-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}
.score-round-head span {
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 700;
}
.score-round-head strong {
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 750;
  text-align: right;
}
.score-bars {
  display: grid;
  gap: 8px;
}
.score-bar-row {
  display: grid;
  grid-template-columns: 54px minmax(0, 1fr) 42px;
  align-items: center;
  gap: 10px;
}
.score-bar-label {
  min-width: 0;
  color: var(--agent-accent);
  font-size: 12px;
  font-weight: 760;
  white-space: nowrap;
}
.score-bar-track {
  position: relative;
  height: 10px;
  border-radius: 999px;
  background: var(--surface-muted);
  overflow: hidden;
}
.score-bar-fill {
  display: block;
  width: var(--score-size);
  height: 100%;
  border-radius: inherit;
  background: var(--agent-accent);
}
.score-bar-row strong {
  color: var(--text);
  font-size: 13px;
  font-weight: 760;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.footer {
  margin-top: 32px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
  color: var(--text-muted);
  text-align: center;
  font-size: 12px;
}
@media (max-width: 720px) {
  body { font-size: 15px; line-height: 1.75; }
  .page { padding: 16px 14px 40px; }
  .hero {
    padding: 18px 16px;
    border-radius: 10px;
  }
  .hero-main {
    display: block;
  }
  .meta-strip {
    justify-content: flex-start;
    margin-top: 10px;
  }
  .speech-stats {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
    margin-top: 14px;
    padding-top: 12px;
  }
  .speech-stats-grid {
    width: 100%;
    gap: 6px;
  }
  .speech-stat-item {
    padding: 4px 8px;
  }
  .speech-stat-item strong {
    font-size: 14px;
  }
  .toolbar {
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    margin: 12px 0;
    padding: 8px;
    overflow: hidden;
  }
  .reading-map {
    margin: 14px 0;
    padding: 14px;
    border-radius: 10px;
  }
  .reading-map-head {
    display: grid;
    gap: 2px;
  }
  .reading-map-head small {
    text-align: left;
  }
  .reading-map-grid {
    grid-template-columns: 1fr 1fr;
  }
  .toolbar button {
    flex: 0 0 auto;
    min-height: 32px;
    padding: 5px 10px;
    font-size: 13px;
    line-height: 1.35;
  }
  .turn-nav {
    flex: 1 1 100%;
    order: 1;
    margin-left: 0;
    gap: 6px;
    padding: 2px 0 0;
    overflow-x: auto;
  }
  .turn-link {
    min-height: 30px;
    padding: 5px 10px;
    font-size: 12px;
  }
  .transcript-section,
  .score-section {
    padding: 18px 16px;
    border-radius: 10px;
    margin-top: 20px;
  }
  h2 {
    margin-bottom: 16px;
    font-size: 18px;
  }
  .turn-group {
    margin-top: 22px;
  }
  .message-header {
    grid-template-columns: minmax(0, 1fr) auto;
    padding: 12px 14px 12px 16px;
  }
  .message-identity {
    gap: 9px;
  }
  .message-toggle {
    min-width: 40px;
    min-height: 26px;
    padding: 3px 8px;
  }
  .message-summary-text {
    padding-left: 16px;
  }
  .message-body {
    padding: 14px 16px 18px;
  }
  .markdown-body {
    line-height: 1.75;
  }
  .score-section-head {
    display: grid;
    gap: 8px;
  }
  .score-section-head p:last-child {
    max-width: none;
    text-align: left;
  }
  .score-summary-grid {
    grid-template-columns: 1fr 1fr;
  }
  .score-round {
    padding: 12px 14px;
  }
  .score-round-head {
    align-items: flex-start;
  }
  .score-bar-row {
    grid-template-columns: 44px minmax(0, 1fr) 36px;
    gap: 8px;
  }
}
@media (max-width: 480px) {
  body {
    font-size: 15px;
    line-height: 1.75;
  }
  .page {
    padding: 12px 10px 32px;
  }
  .hero {
    padding: 14px 12px;
    border-radius: 8px;
  }
  h1 {
    font-size: 20px;
  }
  .reading-map {
    padding: 12px;
  }
  .reading-map-grid {
    grid-template-columns: 1fr;
  }
  .toolbar {
    padding: 6px;
    gap: 5px;
    border-radius: 8px;
  }
  .toolbar button {
    min-height: 30px;
    padding: 4px 8px;
    font-size: 12px;
  }
  .turn-nav {
    gap: 5px;
  }
  .transcript-section,
  .score-section {
    padding: 14px 12px;
    border-radius: 8px;
  }
  h2 {
    font-size: 17px;
    margin-bottom: 14px;
  }
  .turn-group {
    margin-top: 18px;
  }
  .turn-group h3 {
    margin-bottom: 12px;
    padding-bottom: 10px;
    font-size: 14px;
  }
  .message-card {
    margin: 8px 0;
    border-radius: 8px;
  }
  .message-header {
    padding: 10px 12px 10px 14px;
    gap: 6px 10px;
  }
  .message-body {
    padding: 12px 14px 16px;
  }
  .markdown-body {
    line-height: 1.75;
  }
  .markdown-body blockquote {
    padding: 10px 12px;
  }
  .markdown-body pre {
    padding: 10px 12px;
    border-radius: 8px;
  }
  .speech-stats-heading {
    flex-wrap: wrap;
    row-gap: 2px;
  }
  .message-header {
    grid-template-columns: 1fr;
  }
  .message-toggle {
    justify-self: start;
  }
  .score-round-head {
    display: grid;
    gap: 4px;
  }
  .score-round-head strong {
    text-align: left;
  }
  .score-summary-grid {
    grid-template-columns: 1fr;
  }
  .score-bar-row {
    grid-template-columns: 40px minmax(0, 1fr) 32px;
    gap: 6px;
  }
  .score-bar-label {
    font-size: 11px;
  }
  .score-bar-row strong {
    font-size: 12px;
  }
}
@media print {
  body { background: #fff; font-size: 12pt; line-height: 1.6; }
  .page { width: 100%; padding: 0; max-width: none; }
  .toolbar, .reading-map, .legend { display: none; }
  .hero,
  .transcript-section,
  .score-section,
  .message-card { box-shadow: none; break-inside: avoid; }
  .turn-group {
    break-inside: auto;
    page-break-before: auto;
  }
  .message-card[open] .message-summary-text { display: none !important; }
}
""".strip()


def _script() -> str:
    return """
(function () {
  function setAll(open) {
    document.querySelectorAll('details.message-card').forEach(function (node) {
      node.open = open;
    });
  }
  var expand = document.querySelector('[data-action="expand-all"]');
  var collapse = document.querySelector('[data-action="collapse-all"]');
  if (expand) expand.addEventListener('click', function () { setAll(true); });
  if (collapse) collapse.addEventListener('click', function () { setAll(false); });
})();
""".strip()


def export_html(session_data: dict[str, Any], categories: list[str] | tuple[str, ...] | None = None) -> str:
    normalized_categories = normalize_markdown_export_categories(categories)
    sections = _collect_category_entries(session_data, normalized_categories)
    transcript_html, turns = _render_transcript_sections(
        sections,
        include_thinking=_should_include_thinking(normalized_categories),
    )
    participants = session_data.get("participants", [])
    roles = _collect_roles(sections, participants if isinstance(participants, list) else [])
    speech_stats = _collect_speech_text_stats(session_data)
    topic = _plain(session_data.get("topic"), "未命名辩题")
    scores_html = _render_scores(session_data)
    empty_state = '<section class="transcript-section"><h2>辩论正文</h2><p class="empty-content">暂无可导出的发言。</p></section>'

    return f"""<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{_html(topic)} - Elenchus 辩论记录</title>
  <style>{_styles()}</style>
</head>
<body>
  <main class="page">
    <header class="hero">
      <div class="hero-main">
        <div class="title-block">
          <p class="eyebrow">Elenchus 辩论记录</p>
          <h1>{_html(topic)}</h1>
        </div>
        <div class="meta-strip" aria-label="导出摘要">
          {_render_meta_strip(session_data)}
        </div>
      </div>
      {_render_speech_stats(speech_stats)}
    </header>

    {_render_reading_map(sections, has_scores=bool(scores_html))}

    <section class="toolbar" aria-label="阅读工具">
      <button type="button" data-action="expand-all">全部展开</button>
      <button type="button" data-action="collapse-all">全部收起</button>
      {_render_turn_nav(turns)}
    </section>

    {_render_legend(roles)}

    {transcript_html or empty_state}

    {scores_html}

    <footer class="footer">由 Elenchus 导出</footer>
  </main>
  <script>{_script()}</script>
</body>
</html>
"""
