from __future__ import annotations

import pytest

from app.agents.runtime_progress import (
    MODEL_HEARTBEAT_INTERVAL_SECONDS,
    build_status_heartbeat_callback,
)


class _FakeRuntimeEventEmitter:
    def __init__(self) -> None:
        self.calls: list[dict[str, object]] = []

    async def emit_runtime_event(
        self,
        *,
        session_id: str,
        event_type: str,
        payload: dict[str, object],
        source: str,
        phase: str,
    ) -> None:
        self.calls.append(
            {
                "session_id": session_id,
                "event_type": event_type,
                "payload": payload,
                "source": source,
                "phase": phase,
            }
        )


def test_model_heartbeat_interval_is_one_second() -> None:
    assert MODEL_HEARTBEAT_INTERVAL_SECONDS == 1.0


@pytest.mark.asyncio
async def test_status_heartbeat_uses_elapsed_seconds_in_whole_second_steps() -> None:
    emitter = _FakeRuntimeEventEmitter()
    callback = build_status_heartbeat_callback(
        {
            "runtime_event_emitter": emitter,
            "session_id": "session-1",
        },
        node_name="speaker",
        template="辩手仍在生成发言，已等待 {seconds} 秒...",
    )

    assert callback is not None

    await callback(3.9)

    assert emitter.calls == [
        {
            "session_id": "session-1",
            "event_type": "status",
            "payload": {
                "content": "辩手仍在生成发言，已等待 3 秒...",
                "node": "speaker",
                "heartbeat": True,
                "elapsed_seconds": 3,
            },
            "source": "runtime.node.speaker.heartbeat",
            "phase": "speaking",
        }
    ]
