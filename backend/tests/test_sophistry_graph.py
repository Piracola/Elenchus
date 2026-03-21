"""Tests for the standalone sophistry experiment graph."""

from __future__ import annotations

from app.agents.sophistry_graph import (
    compile_sophistry_graph,
    should_route_after_set_speaker,
    should_route_after_speaker,
)


def test_sophistry_graph_compiles():
    app = compile_sophistry_graph()
    assert app is not None


def test_sophistry_graph_routes_current_speaker_before_observer():
    assert should_route_after_set_speaker(
        {
            "participants": ["proposer", "opposer"],
            "current_speaker": "proposer",
            "current_speaker_index": 0,
        }
    ) == "speaker"

    assert should_route_after_set_speaker(
        {
            "participants": ["proposer", "opposer"],
            "current_speaker": "",
            "current_speaker_index": 1,
        }
    ) == "observer"


def test_sophistry_graph_routes_to_next_speaker_then_observer():
    assert should_route_after_speaker(
        {
            "participants": ["proposer", "opposer"],
            "current_speaker_index": 0,
        }
    ) == "next_speaker"

    assert should_route_after_speaker(
        {
            "participants": ["proposer", "opposer"],
            "current_speaker_index": 1,
        }
    ) == "observer"
