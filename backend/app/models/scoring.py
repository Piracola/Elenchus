"""
Pydantic schemas for the scoring system.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


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
    rebuttal_strength: DimensionScore = Field(..., description="反驳力度")
    consistency: DimensionScore = Field(..., description="前后自洽")
    persuasiveness: DimensionScore = Field(..., description="说服力")
    overall_comment: str = Field(
        ..., description="裁判对该辩手本轮表现的整体评语"
    )

    @property
    def average_score(self) -> float:
        dims = [
            self.logical_rigor.score,
            self.evidence_quality.score,
            self.rebuttal_strength.score,
            self.consistency.score,
            self.persuasiveness.score,
        ]
        return sum(dims) / len(dims)

    def to_radar_dict(self) -> dict[str, int]:
        """Return a dict suitable for radar chart rendering."""
        return {
            "logical_rigor": self.logical_rigor.score,
            "evidence_quality": self.evidence_quality.score,
            "rebuttal_strength": self.rebuttal_strength.score,
            "consistency": self.consistency.score,
            "persuasiveness": self.persuasiveness.score,
        }
