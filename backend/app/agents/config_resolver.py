"""Centralized agent-config resolution with explicit fallback chains.

All graph nodes should use resolve_agent_override() instead of ad-hoc
.agent_configs.get() chains so that fallback behavior is documented in
one place and easy to change.
"""

from __future__ import annotations

from typing import Any

# Ordered fallback chains for every virtual role that may invoke an LLM.
# The first existing key in agent_configs wins.
AGENT_CONFIG_FALLBACKS: dict[str, list[str]] = {
    # Main debaters
    "proposer": ["proposer", "debater"],
    "opposer": ["opposer", "debater"],
    # Judge and direct derivatives
    "judge": ["judge"],
    "fact_checker": ["fact_checker"],
    # Team-mode internal discussion inherits from the side's public debater
    "team_member": ["team_member", "proposer", "opposer", "debater"],
    "team_summary": ["team_summary", "proposer", "opposer", "debater"],
    # Jury / consensus fall back to judge when not explicitly configured
    "jury": ["jury", "judge"],
    "consensus": ["consensus", "judge"],
    # Sophistry observer falls back to judge
    "observer": ["observer", "judge"],
    # Generic fallback
    "debater": ["debater"],
}


def resolve_agent_override(
    agent_configs: dict[str, Any] | None,
    role: str,
) -> dict[str, Any] | None:
    """Return the effective override dict for *role* following fallback chains.

    Args:
        agent_configs: The session's ``agent_configs`` snapshot.
        role: The virtual role requesting a model invocation.

    Returns:
        A dict override suitable for ``invoke_chat_model(override=...)``,
        or *None* when no config matches.
    """
    configs = agent_configs or {}
    fallbacks = AGENT_CONFIG_FALLBACKS.get(role, [role])
    for fallback_role in fallbacks:
        cfg = configs.get(fallback_role)
        if isinstance(cfg, dict) and cfg:
            return dict(cfg)
    return None
