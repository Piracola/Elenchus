"""
Tests for session export formatting.
"""

from __future__ import annotations

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
