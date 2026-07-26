from __future__ import annotations

import httpx
import pytest

from app.services import video_bridge_service


def _payload(**overrides):
    payload = {
        "topic": "AI 是否应被严格监管",
        "debate_mode": "standard",
        "participants": ["proposer", "opposer"],
        "dialogue_history": [
            {"role": "proposer", "content": "正方一辩", "turn": 0},
            {"role": "opposer", "content": "反方一辩", "turn": 0},
            {"role": "judge", "content": "评语", "turn": 0},
        ],
        "current_scores": {},
    }
    payload.update(overrides)
    return payload


def test_warnings_flag_sophistry_mode():
    warnings = video_bridge_service.collect_handoff_warnings(
        _payload(debate_mode="sophistry_experiment")
    )
    assert any("诡辩" in warning for warning in warnings)


def test_warnings_flag_empty_transcript():
    warnings = video_bridge_service.collect_handoff_warnings(_payload(dialogue_history=[]))
    assert any("没有任何发言" in warning for warning in warnings)


def test_standard_session_has_no_warnings():
    assert video_bridge_service.collect_handoff_warnings(_payload()) == []


@pytest.mark.asyncio
async def test_send_session_posts_export_to_renderer(monkeypatch):
    captured: dict[str, object] = {}

    class _FakeResponse:
        status_code = 200
        text = "ok"

    class _FakeClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc_info):
            return False

        async def post(self, url, json=None):
            captured["url"] = url
            captured["json"] = json
            return _FakeResponse()

    monkeypatch.setattr(video_bridge_service.httpx, "AsyncClient", _FakeClient)

    result = await video_bridge_service.send_session_to_video_tool(_payload())

    assert captured["url"].endswith("/api/import")
    # Only debater speeches count toward the reported speech total.
    assert result.speech_count == 2
    assert result.topic == "AI 是否应被严格监管"
    assert isinstance(captured["json"], dict)
    assert captured["json"]["topic"] == "AI 是否应被严格监管"


@pytest.mark.asyncio
async def test_send_session_raises_when_renderer_is_down(monkeypatch):
    class _FailingClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc_info):
            return False

        async def post(self, url, json=None):
            raise httpx.ConnectError("connection refused")

    monkeypatch.setattr(video_bridge_service.httpx, "AsyncClient", _FailingClient)

    with pytest.raises(video_bridge_service.VideoToolUnavailableError) as excinfo:
        await video_bridge_service.send_session_to_video_tool(_payload())

    assert "启动视频生成器" in str(excinfo.value)


@pytest.mark.asyncio
async def test_send_session_surfaces_renderer_rejection(monkeypatch):
    class _RejectingResponse:
        status_code = 400
        text = "dialogue_history is required"

    class _RejectingClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc_info):
            return False

        async def post(self, url, json=None):
            return _RejectingResponse()

    monkeypatch.setattr(video_bridge_service.httpx, "AsyncClient", _RejectingClient)

    with pytest.raises(video_bridge_service.VideoToolUnavailableError) as excinfo:
        await video_bridge_service.send_session_to_video_tool(_payload())

    assert "400" in str(excinfo.value)
