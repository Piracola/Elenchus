from __future__ import annotations

import re

from app.search.base import SearchResult

from .search_query_planner import extract_subject, prepare_search_text

NEGATIVE_RESULT_MARKERS = (
    "thesis",
    "proposal",
    "essay",
    "outline",
    "presentation",
    "writing seminar",
    "author instructions",
    "how to write",
    "studocu",
)
GENERIC_KEYWORDS = {
    "debate",
    "topic",
    "opening",
    "statement",
    "progress",
    "turn",
    "search",
    "result",
    "evidence",
    "fact",
    "query",
    "合理",
    "是否",
    "应该",
    "不应该",
    "利大于弊",
    "弊大于利",
    "必要",
}


def extract_keywords(*texts: str) -> list[str]:
    keywords: list[str] = []
    for text in texts:
        prepared = prepare_search_text(text).lower()
        for piece in re.findall(r"[a-z0-9][a-z0-9\-]{1,}|[\u4e00-\u9fff]{2,}", prepared):
            piece = piece.strip()
            if piece and piece not in GENERIC_KEYWORDS:
                keywords.append(piece)

    keywords = sorted(set(keywords), key=len, reverse=True)
    return keywords


def query_intent_keywords(query: str) -> list[str]:
    intent_keywords: list[str] = []
    if any(marker in query for marker in ("法律", "法规", "政策", "依据")):
        intent_keywords.extend(["法律", "法规", "政策", "依据", "治理", "监管", "安全法"])
    if any(marker in query for marker in ("作用", "影响", "数据", "研究")):
        intent_keywords.extend(["作用", "影响", "数据", "研究", "统计", "安全", "流动"])
    if any(marker in query for marker in ("争议", "风险", "案例")):
        intent_keywords.extend(["争议", "风险", "案例", "批评", "质疑", "封锁", "审查"])

    return sorted(set(intent_keywords), key=len, reverse=True)


def score_result(
    result: SearchResult,
    *,
    required_keywords: list[str],
    query_keywords: list[str],
    intent_keywords: list[str],
) -> int:
    haystack = " ".join([result.title, result.snippet, result.url]).lower()
    score = 0
    required_hits = 0
    intent_hits = 0

    for keyword in required_keywords:
        if keyword in haystack:
            required_hits += 1
            score += 4

    for keyword in query_keywords:
        if keyword in haystack:
            score += 1

    for keyword in intent_keywords:
        if keyword in haystack:
            intent_hits += 1
            score += 2

    for marker in NEGATIVE_RESULT_MARKERS:
        if marker in haystack:
            score -= 6

    if required_hits == 0 and intent_hits < 2:
        score -= 3

    return score


def dedupe_results(results: list[SearchResult]) -> list[SearchResult]:
    deduped: list[SearchResult] = []
    seen: set[str] = set()

    for result in results:
        key = result.url.strip().lower()
        if not key:
            key = f"{result.title.strip().lower()}::{result.snippet[:120].strip().lower()}"
        if key in seen:
            continue
        seen.add(key)
        deduped.append(result)

    return deduped


def filter_results(topic: str, query: str, results: list[SearchResult]) -> list[SearchResult]:
    required_keywords = extract_keywords(extract_subject(topic), topic)
    query_keywords = extract_keywords(query)
    intent_keywords = query_intent_keywords(query)

    scored = [
        (
            score_result(
                result,
                required_keywords=required_keywords,
                query_keywords=query_keywords,
                intent_keywords=intent_keywords,
            ),
            result,
        )
        for result in dedupe_results(results)
    ]
    scored.sort(key=lambda item: item[0], reverse=True)
    return [result for score, result in scored if score > 0]
