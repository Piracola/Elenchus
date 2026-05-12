from __future__ import annotations

import re
from datetime import UTC, datetime
from html import escape
from typing import Any

from .markdown import (
    is_debater_speech_entry,
    normalize_markdown_export_categories,
    role_label,
)
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

ROLE_ACCENTS = {
    "proposer": ("#5b8073", "#edf4f0"),
    "opposer": ("#9a6a72", "#f7eef0"),
    "judge": ("#9b7a4d", "#f7f2e9"),
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
URL_RE = re.compile(r"(https?://[^\s<>()]+)")


def _html(value: Any) -> str:
    return escape(str(value), quote=True)


def _plain(value: Any, fallback: str = "-") -> str:
    text = str(value or "").strip()
    return text or fallback


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


def _agent_label(entry: dict[str, Any]) -> str:
    agent_name = str(entry.get("agent_name") or "").strip()
    return agent_name or _role_heading(entry)


def _accent_for_role(role: str) -> tuple[str, str]:
    if role in ROLE_ACCENTS:
        return ROLE_ACCENTS[role]
    checksum = sum(ord(char) for char in role)
    return ACCENT_POOL[checksum % len(ACCENT_POOL)]


def _render_text_content(content: Any) -> str:
    text = str(content or "")
    if not text.strip():
        return '<p class="empty-content">（无内容）</p>'

    paragraphs = re.split(r"\n{2,}", text.strip())
    rendered: list[str] = []
    for paragraph in paragraphs:
        parts: list[str] = []
        last_index = 0
        for match in URL_RE.finditer(paragraph):
            parts.append(_html(paragraph[last_index:match.start()]).replace("\n", "<br>"))
            url = match.group(1)
            safe_url = _html(url)
            parts.append(f'<a href="{safe_url}" target="_blank" rel="noopener noreferrer">{safe_url}</a>')
            last_index = match.end()
        parts.append(_html(paragraph[last_index:]).replace("\n", "<br>"))
        rendered.append(f"<p>{''.join(parts)}</p>")
    return "\n".join(rendered)


def _entry_summary(entry: dict[str, Any]) -> str:
    content = re.sub(r"\s+", " ", str(entry.get("content") or "")).strip()
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
    team_history = session_data.get("team_dialogue_history", [])
    jury_history = session_data.get("jury_dialogue_history", [])

    category_entries: dict[str, list[dict[str, Any]]] = {
        "debater_speeches": [
            entry for entry in history if isinstance(entry, dict) and is_debater_speech_entry(entry, participants)
        ],
        "group_discussion": [
            entry for entry in team_history if isinstance(entry, dict)
        ],
        "judge_messages": [
            entry for entry in history if isinstance(entry, dict) and str(entry.get("role", "")) == "judge"
        ],
        "jury_messages": [
            entry
            for entry in jury_history
            if isinstance(entry, dict) and str(entry.get("role", "")) != "consensus_summary"
        ],
        "consensus_summary": [
            entry
            for entry in jury_history
            if isinstance(entry, dict) and str(entry.get("role", "")) == "consensus_summary"
        ],
    }
    category_titles = {
        "debater_speeches": "辩手发言",
        "group_discussion": "组内讨论",
        "judge_messages": "裁判消息",
        "jury_messages": "审判团消息",
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


def _render_meta_grid(session_data: dict[str, Any]) -> str:
    participants = session_data.get("participants", [])
    participant_text = ", ".join(role_label(str(p)) for p in participants) if isinstance(participants, list) else "-"
    items = [
        ("状态", _plain(session_data.get("status"))),
        ("轮次", f"{_plain(session_data.get('current_turn'), '0')} / {_plain(session_data.get('max_turns'), '0')}"),
        ("参与者", participant_text or "-"),
        ("创建时间", _plain(session_data.get("created_at"))),
        ("导出时间", datetime.now(UTC).isoformat()),
    ]
    return "\n".join(
        f'<div class="meta-item"><span>{_html(label)}</span><strong>{_html(value)}</strong></div>'
        for label, value in items
    )


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
            f"{_html(role_label(role))}"
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


def _render_entry(entry: dict[str, Any], index: int) -> str:
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
    role_heading = _role_heading(entry)
    summary = _entry_summary(entry)
    timestamp = str(entry.get("timestamp") or "").strip()
    timestamp_html = f'<span class="message-time">{_html(timestamp)}</span>' if timestamp else ""

    return f"""
<details class="message-card" open style="--agent-accent: {_html(accent)}; --agent-soft: {_html(soft)};">
  <summary>
    <span class="message-summary-main">
      <span class="agent-pill">{_html(role_heading)}</span>
      <span class="agent-name">{_html(agent)}</span>
      <span class="turn-badge">{_html(_turn_label(entry, index))}</span>
      {timestamp_html}
    </span>
    <span class="message-summary-text">{_html(summary)}</span>
  </summary>
  <div class="message-body">
    {_render_text_content(entry.get("content"))}
    {citation_links}
  </div>
</details>
""".strip()


def _render_transcript_sections(sections: list[tuple[str, str, list[dict[str, Any]]]]) -> tuple[str, list[int]]:
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

            section_parts.append(_render_entry(entry, entry_global_index or local_index))
            entry_global_index += 1

        if current_turn is not None:
            section_parts.append("</div>")
        section_parts.append("</section>")
        rendered_sections.append("\n".join(section_parts))

    return "\n".join(rendered_sections), sorted(all_turns)


def _render_scores(session_data: dict[str, Any]) -> str:
    current_scores = session_data.get("current_scores", {})
    cumulative_scores = session_data.get("cumulative_scores", {})
    parts: list[str] = []

    if isinstance(current_scores, dict) and current_scores:
        parts.append('<section class="score-section"><h2>当前评分</h2>')
        for role, scores in current_scores.items():
            if not isinstance(scores, dict):
                continue
            parts.append(f"<h3>{_html(role_label(str(role)))}</h3>")
            comprehensive_score = resolve_comprehensive_score(scores)
            if comprehensive_score is not None:
                parts.append(f'<p class="score-highlight">综合评分：{_html(format_score(comprehensive_score))}</p>')

            module_scores = resolve_module_scores(scores)
            if module_scores:
                rows = []
                for module_key, module_label in MODULE_LABELS.items():
                    rows.append(
                        "<tr>"
                        f"<td>{_html(module_label)}</td>"
                        f"<td>{MODULE_WEIGHTS[module_key]}%</td>"
                        f"<td>{_html(format_score(module_scores.get(module_key)))}</td>"
                        "</tr>"
                    )
                parts.append(
                    '<div class="table-wrap"><table><thead><tr><th>模块</th><th>占比</th><th>得分</th></tr></thead>'
                    f"<tbody>{''.join(rows)}</tbody></table></div>"
                )

            dim_rows = []
            for dim_key, dim_label in DIM_LABELS.items():
                dim_data = scores.get(dim_key, {})
                if isinstance(dim_data, dict):
                    score = format_score(dim_data.get("score"))
                    rationale = dim_data.get("rationale") or "-"
                else:
                    score = "-"
                    rationale = "-"
                dim_rows.append(
                    "<tr>"
                    f"<td>{_html(dim_label)}</td>"
                    f"<td>{DIM_WEIGHTS[dim_key]}%</td>"
                    f"<td>{_html(score)}</td>"
                    f"<td>{_html(rationale)}</td>"
                    "</tr>"
                )
            parts.append(
                '<div class="table-wrap"><table><thead><tr><th>底层维度</th><th>权重</th><th>得分</th><th>评语</th></tr></thead>'
                f"<tbody>{''.join(dim_rows)}</tbody></table></div>"
            )

            overall = scores.get("overall_comment")
            if overall:
                parts.append(f'<p class="overall-comment">整体评语：{_html(overall)}</p>')
        parts.append("</section>")

    if isinstance(cumulative_scores, dict) and cumulative_scores:
        parts.append('<section class="score-section"><h2>累计得分趋势</h2>')
        for role, score_data in cumulative_scores.items():
            if not isinstance(score_data, dict):
                continue
            parts.append(f"<h3>{_html(role_label(str(role)))}</h3>")
            items = "\n".join(
                f"<li><span>{_html(dim_label)}</span><strong>{_html(format_cumulative_value(score_data.get(dim_key)))}</strong></li>"
                for dim_key, dim_label in DIM_LABELS.items()
            )
            parts.append(f'<ul class="trend-list">{items}</ul>')
        parts.append("</section>")

    return "\n".join(parts)


def _styles() -> str:
    return """
:root {
  color-scheme: light;
  --page-bg: #f6f6f4;
  --surface: #ffffff;
  --surface-muted: #f2f2ef;
  --text: #1f1f1f;
  --text-secondary: #5f5f5f;
  --text-muted: #878787;
  --border: #deded8;
  --border-strong: #c8c8c0;
  --shadow: 0 8px 24px rgba(20, 20, 20, 0.06);
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  margin: 0;
  background: var(--page-bg);
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif;
  font-size: 15px;
  line-height: 1.7;
}
a { color: #3f5f75; overflow-wrap: anywhere; }
.page {
  width: min(100%, 980px);
  margin: 0 auto;
  padding: 32px 20px 48px;
}
.hero {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 28px;
  box-shadow: var(--shadow);
}
.eyebrow {
  margin: 0 0 8px;
  color: var(--text-muted);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0;
}
h1 {
  margin: 0;
  font-size: clamp(24px, 4vw, 36px);
  line-height: 1.25;
  letter-spacing: 0;
}
.meta-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin-top: 22px;
}
.meta-item {
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-muted);
}
.meta-item span {
  display: block;
  color: var(--text-muted);
  font-size: 12px;
}
.meta-item strong {
  display: block;
  margin-top: 2px;
  color: var(--text);
  font-size: 13px;
  font-weight: 650;
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
  padding: 10px;
  background: rgba(246, 246, 244, 0.94);
  border: 1px solid var(--border);
  border-radius: 10px;
  backdrop-filter: blur(8px);
}
.toolbar button {
  appearance: none;
  border: 1px solid var(--border-strong);
  background: var(--surface);
  color: var(--text);
  border-radius: 8px;
  padding: 7px 11px;
  font: inherit;
  font-size: 13px;
  font-weight: 650;
  cursor: pointer;
}
.toolbar button:focus-visible,
.turn-link:focus-visible,
summary:focus-visible {
  outline: 2px solid #6f7892;
  outline-offset: 2px;
}
.turn-nav {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 2px 0 4px;
  margin-left: auto;
}
.turn-link {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  min-height: 32px;
  padding: 5px 10px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 650;
  text-decoration: none;
}
.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 18px 0;
}
.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 6px 10px;
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
  margin-top: 18px;
  padding: 24px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface);
}
h2 {
  margin: 0 0 16px;
  font-size: 21px;
  line-height: 1.35;
}
.turn-group {
  scroll-margin-top: 96px;
  margin-top: 18px;
}
.turn-group h3,
.score-section h3 {
  margin: 0 0 10px;
  color: var(--text-secondary);
  font-size: 15px;
  line-height: 1.5;
}
.message-card {
  margin: 10px 0;
  border: 1px solid var(--border);
  border-left: 4px solid var(--agent-accent);
  border-radius: 8px;
  background: var(--surface);
  overflow: hidden;
}
.message-card[open] {
  background: linear-gradient(90deg, var(--agent-soft), #fff 34%);
}
summary {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 14px;
  cursor: pointer;
  list-style: none;
}
summary::-webkit-details-marker { display: none; }
summary::after {
  content: "展开";
  align-self: flex-start;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 650;
}
.message-card[open] summary::after { content: "收起"; }
.message-summary-main {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 7px;
  min-width: 0;
}
.agent-pill {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--agent-soft);
  color: var(--agent-accent);
  font-size: 12px;
  font-weight: 750;
}
.agent-name {
  color: var(--text);
  font-size: 13px;
  font-weight: 700;
}
.turn-badge,
.message-time {
  color: var(--text-muted);
  font-size: 12px;
}
.message-summary-text {
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.55;
  overflow-wrap: anywhere;
}
.message-card[open] .message-summary-text { display: none; }
.message-body {
  padding: 0 18px 16px;
  color: var(--text);
  overflow-wrap: anywhere;
}
.message-body p {
  margin: 0 0 12px;
}
.empty-content {
  color: var(--text-muted);
}
.citations {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}
.citations strong {
  display: block;
  margin-bottom: 4px;
  color: var(--text-secondary);
  font-size: 13px;
}
.citations ul {
  margin: 0;
  padding-left: 18px;
}
.table-wrap {
  width: 100%;
  overflow-x: auto;
  margin: 10px 0 18px;
  border: 1px solid var(--border);
  border-radius: 8px;
}
table {
  width: 100%;
  border-collapse: collapse;
  min-width: 620px;
}
th,
td {
  padding: 9px 11px;
  border-bottom: 1px solid var(--border);
  text-align: left;
  vertical-align: top;
}
th {
  background: var(--surface-muted);
  color: var(--text-secondary);
  font-size: 12px;
}
tr:last-child td { border-bottom: 0; }
.score-highlight,
.overall-comment {
  margin: 8px 0 14px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-muted);
}
.trend-list {
  display: grid;
  gap: 8px;
  margin: 0 0 18px;
  padding: 0;
  list-style: none;
}
.trend-list li {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 9px 11px;
  border: 1px solid var(--border);
  border-radius: 8px;
}
.trend-list span { color: var(--text-secondary); }
.footer {
  margin-top: 24px;
  color: var(--text-muted);
  text-align: center;
  font-size: 12px;
}
@media (max-width: 720px) {
  body { font-size: 15px; }
  .page { padding: 18px 12px 34px; }
  .hero,
  .transcript-section,
  .score-section { padding: 18px; border-radius: 10px; }
  .meta-grid { grid-template-columns: 1fr; }
  .toolbar {
    align-items: stretch;
    flex-wrap: wrap;
  }
  .toolbar button { flex: 1 1 120px; }
  .turn-nav {
    flex-basis: 100%;
    margin-left: 0;
  }
  summary { padding: 11px 12px; }
  .message-body { padding: 0 14px 14px; }
}
@media print {
  body { background: #fff; }
  .page { width: 100%; padding: 0; }
  .toolbar { display: none; }
  .hero,
  .transcript-section,
  .score-section,
  .message-card { box-shadow: none; break-inside: avoid; }
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
    transcript_html, turns = _render_transcript_sections(sections)
    participants = session_data.get("participants", [])
    roles = _collect_roles(sections, participants if isinstance(participants, list) else [])
    topic = _plain(session_data.get("topic"), "未命名辩题")
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
      <p class="eyebrow">Elenchus 辩论记录</p>
      <h1>{_html(topic)}</h1>
      <div class="meta-grid">
        {_render_meta_grid(session_data)}
      </div>
    </header>

    <section class="toolbar" aria-label="阅读工具">
      <button type="button" data-action="expand-all">全部展开</button>
      <button type="button" data-action="collapse-all">全部收起</button>
      {_render_turn_nav(turns)}
    </section>

    {_render_legend(roles)}

    {transcript_html or empty_state}

    {_render_scores(session_data)}

    <footer class="footer">由 Elenchus 导出</footer>
  </main>
  <script>{_script()}</script>
</body>
</html>
"""
