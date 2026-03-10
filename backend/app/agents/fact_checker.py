"""
Fact-checker node — extracts claims from debate speech,
searches for evidence, and injects results into context.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

from app.agents.llm import get_fact_checker_llm
from app.agents.prompt_loader import get_fact_checker_prompt
from app.search.factory import SearchProviderFactory

logger = logging.getLogger(__name__)

_CLAIM_EXTRACTION_PROMPT = """Analyse the following debate speech and extract the key FACTUAL CLAIMS that can be verified through web search. Focus on:
- Statistical claims (numbers, percentages, dates)
- References to studies, reports, or organizations
- Assertions about real-world events or trends
- Causal claims that can be checked

Return a JSON array of search queries (strings) that would help verify these claims. Return 1-3 of the most important queries. If there are no verifiable claims, return an empty array [].

SPEECH:
{speech}

OUTPUT (JSON array only, no other text):"""


async def _extract_search_queries(speech: str, override: dict[str, Any] | None = None) -> list[str]:
    """Use LLM to extract searchable queries from a speech."""
    llm = get_fact_checker_llm(streaming=False, override=override)
    prompt = _CLAIM_EXTRACTION_PROMPT.format(speech=speech)

    response = await llm.ainvoke([
        SystemMessage(content="You extract factual claims and generate search queries. Output ONLY valid JSON."),
        HumanMessage(content=prompt),
    ])

    text = response.content.strip()
    # Try to parse JSON array
    try:
        # Handle potential markdown code block wrapping
        if text.startswith("```"):
            text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()
        queries = json.loads(text)
        if isinstance(queries, list):
            return [str(q) for q in queries[:3]]
    except (json.JSONDecodeError, IndexError):
        logger.warning("Failed to parse claim extraction output: %s", text[:200])
    return []


async def fact_check(state: dict[str, Any]) -> dict[str, Any]:
    """
    LangGraph node: Extract claims from the latest speech and search for evidence.

    Reads: dialogue_history
    Writes: search_context (replaces with new results)
    """
    dialogue_history = state.get("dialogue_history", [])

    if not dialogue_history:
        logger.info("Fact-checker: No dialogue to check.")
        return {"search_context": []}

    # Get the latest speech
    latest = dialogue_history[-1]
    speech = latest.get("content", "")
    role = latest.get("role", "unknown")

    logger.info("Fact-checker: Checking claims from [%s] (%d chars)", role, len(speech))

    agent_configs = state.get("agent_configs", {})
    override = agent_configs.get("fact_checker")

    # Extract search queries
    queries = await _extract_search_queries(speech, override=override)

    if not queries:
        logger.info("Fact-checker: No verifiable claims found.")
        return {"search_context": []}

    logger.info("Fact-checker: Searching %d queries: %s", len(queries), queries)

    # Search for each query
    all_results: list[dict[str, Any]] = []
    for query in queries:
        results = await SearchProviderFactory.search(query)
        for r in results:
            all_results.append({
                "title": r.title,
                "url": r.url,
                "snippet": r.snippet,
                "source_engine": r.source_engine,
            })

    # Deduplicate by URL
    seen_urls: set[str] = set()
    unique_results: list[dict[str, Any]] = []
    for result in all_results:
        url = result.get("url", "")
        if url and url not in seen_urls:
            seen_urls.add(url)
            unique_results.append(result)

    logger.info("Fact-checker: Found %d unique results.", len(unique_results))

    return {"search_context": unique_results}
