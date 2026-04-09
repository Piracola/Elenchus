"""Reference library service — RE-EXPORT for backward compatibility."""

from app.services.reference.service import (
    delete_reference_library_for_document,
    get_reference_entries_for_document,
    list_reference_library,
)
from app.services.reference.workflow import preprocess_session_document

__all__ = [
    "list_reference_library",
    "delete_reference_library_for_document",
    "get_reference_entries_for_document",
    "preprocess_session_document",
]
