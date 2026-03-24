"""
Tests for session export formatting.
"""

from __future__ import annotations

import json

from app.services import export_service


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
        ],
        "team_dialogue_history": [
            {
                "role": "team_member",
                "agent_name": "正方一辩",
                "content": "先巩固个性化学习的定义。",
                "citations": [],
                "timestamp": "2026-03-18T10:00:30Z",
                "turn": 0,
            }
        ],
        "jury_dialogue_history": [
            {
                "role": "jury_member",
                "agent_name": "审判员甲",
                "content": "正方证据更完整。",
                "citations": [],
                "timestamp": "2026-03-18T10:03:00Z",
                "turn": 0,
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
    markdown = export_service.export_markdown(build_markdown_session_payload())

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
    markdown = export_service.export_markdown(
        build_markdown_session_payload(),
        ["jury_messages", "group_discussion", "judge_messages", "jury_messages", "invalid"],
    )

    assert "## 组内讨论" in markdown
    assert "## 裁判消息" in markdown
    assert "## 审判团消息" in markdown
    assert "## 辩手发言" not in markdown
    assert "## 共识收敛消息" not in markdown
    assert "先巩固个性化学习的定义。" in markdown
    assert "论证结构完整，举例清晰。" in markdown
    assert "正方证据更完整。" in markdown
    assert "双方都承认 AI 会重塑教学流程" not in markdown


def test_normalize_markdown_export_categories_preserves_stable_order_and_fallback():
    assert export_service.normalize_markdown_export_categories(None) is None
    assert export_service.normalize_markdown_export_categories(["jury_messages", "group_discussion", "jury_messages"]) == [
        "jury_messages",
        "group_discussion",
    ]
    assert export_service.normalize_markdown_export_categories(["invalid"]) == ["debater_speeches"]


def test_export_markdown_falls_back_to_debater_speeches_when_categories_invalid():
    markdown = export_service.export_markdown(
        build_markdown_session_payload(),
        ["invalid", "unknown"],
    )

    assert "## 辩手发言" in markdown
    assert "AI 可以显著提升个性化教学效果。" in markdown
    assert "## 裁判消息" not in markdown


def test_export_json_preserves_unicode_content():
    payload = export_service.export_json({"topic": "测试导出", "value": "中文内容"})

    assert '"topic": "测试导出"' in payload
    assert '"value": "中文内容"' in payload


def test_export_runtime_events_snapshot_contains_checksum_and_full_event_list():
    payload = export_service.export_runtime_events_snapshot(
        [
            {
                "schema_version": "2026-03-17",
                "event_id": "evt_1",
                "session_id": "abc123def456",
                "seq": 1,
                "timestamp": "2026-03-18T10:00:00Z",
                "source": "runtime.orchestrator",
                "type": "status",
                "phase": "context",
                "payload": {"content": "准备中"},
            },
            {
                "schema_version": "2026-03-17",
                "event_id": "evt_2",
                "session_id": "abc123def456",
                "seq": 2,
                "timestamp": "2026-03-18T10:00:01Z",
                "source": "runtime.node.speaker",
                "type": "speech_end",
                "phase": "speaking",
                "payload": {"role": "proposer", "content": "发言内容"},
            },
        ]
    )

    parsed = json.loads(payload)
    assert parsed["version"] == "runtime-events.v1"
    assert parsed["event_count"] == 2
    assert parsed["trajectory_checksum"].startswith("fnv1a32-")
    assert parsed["events"][1]["type"] == "speech_end"
    assert parsed["events"][1]["payload"]["content"] == "发言内容"
