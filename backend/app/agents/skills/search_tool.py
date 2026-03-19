"""
Unified web search tool for agents.

The tool accepts either a concise fact query or a full debate topic. For
debate topics it automatically plans several targeted searches, filters
obviously irrelevant results, and returns a compact evidence brief that the
model can synthesize into an argument.
"""

from __future__ import annotations

import asyncio
import logging
import re
from typing import Any

from langchain_core.tools import tool
from pydantic import BaseModel, Field

from app.config import get_settings
from app.agents.skills.metadata import mark_tool_shared_knowledge
from app.dependencies import get_search_factory
from app.search.base import SearchResult

logger = logging.getLogger(__name__)

_MAX_QUERY_CHARS = 120
_MAX_PLANNED_QUERIES = 3
_MAX_RESULTS_PER_QUERY = 3
_MAX_EVIDENCE_ITEMS = 6
_MAX_SNIPPET_CHARS = 240
_PROMPT_MARKERS = (
    "you are ",
    "opening statement",
    "counter-thesis",
    "this is turn",
    "turn 1 of",
    "turn 2 of",
    "debate topic",
    "## debate topic",
    "## progress",
)
_FACT_HINTS = (
    "数据",
    "统计",
    "研究",
    "论文",
    "法律",
    "法规",
    "政策",
    "案例",
    "历史",
    "背景",
    "study",
    "studies",
    "statistics",
    "data",
    "law",
    "policy",
    "case",
    "report",
)
_STANCE_MARKERS = (
    "利大于弊",
    "弊大于利",
    "合理",
    "不合理",
    "必要",
    "是否",
    "应该",
    "不应该",
    "应不应该",
    "该不该",
    "支持",
    "反对",
    "可行",
    "正当",
)
_NEGATIVE_RESULT_MARKERS = (
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
_GENERIC_KEYWORDS = {
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
_SUBJECT_TRAILING_MARKERS = (
    "是合理且",
    "是合理的",
    "是合理",
    "合理且",
    "合理的",
    "合理",
    "有必要",
    "必要",
)


class SearchInput(BaseModel):
    """Input schema for web search tool."""

    query: str = Field(
        description=(
            "A concise factual web search query or a debate topic. For debate "
            "topics, the tool will plan a few focused sub-queries for laws, data, "
            "impacts, or case studies. Never paste the full role prompt or text "
            "like 'You are ...'."
        )
    )


def _extract_topic_from_prompt_text(query: str) -> str | None:
    """Extract the actual debate topic from a prompt-shaped query."""
    topic_patterns = [
        r'on the topic:\s*"([^"]+)"',
        r'on the topic:\s*\'([^\']+)\'',
        r"##\s*Debate Topic\s*\n+([^\n]+)",
        r"Debate Topic\s*\n+([^\n]+)",
        r"辩题[:：]?\s*([^\n]+)",
    ]

    for pattern in topic_patterns:
        match = re.search(pattern, query, flags=re.IGNORECASE)
        if match:
            topic = match.group(1).strip()
            if topic:
                return topic
    return None


def _sanitize_search_query(query: str) -> str:
    """
    Normalize prompt-like queries into concise factual search terms.

    If the model accidentally passes the whole role prompt, extract only the
    debate topic instead of sending the full instruction to the search engine.
    """
    raw = (query or "").strip()
    if not raw:
        return ""

    compact = raw.replace("\r", "")
    compact_single_line = re.sub(r"\s+", " ", compact).strip()
    lowered = compact_single_line.lower()
    looks_prompt_like = (
        "\n" in compact
        or len(compact_single_line) > _MAX_QUERY_CHARS
        or any(marker in lowered for marker in _PROMPT_MARKERS)
    )

    if looks_prompt_like:
        topic = _extract_topic_from_prompt_text(compact)
        if topic:
            return topic[:_MAX_QUERY_CHARS].strip()

    cleaned = re.sub(r"https?://\S+", "", compact_single_line)
    cleaned = cleaned.strip(' "\'')
    return cleaned[:_MAX_QUERY_CHARS].strip()


def _prepare_search_text(text: str) -> str:
    """Insert helpful spacing around mixed Chinese/Latin terms for search engines."""
    normalized = re.sub(r"([A-Za-z0-9])([\u4e00-\u9fff])", r"\1 \2", text)
    normalized = re.sub(r"([\u4e00-\u9fff])([A-Za-z0-9])", r"\1 \2", normalized)
    return re.sub(r"\s+", " ", normalized).strip()


def _looks_like_fact_query(query: str) -> bool:
    """Heuristically detect when the caller already gave a targeted fact query."""
    lowered = query.lower()
    if any(hint in lowered for hint in _FACT_HINTS):
        return True

    if len(query.split()) >= 4 and not any(marker in query for marker in _STANCE_MARKERS):
        return True

    return False


def _extract_subject(topic: str) -> str:
    """Pull out the likely subject entity from a proposition-style debate topic."""
    stripped = topic.strip().strip("。！？?!.\"' ")
    patterns = [
        r"^(.+?)是合理且利大于弊的.*$",
        r"^(.+?)是合理的.*$",
        r"^(.+?)是否应该.+$",
        r"^(.+?)应不应该.+$",
        r"^(.+?)该不该.+$",
        r"^(.+?)是不是.+$",
        r"^(.+?)是否合理.+$",
        r"^(.+?)利大于弊.*$",
        r"^(.+?)弊大于利.*$",
    ]

    for pattern in patterns:
        match = re.match(pattern, stripped)
        if match:
            subject = match.group(1).strip(" ，,。;；:：")
            for trailing in _SUBJECT_TRAILING_MARKERS:
                if subject.endswith(trailing):
                    subject = subject[: -len(trailing)].rstrip(" ，,。;；:：")
            if len(subject) >= 2:
                return _prepare_search_text(subject)

    if "是" in stripped:
        left, right = stripped.split("是", 1)
        if left and any(marker in right for marker in _STANCE_MARKERS):
            candidate = left.strip(" ，,。;；:：")
            if len(candidate) >= 2:
                return _prepare_search_text(candidate)

    return _prepare_search_text(stripped)


def _build_search_plan(query: str) -> list[str]:
    """
    Build a small search plan.

    If the input is already a focused fact query, keep it as-is. Otherwise,
    treat it as a debate proposition and search for legal basis, impact data,
    and concrete controversies/case studies.
    """
    sanitized = _sanitize_search_query(query)
    if not sanitized:
        return []

    if _looks_like_fact_query(sanitized):
        return [sanitized]

    subject = _extract_subject(sanitized)
    plan = [
        f"{subject} 法律 政策 依据",
        f"{subject} 作用 影响 数据 研究",
        f"{subject} 争议 风险 案例",
    ]

    deduped: list[str] = []
    for item in plan:
        compact = item[:_MAX_QUERY_CHARS].strip()
        if compact and compact not in deduped:
            deduped.append(compact)

    return deduped[:_MAX_PLANNED_QUERIES]


def _extract_keywords(*texts: str) -> list[str]:
    """Extract topic keywords for lightweight relevance filtering."""
    keywords: list[str] = []
    for text in texts:
        prepared = _prepare_search_text(text).lower()
        for piece in re.findall(r"[a-z0-9][a-z0-9\-]{1,}|[\u4e00-\u9fff]{2,}", prepared):
            piece = piece.strip()
            if piece and piece not in _GENERIC_KEYWORDS:
                keywords.append(piece)

    # Preserve order while removing duplicates, favoring longer tokens first.
    keywords = sorted(set(keywords), key=len, reverse=True)
    return keywords


def _query_intent_keywords(query: str) -> list[str]:
    """Infer broad intent markers from the planned sub-query."""
    intent_keywords: list[str] = []
    if any(marker in query for marker in ("法律", "法规", "政策", "依据")):
        intent_keywords.extend(["法律", "法规", "政策", "依据", "治理", "监管", "安全法"])
    if any(marker in query for marker in ("作用", "影响", "数据", "研究")):
        intent_keywords.extend(["作用", "影响", "数据", "研究", "统计", "安全", "流动"])
    if any(marker in query for marker in ("争议", "风险", "案例")):
        intent_keywords.extend(["争议", "风险", "案例", "批评", "质疑", "封锁", "审查"])

    return sorted(set(intent_keywords), key=len, reverse=True)


def _score_result(
    result: SearchResult,
    *,
    required_keywords: list[str],
    query_keywords: list[str],
    intent_keywords: list[str],
) -> int:
    """Assign a simple topical relevance score to a search result."""
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

    for marker in _NEGATIVE_RESULT_MARKERS:
        if marker in haystack:
            score -= 6

    if required_hits == 0 and intent_hits < 2:
        score -= 3

    return score


def _dedupe_results(results: list[SearchResult]) -> list[SearchResult]:
    """Drop duplicate results using URL first, then title/snippet fallback."""
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


def _filter_results(topic: str, query: str, results: list[SearchResult]) -> list[SearchResult]:
    """Keep only search results that look relevant to the debate topic."""
    required_keywords = _extract_keywords(_extract_subject(topic), topic)
    query_keywords = _extract_keywords(query)
    intent_keywords = _query_intent_keywords(query)

    scored = [
        (
            _score_result(
                result,
                required_keywords=required_keywords,
                query_keywords=query_keywords,
                intent_keywords=intent_keywords,
            ),
            result,
        )
        for result in _dedupe_results(results)
    ]
    scored.sort(key=lambda item: item[0], reverse=True)
    return [result for score, result in scored if score > 0]


def _truncate_snippet(snippet: str) -> str:
    text = re.sub(r"\s+", " ", snippet).strip()
    if len(text) <= _MAX_SNIPPET_CHARS:
        return text
    return f"{text[:_MAX_SNIPPET_CHARS].rstrip()}..."


def _format_evidence_brief(
    topic: str,
    search_plan: list[str],
    grouped_results: list[tuple[str, list[SearchResult]]],
) -> str:
    """Format a compact evidence digest for the model."""
    lines = [
        "Debate Evidence Brief",
        f"Topic: {topic}",
        "",
        "Search Plan:",
    ]
    lines.extend(f"{index}. {planned_query}" for index, planned_query in enumerate(search_plan, start=1))
    lines.extend(
        [
            "",
            "Evidence:",
        ]
    )

    evidence_count = 0
    for planned_query, results in grouped_results:
        if not results:
            continue
        lines.append(f"[Query] {planned_query}")
        for result in results[:2]:
            summary = _truncate_snippet(result.snippet) or "No summary provided."
            lines.append(f"- [{result.source_engine}] {result.title.strip()}: {summary}")
            evidence_count += 1
            if evidence_count >= _MAX_EVIDENCE_ITEMS:
                break
        if evidence_count >= _MAX_EVIDENCE_ITEMS:
            break

    if evidence_count == 0:
        lines.append("- No high-confidence relevant results were found after relevance filtering.")

    lines.extend(
        [
            "",
            "Notes:",
            "- The tool planned the searches from the debate topic instead of using the raw prompt text.",
            "- Generic writing/tutorial pages were filtered when they did not match the debate subject.",
            "- Use these findings to write the debate speech directly; do not narrate the search process.",
        ]
    )
    return "\n".join(lines)


async def _execute_search_plan(search_plan: list[str]) -> list[tuple[str, list[SearchResult]]]:
    """Run planned sub-queries in parallel and collect the raw results."""
    settings = get_settings()
    search_factory = get_search_factory()
    per_query_results = min(
        max(settings.search.max_results_per_query, 1),
        _MAX_RESULTS_PER_QUERY,
    )

    searches = [
        search_factory.search(planned_query, num_results=per_query_results)
        for planned_query in search_plan
    ]
    resolved = await asyncio.gather(*searches, return_exceptions=True)

    grouped_results: list[tuple[str, list[SearchResult]]] = []
    for planned_query, result in zip(search_plan, resolved, strict=False):
        if isinstance(result, Exception):
            logger.warning("Search sub-query failed for '%s': %s", planned_query, result)
            grouped_results.append((planned_query, []))
            continue
        grouped_results.append((planned_query, result))

    return grouped_results


@tool("web_search", args_schema=SearchInput)
async def web_search(query: str, **kwargs: Any) -> str:
    """
    Search the web for information using the configured search engine.

    Use this tool for targeted fact checking or for automatic evidence gathering
    from a debate topic.
    """
    sanitized_query = _sanitize_search_query(query)
    if not sanitized_query:
        return (
            "Invalid search query. Search only for concise factual keywords "
            "related to the debate topic, not the full prompt."
        )

    if sanitized_query != query.strip():
        logger.warning(
            "Sanitized malformed search query from '%s' to '%s'",
            query[:200],
            sanitized_query,
        )

    search_plan = _build_search_plan(sanitized_query)
    if not search_plan:
        return (
            "Invalid search query. Please provide a concise fact query or a debate topic "
            "that can be decomposed into factual sub-queries."
        )

    logger.info("Agent requested web search for: '%s' (plan: %s)", sanitized_query, search_plan)
    try:
        raw_grouped_results = await _execute_search_plan(search_plan)
        filtered_grouped_results = [
            (planned_query, _filter_results(sanitized_query, planned_query, results))
            for planned_query, results in raw_grouped_results
        ]

        if not any(results for _, results in filtered_grouped_results):
            return (
                f"Debate Evidence Brief\nTopic: {sanitized_query}\n\n"
                "Evidence:\n"
                "- No high-confidence relevant results were found after planning and filtering.\n\n"
                "Notes:\n"
                "- The query was treated as a debate topic and decomposed into factual sub-queries.\n"
                "- Search results were too weak or off-topic to use confidently.\n"
                "- State uncertainty instead of inventing facts."
            )

        return _format_evidence_brief(
            topic=sanitized_query,
            search_plan=search_plan,
            grouped_results=filtered_grouped_results,
        )

    except Exception as exc:
        logger.error("Error during web search tool execution: %s", exc)
        return f"Search failed due to an error: {exc}. Please rely on internal knowledge."


mark_tool_shared_knowledge(web_search, "fact")
