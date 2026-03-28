from __future__ import annotations

from fastapi.testclient import TestClient
import pytest

from app.main import app


def _create_session(client: TestClient, topic: str = "Reference documents") -> str:
    response = client.post(
        "/api/sessions",
        json={
            "topic": topic,
            "max_turns": 3,
        },
    )
    assert response.status_code == 201
    return response.json()["id"]


def test_upload_session_document_and_fetch_detail(db_session):
    client = TestClient(app)
    session_id = _create_session(client)

    upload_response = client.post(
        f"/api/sessions/{session_id}/documents",
        files={
            "file": (
                "reference.txt",
                b"Layered control: split execution and oversight.\r\n\r\n2024 report shows 68% adoption.",
                "text/plain",
            )
        },
    )

    assert upload_response.status_code == 201
    uploaded = upload_response.json()
    assert uploaded["session_id"] == session_id
    assert uploaded["filename"] == "reference.txt"
    assert uploaded["mime_type"] == "text/plain"
    assert uploaded["status"] == "processed"
    assert uploaded["normalized_text"] == (
        "Layered control: split execution and oversight.\n\n2024 report shows 68% adoption."
    )
    assert uploaded["summary_short"]

    detail_response = client.get(
        f"/api/sessions/{session_id}/documents/{uploaded['id']}"
    )

    assert detail_response.status_code == 200
    detail = detail_response.json()
    assert detail["raw_text"] == (
        "Layered control: split execution and oversight.\r\n\r\n2024 report shows 68% adoption."
    )
    assert detail["normalized_text"] == (
        "Layered control: split execution and oversight.\n\n2024 report shows 68% adoption."
    )


def test_list_and_delete_session_documents(db_session):
    client = TestClient(app)
    session_id = _create_session(client, topic="List documents")

    upload_response = client.post(
        f"/api/sessions/{session_id}/documents",
        files={"file": ("outline.md", b"# Title\n\nParagraph", "text/markdown")},
    )
    assert upload_response.status_code == 201
    document_id = upload_response.json()["id"]

    list_response = client.get(f"/api/sessions/{session_id}/documents")

    assert list_response.status_code == 200
    documents = list_response.json()["documents"]
    assert len(documents) == 1
    assert documents[0]["id"] == document_id
    assert documents[0]["filename"] == "outline.md"
    assert documents[0]["mime_type"] == "text/markdown"
    assert documents[0]["status"] == "processed"
    assert "raw_text" not in documents[0]

    delete_response = client.delete(
        f"/api/sessions/{session_id}/documents/{document_id}"
    )
    assert delete_response.status_code == 204

    missing_response = client.get(
        f"/api/sessions/{session_id}/documents/{document_id}"
    )
    assert missing_response.status_code == 404
    assert missing_response.json() == {"detail": "Document not found"}


def test_upload_document_rejects_unsupported_file_type(db_session):
    client = TestClient(app)
    session_id = _create_session(client, topic="Unsupported document")

    response = client.post(
        f"/api/sessions/{session_id}/documents",
        files={"file": ("slides.pdf", b"%PDF-1.7", "application/pdf")},
    )

    assert response.status_code == 400
    assert response.json() == {
        "detail": "Unsupported file type. Only .txt and .md files are allowed."
    }


def test_upload_document_requires_existing_session(db_session):
    client = TestClient(app)

    response = client.post(
        "/api/sessions/missing123/documents",
        files={"file": ("reference.txt", b"text", "text/plain")},
    )

    assert response.status_code == 404
    assert response.json() == {"detail": "Session not found"}


def test_reference_library_endpoint_and_shared_knowledge_sync(db_session):
    client = TestClient(app)
    session_id = _create_session(client, topic="Reference sync")

    upload_response = client.post(
        f"/api/sessions/{session_id}/documents",
        files={
            "file": (
                "system.md",
                (
                    b"# Layered Governance\n\n"
                    b"\xe5\x88\x86\xe5\xb1\x82\xe6\x8e\xa7\xe5\x88\xb6\xef\xbc\x9a\xe6\x8a\x8a\xe6\x89\xa7\xe8\xa1\x8c\xe5\xb1\x82\xe3\x80\x81\xe7\x9b\x91\xe7\x9d\xa3\xe5\xb1\x82\xe4\xb8\x8e\xe5\xae\xa1\xe8\xae\xa1\xe5\xb1\x82\xe5\x88\x86\xe5\xbc\x80\xe3\x80\x82\n\n"
                    b"2024 \xe5\xb9\xb4\xe6\x8a\xa5\xe5\x91\x8a\xe6\x98\xbe\xe7\xa4\xba\xef\xbc\x8c68% \xe7\x9a\x84\xe8\xaf\x95\xe7\x82\xb9\xe5\x9b\xa2\xe9\x98\x9f\xe9\x87\x87\xe7\x94\xa8\xe8\xaf\xa5\xe4\xbd\x93\xe7\xb3\xbb\xe3\x80\x82"
                ),
                "text/markdown",
            )
        },
    )
    assert upload_response.status_code == 201
    document_id = upload_response.json()["id"]

    library_response = client.get(f"/api/sessions/{session_id}/reference-library")

    assert library_response.status_code == 200
    library = library_response.json()
    assert len(library["documents"]) == 1
    assert library["documents"][0]["id"] == document_id
    assert library["documents"][0]["status"] == "processed"
    assert any(entry["entry_type"] == "reference_summary" for entry in library["entries"])
    assert any(entry["entry_type"] == "reference_claim" for entry in library["entries"])

    session_response = client.get(f"/api/sessions/{session_id}")
    assert session_response.status_code == 200
    shared_knowledge = session_response.json()["shared_knowledge"]
    assert any(item["type"] == "reference_summary" for item in shared_knowledge)
    assert any(item["type"] == "reference_claim" for item in shared_knowledge)

    delete_response = client.delete(
        f"/api/sessions/{session_id}/documents/{document_id}"
    )
    assert delete_response.status_code == 204

    library_after_delete = client.get(f"/api/sessions/{session_id}/reference-library")
    assert library_after_delete.status_code == 200
    assert library_after_delete.json()["entries"] == []

    session_after_delete = client.get(f"/api/sessions/{session_id}")
    assert session_after_delete.status_code == 200
    assert session_after_delete.json()["shared_knowledge"] == []


def test_upload_session_document_returns_failed_document_when_preprocess_errors(db_session, monkeypatch: pytest.MonkeyPatch):
    client = TestClient(app)
    session_id = _create_session(client, topic="Reference failure")

    async def _raise_preprocess(*args, **kwargs):
        raise RuntimeError("preprocess exploded")

    monkeypatch.setattr(
        "app.services.reference_library_service.preprocess_reference_document",
        _raise_preprocess,
    )

    upload_response = client.post(
        f"/api/sessions/{session_id}/documents",
        files={"file": ("reference.txt", b"Failure path text", "text/plain")},
    )

    assert upload_response.status_code == 201
    uploaded = upload_response.json()
    assert uploaded["status"] == "failed"
    assert uploaded["error_message"] == "preprocess exploded"

    library_response = client.get(f"/api/sessions/{session_id}/reference-library")
    assert library_response.status_code == 200
    assert library_response.json()["entries"] == []

    session_response = client.get(f"/api/sessions/{session_id}")
    assert session_response.status_code == 200
    assert session_response.json()["shared_knowledge"] == []
