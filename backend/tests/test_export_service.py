"""
Tests for session export formatting.
"""

from __future__ import annotations

import json

from app.services import export_service


def test_export_markdown_uses_readable_chinese_labels():
    markdown = export_service.export_markdown(
        {
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
            "current_scores": {
                "proposer": {
                    "logical_rigor": {"score": 8, "rationale": "论证清楚"},
                    "evidence_quality": {"score": 7, "rationale": "证据尚可"},
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
                    "rebuttal_strength": [6, 7],
                    "consistency": [8, 8],
                    "persuasiveness": [8, 9],
                }
            },
        }
    )

    assert "# 辩论记录：" in markdown
    assert "## 基本信息" in markdown
    assert "## 辩论全文" in markdown
    assert "### [裁判 -> 正方 (Proposer)] 第 1 轮" in markdown
    assert "**引用来源：**" in markdown
    assert "## 当前评分" in markdown
    assert "逻辑严密度" in markdown
    assert "## 累计得分趋势" in markdown
    assert "8 -> 9" in markdown


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
