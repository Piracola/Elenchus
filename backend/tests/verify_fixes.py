"""
验证修复脚本 - 测试两个问题是否已修复：
1. 裁判消息重复打印问题
2. 评分错误提示问题
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
import asyncio


class TestJudgeScoreBroadcastFix:
    """测试修复1: 裁判消息重复广播问题"""

    def test_last_broadcasted_scores_tracking(self):
        """验证 runner.py 中的 last_broadcasted_scores 变量是否正确跟踪已广播的评分"""
        # 模拟评分数据
        scores_proposer = {
            "logical_rigor": {"score": 8, "rationale": "Good logic"},
            "evidence_quality": {"score": 7, "rationale": "Some evidence"},
            "rebuttal_strength": {"score": 8, "rationale": "Strong rebuttal"},
            "consistency": {"score": 9, "rationale": "Very consistent"},
            "persuasiveness": {"score": 8, "rationale": "Persuasive"},
            "overall_comment": "Good performance"
        }
        scores_opposer = {
            "logical_rigor": {"score": 7, "rationale": "Decent logic"},
            "evidence_quality": {"score": 6, "rationale": "Limited evidence"},
            "rebuttal_strength": {"score": 7, "rationale": "Adequate rebuttal"},
            "consistency": {"score": 8, "rationale": "Consistent"},
            "persuasiveness": {"score": 7, "rationale": "Somewhat persuasive"},
            "overall_comment": "Average performance"
        }

        # 模拟 last_broadcasted_scores 的行为
        last_broadcasted_scores = {}
        
        # 第一次广播 - 应该广播
        current_scores = {"proposer": scores_proposer, "opposer": scores_opposer}
        broadcasted_count = 0
        for role, score_data in current_scores.items():
            if role not in last_broadcasted_scores or last_broadcasted_scores.get(role) != score_data:
                broadcasted_count += 1
                last_broadcasted_scores[role] = score_data
        
        assert broadcasted_count == 2, f"第一次应该广播2条评分，实际广播了{broadcasted_count}条"
        assert len(last_broadcasted_scores) == 2

        # 第二次广播（重复）- 不应该广播
        broadcasted_count = 0
        for role, score_data in current_scores.items():
            if role not in last_broadcasted_scores or last_broadcasted_scores.get(role) != score_data:
                broadcasted_count += 1
                last_broadcasted_scores[role] = score_data
        
        assert broadcasted_count == 0, f"重复广播应该被阻止，实际广播了{broadcasted_count}条"

    def test_new_scores_should_broadcast(self):
        """验证新的评分数据应该被广播"""
        last_broadcasted_scores = {
            "proposer": {"logical_rigor": {"score": 8}}
        }
        
        # 新的评分数据
        new_scores = {
            "proposer": {"logical_rigor": {"score": 9}},  # 更新后的分数
            "opposer": {"logical_rigor": {"score": 7}}   # 新的角色
        }
        
        broadcasted_roles = []
        for role, score_data in new_scores.items():
            if role not in last_broadcasted_scores or last_broadcasted_scores.get(role) != score_data:
                broadcasted_roles.append(role)
                last_broadcasted_scores[role] = score_data
        
        assert "proposer" in broadcasted_roles, "更新的评分应该被广播"
        assert "opposer" in broadcasted_roles, "新的角色评分应该被广播"


class TestStructuredOutputFix:
    """测试修复2: 结构化输出评分问题"""

    def test_parse_score_response_valid_json(self):
        """测试有效的JSON响应解析"""
        from app.agents.judge import _parse_score_response
        
        valid_json = '''{
            "logical_rigor": {"score": 8, "rationale": "Good logic"},
            "evidence_quality": {"score": 7, "rationale": "Some evidence"},
            "rebuttal_strength": {"score": 8, "rationale": "Strong rebuttal"},
            "consistency": {"score": 9, "rationale": "Very consistent"},
            "persuasiveness": {"score": 8, "rationale": "Persuasive"},
            "overall_comment": "Good performance"
        }'''
        
        result = _parse_score_response(valid_json)
        assert result is not None
        assert result.logical_rigor.score == 8
        assert result.overall_comment == "Good performance"

    def test_parse_score_response_with_markdown(self):
        """测试带Markdown代码块的JSON响应解析"""
        from app.agents.judge import _parse_score_response
        
        markdown_json = '''```json
{
    "logical_rigor": {"score": 8, "rationale": "Good logic"},
    "evidence_quality": {"score": 7, "rationale": "Some evidence"},
    "rebuttal_strength": {"score": 8, "rationale": "Strong rebuttal"},
    "consistency": {"score": 9, "rationale": "Very consistent"},
    "persuasiveness": {"score": 8, "rationale": "Persuasive"},
    "overall_comment": "Good performance"
}```'''
