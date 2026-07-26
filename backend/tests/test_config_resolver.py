"""Tests for the centralized agent-config resolver."""

from __future__ import annotations

from app.agents.config_resolver import AGENT_CONFIG_FALLBACKS, resolve_agent_override


class TestResolveAgentOverride:
    def test_direct_hit(self):
        configs = {"judge": {"model": "gpt-4o"}}
        result = resolve_agent_override(configs, "judge")
        assert result == {"model": "gpt-4o"}

    def test_fallback_chain(self):
        configs = {"judge": {"model": "gpt-4o"}}
        result = resolve_agent_override(configs, "consensus")
        assert result == {"model": "gpt-4o"}

    def test_no_match_returns_none(self):
        assert resolve_agent_override({}, "judge") is None
        assert resolve_agent_override(None, "judge") is None

    def test_empty_dict_skipped(self):
        configs = {"consensus": {}, "judge": {"model": "gpt-4o"}}
        result = resolve_agent_override(configs, "consensus")
        assert result == {"model": "gpt-4o"}

    def test_proposer_fallback_to_debater(self):
        configs = {"debater": {"model": "claude-3"}}
        result = resolve_agent_override(configs, "proposer")
        assert result == {"model": "claude-3"}

    def test_proposer_direct_takes_precedence(self):
        configs = {"proposer": {"model": "gpt-4o"}, "debater": {"model": "claude-3"}}
        result = resolve_agent_override(configs, "proposer")
        assert result == {"model": "gpt-4o"}

    def test_observer_fallback_to_judge(self):
        configs = {"judge": {"model": "gpt-4o"}}
        result = resolve_agent_override(configs, "observer")
        assert result == {"model": "gpt-4o"}

    def test_group_discussion_fallback_to_judge(self):
        configs = {"judge": {"model": "gpt-4o"}}
        result = resolve_agent_override(configs, "group_discussion")
        assert result == {"model": "gpt-4o"}

    def test_consensus_fallback_to_judge(self):
        configs = {"judge": {"model": "gpt-4o"}}
        result = resolve_agent_override(configs, "consensus")
        assert result == {"model": "gpt-4o"}

    def test_returns_copy(self):
        configs = {"judge": {"model": "gpt-4o"}}
        result = resolve_agent_override(configs, "judge")
        result["model"] = "mutated"
        assert configs["judge"]["model"] == "gpt-4o"


class TestFallbackChains:
    def test_all_roles_have_fallbacks(self):
        expected_roles = {
            "proposer", "opposer", "judge", "fact_checker",
            "consensus", "group_discussion", "observer", "debater",
        }
        assert set(AGENT_CONFIG_FALLBACKS.keys()) == expected_roles

    def test_fallbacks_are_non_empty(self):
        for role, chain in AGENT_CONFIG_FALLBACKS.items():
            assert len(chain) > 0, f"{role} has empty fallback chain"
            assert chain[0] == role, f"{role} first fallback should be itself"
