from __future__ import annotations

import re

from app.search.base import SearchResult

MAX_EVIDENCE_ITEMS = 6
MAX_SNIPPET_CHARS = 240


def truncate_snippet(snippet: str) -> str:
    text = re.sub(r"\s+", " ", snippet).strip()
    if len(text) <= MAX_SNIPPET_CHARS:
        return text
    return f"{text[:MAX_SNIPPET_CHARS].rstrip()}..."


def format_evidence_brief(
    topic: str,
    search_plan: list[str],
    grouped_results: list[tuple[str, list[SearchResult]]],
) -> str:
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
            summary = truncate_snippet(result.snippet) or "No summary provided."
            lines.append(f"- [{result.source_engine}] {result.title.strip()}: {summary}")
            evidence_count += 1
            if evidence_count >= MAX_EVIDENCE_ITEMS:
                break
        if evidence_count >= MAX_EVIDENCE_ITEMS:
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
