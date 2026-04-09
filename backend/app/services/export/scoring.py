from __future__ import annotations

from typing import Any

DIM_LABELS = {
    "logical_rigor": "逻辑严密度",
    "evidence_quality": "证据质量",
    "topic_focus": "切题度与定义稳定",
    "rebuttal_strength": "反驳力度",
    "consistency": "前后一致性",
    "persuasiveness": "价值立意与说服力",
}

DIM_WEIGHTS = {
    "evidence_quality": 15,
    "topic_focus": 15,
    "logical_rigor": 20,
    "rebuttal_strength": 20,
    "consistency": 15,
    "persuasiveness": 15,
}

MODULE_LABELS = {
    "foundation": "基础建设",
    "confrontation": "对抗推演",
    "stability": "系统稳健",
    "vision": "终极视野",
}

MODULE_WEIGHTS = {
    "foundation": 30,
    "confrontation": 40,
    "stability": 15,
    "vision": 15,
}

MODULE_DIMENSIONS = {
    "foundation": ("evidence_quality", "topic_focus"),
    "confrontation": ("logical_rigor", "rebuttal_strength"),
    "stability": ("consistency",),
    "vision": ("persuasiveness",),
}


def format_score(score_value: Any) -> str:
    if isinstance(score_value, (int, float)):
        rounded = round(float(score_value), 1)
        display = str(int(rounded)) if rounded.is_integer() else f"{rounded:.1f}"
        return f"{display}/10"
    return "-"


def format_cumulative_value(value: Any) -> str:
    if isinstance(value, list):
        compact_values = [str(item) for item in value]
        return " -> ".join(compact_values) if compact_values else "-"
    if value in (None, ""):
        return "-"
    return str(value)


def extract_dimension_score_map(scores: dict[str, Any]) -> dict[str, float]:
    dimension_scores: dict[str, float] = {}
    for dim_key in DIM_LABELS:
        dim_data = scores.get(dim_key, {})
        if not isinstance(dim_data, dict):
            continue
        raw_score = dim_data.get("score")
        if isinstance(raw_score, (int, float)):
            dimension_scores[dim_key] = float(raw_score)
    return dimension_scores


def weighted_average(score_map: dict[str, float], dimensions: tuple[str, ...]) -> float | None:
    available_dimensions = [dim for dim in dimensions if dim in score_map]
    if not available_dimensions:
        return None

    total_weight = sum(DIM_WEIGHTS[dim] for dim in available_dimensions)
    weighted_sum = sum(score_map[dim] * DIM_WEIGHTS[dim] for dim in available_dimensions)
    return round(weighted_sum / total_weight + 1e-9, 1)


def resolve_module_scores(scores: dict[str, Any]) -> dict[str, float]:
    resolved: dict[str, float] = {}
    precomputed = scores.get("module_scores")
    if isinstance(precomputed, dict):
        for module_key in MODULE_LABELS:
            value = precomputed.get(module_key)
            if isinstance(value, (int, float)):
                resolved[module_key] = round(float(value), 1)

    dimension_scores = extract_dimension_score_map(scores)
    for module_key, dimensions in MODULE_DIMENSIONS.items():
        if module_key in resolved:
            continue
        value = weighted_average(dimension_scores, dimensions)
        if value is not None:
            resolved[module_key] = value

    return resolved


def resolve_comprehensive_score(scores: dict[str, Any]) -> float | None:
    precomputed = scores.get("comprehensive_score")
    if isinstance(precomputed, (int, float)):
        return round(float(precomputed), 1)

    scores_map = extract_dimension_score_map(scores)
    return weighted_average(scores_map, tuple(scores_map.keys()))
