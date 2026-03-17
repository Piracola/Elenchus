"""
Tests for search-tool guardrails.
"""

import pytest

from app.agents.skills import search_tool
from app.search.base import SearchResult


def test_sanitize_search_query_extracts_topic_from_prompt_text():
    raw_query = """You are 正方 (Proposer).
This is your OPENING STATEMENT. Present your thesis and opening arguments on the topic: "GFW防火墙是合理且利大于弊的"

## Debate Topic
GFW防火墙是合理且利大于弊的

## Progress
Turn 1 of 5
"""

    sanitized = search_tool._sanitize_search_query(raw_query)

    assert sanitized == "GFW防火墙是合理且利大于弊的"


def test_sanitize_search_query_keeps_normal_fact_query():
    raw_query = "GFW 防火墙 合理性 数据 研究"

    sanitized = search_tool._sanitize_search_query(raw_query)

    assert sanitized == raw_query


def test_build_search_plan_for_debate_topic_creates_balanced_queries():
    plan = search_tool._build_search_plan("GFW防火墙是合理且利大于弊的")

    assert plan == [
        "GFW 防火墙 法律 政策 依据",
        "GFW 防火墙 作用 影响 数据 研究",
        "GFW 防火墙 争议 风险 案例",
    ]


def test_filter_results_discards_irrelevant_writing_pages():
    results = [
        SearchResult(
            title="Preparing Your Thesis Proposal Presentation",
            url="https://example.com/thesis",
            snippet="Open with a thesis, overview, and presentation roadmap.",
            source_engine="duckduckgo",
        ),
        SearchResult(
            title="GFW 对网络内容治理的影响研究",
            url="https://example.com/gfw-study",
            snippet="文章讨论了 GFW 在网络安全、信息流动与治理中的影响。",
            source_engine="duckduckgo",
        ),
    ]

    filtered = search_tool._filter_results(
        "GFW防火墙是合理且利大于弊的",
        "GFW 防火墙 作用 影响 数据 研究",
        results,
    )

    assert [result.title for result in filtered] == ["GFW 对网络内容治理的影响研究"]


@pytest.mark.asyncio
async def test_web_search_plans_queries_and_returns_filtered_brief(monkeypatch):
    seen_queries: list[str] = []

    class FakeFactory:
        async def search(self, query: str, num_results: int = 5) -> list[SearchResult]:
            seen_queries.append(query)
            if "法律 政策 依据" in query:
                return [
                    SearchResult(
                        title="Preparing Your Thesis Proposal Presentation",
                        url="https://example.com/thesis",
                        snippet="Use a thesis statement and essay outline.",
                        source_engine="duckduckgo",
                    ),
                    SearchResult(
                        title="网络安全法与互联网信息治理框架",
                        url="https://example.com/law",
                        snippet="介绍中国网络安全法及相关网络治理制度框架。",
                        source_engine="duckduckgo",
                    ),
                ]
            if "作用 影响 数据 研究" in query:
                return [
                    SearchResult(
                        title="GFW 对网络安全与信息流动影响的研究",
                        url="https://example.com/impact",
                        snippet="梳理了 GFW 对网络安全、访问成本与信息流动的影响。",
                        source_engine="duckduckgo",
                    )
                ]
            if "争议 风险 案例" in query:
                return [
                    SearchResult(
                        title="GFW 相关争议与案例分析",
                        url="https://example.com/cases",
                        snippet="总结了围绕 GFW 的主要争议点与案例。",
                        source_engine="duckduckgo",
                    )
                ]
            return []

    monkeypatch.setattr(search_tool, "get_search_factory", lambda: FakeFactory())

    result = await search_tool.web_search.ainvoke(
        {"query": "GFW防火墙是合理且利大于弊的"}
    )

    assert seen_queries == [
        "GFW 防火墙 法律 政策 依据",
        "GFW 防火墙 作用 影响 数据 研究",
        "GFW 防火墙 争议 风险 案例",
    ]
    assert "Debate Evidence Brief" in result
    assert "Preparing Your Thesis Proposal Presentation" not in result
    assert "网络安全法与互联网信息治理框架" in result
    assert "GFW 对网络安全与信息流动影响的研究" in result
