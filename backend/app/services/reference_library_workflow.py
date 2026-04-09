"""Reference library workflow — RE-EXPORT for backward compatibility."""

from app.agents.reference_preprocessor import (
    build_reference_entries,
    preprocess_reference_document,
)
from app.services.reference.workflow import preprocess_session_document

# Re-export so tests can monkeypatch at this path
__all__ = ["preprocess_session_document", "build_reference_entries", "preprocess_reference_document"]
