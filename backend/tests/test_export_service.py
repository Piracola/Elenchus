"""
Tests for session export formatting.
"""

from __future__ import annotations

import json

import pytest

from app.api import sessions as sessions_api
from app.models.schemas import ExportFormat
from app.services import export


def build_markdown_session_payload() -> dict:
    return {
        "topic": "人工智能是否会改变教育",
        "status": "completed",
        "current_turn": 2,
        "max_turns": 2,
        "participants": ["proposer", "opposer"],
        "created_at": "2026-03-18T10:00:00Z",
        "dialogue_history": [
            {
                "role": "proposer",
                "agent_name": "正方",
                "content": "AI 可以显著提升个性化教学效果。",
                "citations": ["https://example.com/study"],
                "timestamp": "2026-03-18T10:01:00Z",
                "turn": 0,
            },
            {
                "role": "judge",
                "target_role": "proposer",
                "agent_name": "裁判",
                "content": "论证结构完整，举例清晰。",
                "citations": [],
                "timestamp": "2026-03-18T10:02:00Z",
                "turn": 0,
            },
            {
                "role": "group_discussion",
                "agent_name": "组内讨论",
                "content": "赛前简报：先厘清教育公平的边界。",
                "citations": [],
                "timestamp": "2026-03-18T10:03:00Z",
                "turn": 1,
                "discussion_kind": "group_discussion",
            },
            {
                "role": "consensus_summary",
                "agent_name": "共识协调员",
                "content": "双方都承认 AI 会重塑教学流程，但分歧在风险治理。",
                "citations": [],
                "timestamp": "2026-03-18T10:04:00Z",
                "turn": 1,
            },
        ],
        "current_scores": {
            "proposer": {
                "logical_rigor": {"score": 8, "rationale": "论证清楚"},
                "evidence_quality": {"score": 7, "rationale": "证据尚可"},
                "topic_focus": {"score": 8, "rationale": "始终切题"},
                "rebuttal_strength": {"score": 6, "rationale": "反驳较弱"},
                "consistency": {"score": 8, "rationale": "立场稳定"},
                "persuasiveness": {"score": 8, "rationale": "表达有感染力"},
                "overall_comment": "整体表现稳健。",
            }
        },
        "cumulative_scores": {
            "proposer": {
                "logical_rigor": [8, 9],
                "evidence_quality": [7, 8],
                "topic_focus": [8, 8],
                "rebuttal_strength": [6, 7],
                "consistency": [8, 8],
                "persuasiveness": [8, 9],
            }
        },
    }


def test_export_markdown_uses_readable_chinese_labels():
    markdown = export.export_markdown(build_markdown_session_payload())

    assert "# 辩论记录：" in markdown
    assert "## 基本信息" in markdown
    assert "## 辩论全文" in markdown
    assert "### [裁判 -> 正方 (Proposer)] 第 1 轮" in markdown
    assert "正方证据更完整。" not in markdown
    assert "**引用来源：**" in markdown
    assert "## 当前评分" in markdown
    assert "**综合评分：** 7.5/10" in markdown
    assert "| 基础建设 | 30% | 7.5/10 |" in markdown
    assert "| 对抗推演 | 40% | 7/10 |" in markdown
    assert "切题度与定义稳定" in markdown
    assert "逻辑严密度" in markdown
    assert "## 累计得分趋势" in markdown
    assert "8 -> 9" in markdown


def test_export_markdown_supports_category_filtered_sections():
    markdown = export.export_markdown(
        build_markdown_session_payload(),
        ["consensus_summary", "judge_messages", "consensus_summary", "invalid"],
    )

    assert "## 裁判消息" in markdown
    assert "## 共识收敛消息" in markdown
    assert "## 辩手发言" not in markdown
    assert "论证结构完整，举例清晰。" in markdown
    assert "双方都承认 AI 会重塑教学流程" in markdown


def test_export_markdown_can_select_group_discussion_separately():
    debater_only = export.export_markdown(build_markdown_session_payload(), ["debater_speeches"])
    with_group_discussion = export.export_markdown(
        build_markdown_session_payload(),
        ["debater_speeches", "group_discussion"],
    )

    assert "赛前简报：先厘清教育公平的边界。" not in debater_only
    assert "## 组内讨论" in with_group_discussion
    assert "### [组内讨论] 第 2 轮" in with_group_discussion
    assert "赛前简报：先厘清教育公平的边界。" in with_group_discussion


def test_normalize_markdown_export_categories_preserves_stable_order_and_fallback():
    assert export.normalize_markdown_export_categories(None) is None
    assert export.normalize_markdown_export_categories(["consensus_summary", "judge_messages", "consensus_summary"]) == [
        "consensus_summary",
        "judge_messages",
    ]
    assert export.normalize_markdown_export_categories(["thinking_content", "judge_messages"]) == [
        "thinking_content",
        "judge_messages",
    ]
    assert export.normalize_markdown_export_categories(["group_discussion", "judge_messages"]) == [
        "group_discussion",
        "judge_messages",
    ]
    assert export.normalize_markdown_export_categories(["invalid"]) == ["debater_speeches"]


def test_export_markdown_falls_back_to_debater_speeches_when_categories_invalid():
    markdown = export.export_markdown(
        build_markdown_session_payload(),
        ["invalid", "unknown"],
    )

    assert "## 辩手发言" in markdown
    assert "AI 可以显著提升个性化教学效果。" in markdown
    assert "## 裁判消息" not in markdown


def test_export_markdown_can_include_or_hide_leading_thinking_content():
    payload = build_markdown_session_payload()
    payload["dialogue_history"][0]["content"] = (
        "<think>**内部推理**\n\n- 检查定义</think>\n\n正式发言。"
    )

    hidden = export.export_markdown(payload, ["debater_speeches"])
    visible = export.export_markdown(payload, ["debater_speeches", "thinking_content"])

    assert "正式发言。" in hidden
    assert "内部推理" not in hidden
    assert "<think>" not in hidden
    assert "<summary>思维链</summary>" in visible
    assert "**内部推理**" in visible
    assert "- 检查定义" in visible
    assert "正式发言。" in visible


def test_export_json_preserves_unicode_content():
    payload = export.export_json({"topic": "测试导出", "value": "中文内容"})

    assert '"topic": "测试导出"' in payload
    assert '"value": "中文内容"' in payload


def test_export_json_compacts_session_payload_for_user_export():
    payload = build_markdown_session_payload()
    payload["run_id"] = "run123"
    payload["run_events"] = [{"type": "status", "payload": {"content": "working"}}]
    payload["projection"] = {"dialogue_history": payload["dialogue_history"]}
    payload["shared_knowledge"] = [{"type": "memo", "content": "internal"}]
    payload["agent_configs"] = {"judge": {"model": "secret"}}
    payload["reasoning_config"] = {"consensus_enabled": True}
    payload["speech_config"] = {"proposer_max_chars": 0}

    exported = json.loads(export.export_json(payload))

    assert exported["topic"] == "人工智能是否会改变教育"
    assert exported["dialogue_history"] == payload["dialogue_history"]
    assert "run_events" not in exported
    assert "projection" not in exported
    assert "shared_knowledge" not in exported
    assert "agent_configs" not in exported
    assert "reasoning_config" not in exported
    assert "speech_config" not in exported


def test_export_html_renders_static_reading_page_with_controls():
    html = export.export_html(build_markdown_session_payload())

    assert "<!doctype html>" in html
    assert "Elenchus 辩论记录" in html
    assert "人工智能是否会改变教育" in html
    assert "全部展开" in html
    assert "全部收起" in html
    assert "阅读地图" in html
    assert 'class="reading-map-card" href="#full_transcript"' in html
    assert 'href="#scores"' in html
    assert 'href="#turn-1"' in html
    assert "AI 可以显著提升个性化教学效果。" in html
    assert "论证结构完整，举例清晰。" in html
    assert "正方证据更完整。" not in html
    assert "当前评分" not in html
    assert "逐轮综合分走势" in html
    assert 'id="scores"' in html
    assert "第 1 轮" in html
    assert "第 2 轮" in html
    assert "由 Elenchus 导出" in html


def test_export_html_uses_compact_header_and_speech_stats_without_thinking():
    payload = build_markdown_session_payload()
    payload["dialogue_history"][0]["content"] = "<think>内部推理很长很长</think>\n\n正式发言。"
    payload["dialogue_history"].append(
        {
            "role": "opposer",
            "agent_name": "反方",
            "content": "反方回应。",
            "citations": [],
            "timestamp": "2026-03-18T10:03:00Z",
            "turn": 0,
        }
    )

    html = export.export_html(payload, ["debater_speeches", "thinking_content"])

    assert "发言文本量" in html
    assert "不含思维链" in html
    assert '<span>创建</span><strong>2026-03-18 10:00</strong>' in html
    assert "2026-03-18T10:00:00Z" not in html
    assert ">状态<" not in html
    assert ">参与者<" not in html
    assert 'data-role="proposer"><span>正方</span><strong>5</strong><small>字符</small>' in html
    assert 'data-role="opposer"><span>反方</span><strong>5</strong><small>字符</small>' in html
    assert 'data-role="total"><span>合计</span><strong>10</strong><small>字符</small>' in html


def test_export_html_renders_markdown_content_and_uses_restrained_message_style():
    payload = build_markdown_session_payload()
    payload["dialogue_history"][0]["content"] = "\n".join(
        [
            "## 核心观点",
            "",
            "- **个性化** 学习",
            "- 支持代码 `score`",
            "",
            "| 维度 | 结论 |",
            "| --- | --- |",
            "| 效率 | 提升 |",
            "",
            "> 需要配套治理。",
            "",
            "```python",
            "print('safe')",
            "```",
            "",
            "https://example.com/report",
        ]
    )

    html = export.export_html(payload)

    assert '<div class="message-body markdown-body">' in html
    assert "<h2>核心观点</h2>" in html
    assert "<strong>个性化</strong>" in html
    assert "<code>score</code>" in html
    assert "<table>" in html
    assert "<blockquote>" in html
    assert 'class="language-python"' in html
    assert '<a href="https://example.com/report" target="_blank" rel="noopener noreferrer">' in html
    assert ".message-card[open] {\n  background: linear-gradient" not in html
    assert ".message-card::before" in html
    assert "width: 3px;" in html


def test_export_html_can_include_or_hide_leading_thinking_content():
    payload = build_markdown_session_payload()
    payload["dialogue_history"][0]["content"] = (
        "<think>**内部推理**\n\n- 检查定义</think>\n\n正式发言。"
    )

    hidden = export.export_html(payload, ["debater_speeches"])
    visible = export.export_html(payload, ["debater_speeches", "thinking_content"])

    assert "正式发言。" in hidden
    assert "内部推理" not in hidden
    assert "&lt;think&gt;" not in hidden
    assert '<details class="thinking-panel">' in visible
    assert "<span>思维链</span>" in visible
    assert "<strong>内部推理</strong>" in visible
    assert "<li>检查定义</li>" in visible
    assert "正式发言。" in visible
    assert "&lt;think&gt;" not in visible


def test_export_html_supports_category_filtered_sections():
    html = export.export_html(
        build_markdown_session_payload(),
        ["consensus_summary", "judge_messages"],
    )

    assert "裁判消息" in html
    assert "共识收敛消息" in html
    assert "双方都承认 AI 会重塑教学流程" in html
    assert "AI 可以显著提升个性化教学效果。" not in html


def test_export_html_can_select_group_discussion_separately():
    debater_only = export.export_html(build_markdown_session_payload(), ["debater_speeches"])
    with_group_discussion = export.export_html(
        build_markdown_session_payload(),
        ["debater_speeches", "group_discussion"],
    )

    assert "赛前简报：先厘清教育公平的边界。" not in debater_only
    assert "组内讨论" in with_group_discussion
    assert 'href="#group_discussion"' in with_group_discussion
    assert "赛前简报：先厘清教育公平的边界。" in with_group_discussion


def test_export_html_escapes_agent_content():
    payload = build_markdown_session_payload()
    payload["topic"] = "<script>alert('topic')</script>"
    payload["dialogue_history"][0]["content"] = "<script>alert('xss')</script>\nhttps://example.com/path"

    html = export.export_html(payload)

    assert "<script>alert('topic')</script>" not in html
    assert "<script>alert('xss')</script>" not in html
    assert "&lt;script&gt;alert(&#x27;topic&#x27;)&lt;/script&gt;" in html
    assert "&lt;script&gt;alert(&#x27;xss&#x27;)&lt;/script&gt;" in html
    assert '<a href="https://example.com/path"' in html


@pytest.mark.asyncio
async def test_export_session_route_returns_html_response(monkeypatch):
    async def _export_payload(session_id: str, *, run_id: str | None = None):
        assert session_id == "abc123def456"
        assert run_id is None
        return build_markdown_session_payload()

    monkeypatch.setattr(sessions_api, "export_run_payload", _export_payload)

    response = await sessions_api.export_session(
        "abc123def456",
        format=ExportFormat.HTML,
        categories=["debater_speeches"],
        run_id=None,
    )

    assert response.media_type == "text/html; charset=utf-8"
    assert response.headers["content-disposition"].endswith(".html")
    assert b"<!doctype html>" in response.body
