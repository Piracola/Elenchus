"""Shared constants for the Elenchus backend.

Kept import-free so both the config store and the LLM layer can depend on it
without creating an import cycle.
"""

# Run-level failure budget defaults (see app.llm.failure_budget).
DEFAULT_MAX_TOTAL_FAILURES = 12
DEFAULT_RETRY_AFTER_CLAMP_SECONDS = 120
DEFAULT_MAX_TOTAL_BACKOFF_SECONDS = 600
DEFAULT_MAX_RUN_DURATION_MINUTES = 180

# Display names for debate roles
ROLE_NAMES: dict[str, str] = {
    "proposer": "正方 (Proposer)",
    "opposer": "反方 (Opposer)",
}

# Display labels (Chinese only) for roles
ROLE_LABELS: dict[str, str] = {
    "proposer": "正方",
    "opposer": "反方",
    "judge": "裁判长",
    "fact_checker": "事实核查员",
}
