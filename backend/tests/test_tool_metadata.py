from types import SimpleNamespace

from app.agents.graph import _build_tool_knowledge_entry
from app.agents.skills.metadata import get_tool_shared_knowledge_type
from app.agents.skills.search_tool import web_search


def test_web_search_declares_fact_memory_metadata():
    assert get_tool_shared_knowledge_type(web_search) == "fact"


def test_build_tool_knowledge_entry_uses_tool_metadata():
    entry = _build_tool_knowledge_entry(
        web_search,
        {"args": {"query": "AI safety"}},
        "result body",
        current_role="proposer",
        current_agent_name="Proposer",
        current_turn=2,
    )

    assert entry is not None
    assert entry["type"] == "fact"
    assert entry["query"] == "AI safety"
    assert entry["source_kind"] == "tool_call"


def test_build_tool_knowledge_entry_skips_unmarked_tools():
    tool = SimpleNamespace(metadata=None)

    assert _build_tool_knowledge_entry(
        tool,
        {"args": {"query": "ignored"}},
        "result body",
        current_role="proposer",
        current_agent_name="Proposer",
        current_turn=2,
    ) is None
