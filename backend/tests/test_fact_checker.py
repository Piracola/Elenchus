from __future__ import annotations

import pytest

from app.agents import fact_checker


def _state(**overrides):
    state = {
        "topic": "全民基本收入是否可行",
        "participants": ["proposer", "opposer"],
        "current_turn": 1,
        "reasoning_config": {"fact_check_enabled": True},
        "agent_configs": {},
        "dialogue_history": [
            {"role": "proposer", "content": "上一轮内容", "turn": 0},
            {"role": "proposer", "content": "芬兰实验显示就业率未下降", "turn": 1},
            {"role": "group_discussion", "content": "内部讨论", "turn": 1},
            {"role": "opposer", "content": "2023 年成本估算为 GDP 的 12%", "turn": 1},
        ],
    }
    state.update(overrides)
    return state


def test_collect_turn_speeches_only_returns_current_turn_debaters():
    speeches = fact_checker.collect_turn_speeches(_state())

    assert [entry["role"] for entry in speeches] == ["proposer", "opposer"]
    assert all(entry["turn"] == 1 for entry in speeches)


@pytest.mark.parametrize(
    "raw,expected",
    [
        ('["芬兰 UBI 实验 就业率 2019"]', ["芬兰 UBI 实验 就业率 2019"]),
        ('```json\n["查询 A", "查询 B"]\n```', ["查询 A", "查询 B"]),
        ('这是结果：["查询 A"] 完毕', ["查询 A"]),
        ("[]", []),
        ("完全不是 JSON", []),
        ('["重复", "重复"]', ["重复"]),
    ],
)
def test_parse_query_list_handles_model_output_variants(raw, expected):
    assert fact_checker.parse_query_list(raw) == expected


def test_parse_query_list_caps_query_count():
    raw = '["查询一", "查询二", "查询三", "查询四", "查询五"]'
    assert len(fact_checker.parse_query_list(raw)) == fact_checker.MAX_QUERIES_PER_TURN


@pytest.mark.asyncio
async def test_fact_check_turn_builds_knowledge_entries(monkeypatch):
    captured_prompt: list[str] = []

    async def fake_refresh(state):
        return state.get("agent_configs", {})

    async def fake_invoke_text_model(messages, **kwargs):
        captured_prompt.append(messages[-1].content)
        return '["芬兰 UBI 实验 就业率", "UBI 成本占 GDP 比例 2023"]'

    async def fake_run_search(query, topic):
        return f"Evidence for {query}"

    monkeypatch.setattr(fact_checker, "refresh_agent_configs_for_session", fake_refresh)
    monkeypatch.setattr(fact_checker, "get_fact_checker_prompt", lambda: "核查提示")
    monkeypatch.setattr(fact_checker, "invoke_text_model", fake_invoke_text_model)
    monkeypatch.setattr(fact_checker, "_run_search", fake_run_search)

    result = await fact_checker.fact_check_turn(_state())

    assert len(result["shared_knowledge"]) == 2
    first = result["shared_knowledge"][0]
    assert first["type"] == "fact"
    assert first["source_kind"] == "fact_checker"
    assert first["source_turn"] == 1
    # Only this turn's debater speeches are handed to the checker.
    assert "芬兰实验显示就业率未下降" in captured_prompt[0]
    assert "上一轮内容" not in captured_prompt[0]
    assert "内部讨论" not in captured_prompt[0]


@pytest.mark.asyncio
async def test_fact_check_turn_degrades_when_model_fails(monkeypatch):
    async def fake_refresh(state):
        return {}

    async def failing_invoke(messages, **kwargs):
        raise RuntimeError("provider down")

    monkeypatch.setattr(fact_checker, "refresh_agent_configs_for_session", fake_refresh)
    monkeypatch.setattr(fact_checker, "get_fact_checker_prompt", lambda: "核查提示")
    monkeypatch.setattr(fact_checker, "invoke_text_model", failing_invoke)

    # A failing fact check must never break the debate.
    result = await fact_checker.fact_check_turn(_state())
    assert result == {"shared_knowledge": []}


@pytest.mark.asyncio
async def test_fact_check_turn_skips_when_no_speeches_this_turn(monkeypatch):
    async def unexpected_invoke(messages, **kwargs):  # pragma: no cover
        raise AssertionError("model should not be called")

    monkeypatch.setattr(fact_checker, "invoke_text_model", unexpected_invoke)

    result = await fact_checker.fact_check_turn(_state(current_turn=9))
    assert result == {"shared_knowledge": []}


@pytest.mark.asyncio
async def test_fact_check_turn_tolerates_search_failure(monkeypatch):
    async def fake_refresh(state):
        return {}

    async def fake_invoke(messages, **kwargs):
        return '["查询一", "查询二"]'

    async def flaky_search(query, topic):
        if query == "查询一":
            raise RuntimeError("search down")
        return "Evidence for 查询二"

    monkeypatch.setattr(fact_checker, "refresh_agent_configs_for_session", fake_refresh)
    monkeypatch.setattr(fact_checker, "get_fact_checker_prompt", lambda: "核查提示")
    monkeypatch.setattr(fact_checker, "invoke_text_model", fake_invoke)
    monkeypatch.setattr(fact_checker, "_run_search", flaky_search)

    result = await fact_checker.fact_check_turn(_state())
    assert [entry["query"] for entry in result["shared_knowledge"]] == ["查询二"]


def test_graph_routes_speaker_to_fact_check_when_enabled():
    from app.agents.graph import should_execute_tools

    state = {
        "participants": ["proposer", "opposer"],
        "current_speaker_index": 1,
        "messages": [],
        "reasoning_config": {"fact_check_enabled": True},
    }
    assert should_execute_tools(state) == "fact_check"


def test_graph_skips_fact_check_when_disabled():
    from app.agents.graph import should_execute_tools

    state = {
        "participants": ["proposer", "opposer"],
        "current_speaker_index": 1,
        "messages": [],
        "reasoning_config": {"fact_check_enabled": False},
    }
    assert should_execute_tools(state) == "judge"


def test_fact_check_node_is_wired_between_speaker_and_judge():
    from app.agents.graph import build_debate_graph

    graph = build_debate_graph()
    assert "fact_check" in graph.nodes
    branches = graph.branches["speaker"]
    path_map = next(iter(branches.values())).ends
    assert path_map["fact_check"] == "fact_check"
