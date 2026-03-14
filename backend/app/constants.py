"""
Shared constants for the Elenchus backend.

NOTE: The pending_interventions global dict has been replaced with a thread-safe
InterventionManager. See app.services.intervention_manager for the new implementation.
"""

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
