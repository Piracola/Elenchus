"""
Pydantic schemas for the scoring system.
"""

from __future__ import annotations

from pydantic import BaseModel, Field, computed_field

SCORE_DIMENSION_WEIGHTS: dict[str, int] = {
    "evidence_quality": 15,
    "topic_focus": 15,
    "logical_rigor": 20,
    "rebuttal_strength": 20,
    "consistency": 15,
    "persuasiveness": 15,
}

SCORE_MODULE_DIMENSIONS: dict[str, tuple[str, ...]] = {
    "foundation": ("evidence_quality", "topic_focus"),
    "confrontation": ("logical_rigor", "rebuttal_strength"),
    "stability": ("consistency",),
    "vision": ("persuasiveness",),
}


def _round_score(value: float) -> float:
    return round(value + 1e-9, 1)


class DimensionScore(BaseModel):
    """A single scoring dimension with rationale."""

    score: int = Field(..., ge=1, le=10, description="Score from 1 to 10")
    rationale: str = Field(..., description="Justification for the score")


class TurnScore(BaseModel):
    """
    Complete judge output for one debater in one turn.
    Enforced via Structured Outputs.
    """

    logical_rigor: DimensionScore = Field(..., description="逻辑严密度")
    evidence_quality: DimensionScore = Field(..., description="证据质量")
    topic_focus: DimensionScore = Field(..., description="切题度与定义稳定")
    rebuttal_strength: DimensionScore = Field(..., description="反驳力度")
    consistency: DimensionScore = Field(..., description="前后自洽")
    persuasiveness: DimensionScore = Field(..., description="价值立意与说服力")
    overall_comment: str = Field(
        ..., description="裁判对该辩手本轮表现的整体评语"
    )

    def _dimension_score_map(self) -> dict[str, int]:
        return {
            "logical_rigor": self.logical_rigor.score,
            "evidence_quality": self.evidence_quality.score,
            "topic_focus": self.topic_focus.score,
            "rebuttal_strength": self.rebuttal_strength.score,
            "consistency": self.consistency.score,
            "persuasiveness": self.persuasiveness.score,
        }

    def _weighted_average(self, dimensions: tuple[str, ...]) -> float:
        score_map = self._dimension_score_map()
        total_weight = sum(SCORE_DIMENSION_WEIGHTS[dim] for dim in dimensions)
        weighted_sum = sum(score_map[dim] * SCORE_DIMENSION_WEIGHTS[dim] for dim in dimensions)
        return _round_score(weighted_sum / total_weight)

    @computed_field(return_type=dict[str, float])
    @property
    def module_scores(self) -> dict[str, float]:
        return {
            module: self._weighted_average(dimensions)
            for module, dimensions in SCORE_MODULE_DIMENSIONS.items()
        }

    @computed_field(return_type=float)
    @property
    def comprehensive_score(self) -> float:
        return self._weighted_average(tuple(SCORE_DIMENSION_WEIGHTS.keys()))

    @property
    def average_score(self) -> float:
        return self.comprehensive_score

    def to_radar_dict(self) -> dict[str, int]:
        """Legacy helper for score visualizations keyed by atomic dimensions."""
        return self._dimension_score_map()
