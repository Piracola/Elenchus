"""Tests for export download filenames."""

from __future__ import annotations

from app.services import export_service


def test_build_export_filename_uses_topic_and_sanitizes_invalid_chars():
    filename = export_service.build_export_filename(
        {"topic": 'AI / Education: "More effective?"'},
        "md",
    )

    assert filename == "AI _ Education_ _More effective__.md"


def test_build_export_filename_falls_back_for_empty_topic():
    filename = export_service.build_export_filename({"topic": "   "}, "json")

    assert filename == "未命名辩题.json"


def test_build_content_disposition_exposes_utf8_filename():
    disposition = export_service.build_content_disposition("测试导出.json")

    assert 'filename="debate-export.json"' in disposition
    assert "filename*=UTF-8''" in disposition
    assert "%E6%B5%8B%E8%AF%95%E5%AF%BC%E5%87%BA.json" in disposition
