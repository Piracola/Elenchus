"""Performance tests for runtime event history reading operations."""

from __future__ import annotations

import time

import pytest

from app.models.schemas import SessionCreate
from app.services import runtime_event_service, session_service


def make_event(seq: int, session_id: str = "session_perf") -> dict[str, object]:
    """Create a test runtime event."""
    return {
        "schema_version": "2026-03-17",
        "event_id": f"evt_perf_{seq}",
        "session_id": session_id,
        "seq": seq,
        "timestamp": f"2026-03-18T00:{seq // 60:02d}:{seq % 60:02d}+00:00",
        "source": "perf.test",
        "type": "speech_end" if seq % 2 == 0 else "judge_score",
        "phase": "processing",
        "payload": {
            "content": f"Performance test event {seq}" * 3,
            "role": "proposer" if seq % 2 == 0 else "opposer",
        },
    }


@pytest.mark.asyncio
async def test_read_small_history_100_events():
    """Test reading 100 events - should complete within 100ms."""
    session = await session_service.create_session(
        SessionCreate(topic="Perf test - small history"),
    )
    session_id = session["id"]

    # Insert 100 events
    for seq in range(1, 101):
        await runtime_event_service.create_runtime_event(make_event(seq, session_id))

    # Measure read performance
    start_time = time.perf_counter()
    result = await runtime_event_service.list_runtime_events(
        session_id,
        limit=100,
    )
    read_time = (time.perf_counter() - start_time) * 1000  # Convert to ms

    assert len(result["events"]) == 100
    assert read_time < 100, f"Reading 100 events took {read_time:.2f}ms (expected < 100ms)"


@pytest.mark.asyncio
async def test_read_medium_history_500_events():
    """Test reading 500 events - should complete within 300ms."""
    session = await session_service.create_session(
        SessionCreate(topic="Perf test - medium history"),
    )
    session_id = session["id"]

    # Insert 500 events
    for seq in range(1, 501):
        await runtime_event_service.create_runtime_event(make_event(seq, session_id))

    # Measure read performance
    start_time = time.perf_counter()
    result = await runtime_event_service.list_runtime_events(
        session_id,
        limit=500,
    )
    read_time = (time.perf_counter() - start_time) * 1000

    assert len(result["events"]) == 500
    assert read_time < 300, f"Reading 500 events took {read_time:.2f}ms (expected < 300ms)"


@pytest.mark.asyncio
async def test_read_large_history_1000_events():
    """Test reading 1000 events - should complete within 500ms."""
    session = await session_service.create_session(
        SessionCreate(topic="Perf test - large history"),
    )
    session_id = session["id"]

    # Insert 1000 events
    for seq in range(1, 1001):
        await runtime_event_service.create_runtime_event(make_event(seq, session_id))

    # Measure read performance
    start_time = time.perf_counter()
    result = await runtime_event_service.list_runtime_events(
        session_id,
        limit=1000,
    )
    read_time = (time.perf_counter() - start_time) * 1000

    assert len(result["events"]) == 1000
    assert read_time < 500, f"Reading 1000 events took {read_time:.2f}ms (expected < 500ms)"


@pytest.mark.asyncio
async def test_read_very_large_history_5000_events():
    """Test reading 5000 events - should complete within 2000ms."""
    session = await session_service.create_session(
        SessionCreate(topic="Perf test - very large history"),
    )
    session_id = session["id"]

    # Insert 5000 events
    for seq in range(1, 5001):
        await runtime_event_service.create_runtime_event(make_event(seq, session_id))

    # Measure read performance
    start_time = time.perf_counter()
    result = await runtime_event_service.list_runtime_events(
        session_id,
        limit=5000,
    )
    read_time = (time.perf_counter() - start_time) * 1000

    assert len(result["events"]) == 5000
    assert read_time < 2000, f"Reading 5000 events took {read_time:.2f}ms (expected < 2000ms)"


@pytest.mark.asyncio
async def test_read_all_events_performance():
    """Test reading all events without pagination - should complete within 1000ms for 1000 events."""
    session = await session_service.create_session(
        SessionCreate(topic="Perf test - read all"),
    )
    session_id = session["id"]

    # Insert 1000 events
    for seq in range(1, 1001):
        await runtime_event_service.create_runtime_event(make_event(seq, session_id))

    # Measure read all performance
    start_time = time.perf_counter()
    events = await runtime_event_service.list_all_runtime_events(session_id)
    read_time = (time.perf_counter() - start_time) * 1000

    assert len(events) == 1000
    assert read_time < 1000, f"Reading all 1000 events took {read_time:.2f}ms (expected < 1000ms)"


@pytest.mark.asyncio
async def test_sequential_reads_stability():
    """Test that 10 sequential reads maintain stable performance."""
    session = await session_service.create_session(
        SessionCreate(topic="Perf test - sequential reads"),
    )
    session_id = session["id"]

    # Insert 500 events
    for seq in range(1, 501):
        await runtime_event_service.create_runtime_event(make_event(seq, session_id))

    times = []
    for _ in range(10):
        start_time = time.perf_counter()
        await runtime_event_service.list_runtime_events(
            session_id,
            limit=100,
        )
        read_time = (time.perf_counter() - start_time) * 1000
        times.append(read_time)

    avg_time = sum(times) / len(times)
    max_time = max(times)

    assert avg_time < 100, f"Average read time {avg_time:.2f}ms exceeded 100ms"
    assert max_time < 200, f"Max read time {max_time:.2f}ms exceeded 200ms"


@pytest.mark.asyncio
async def test_get_latest_seq_performance():
    """Test getting latest sequence number performance."""
    session = await session_service.create_session(
        SessionCreate(topic="Perf test - latest seq"),
    )
    session_id = session["id"]

    # Insert 1000 events
    for seq in range(1, 1001):
        await runtime_event_service.create_runtime_event(make_event(seq, session_id))

    # Measure performance
    start_time = time.perf_counter()
    for _ in range(100):
        await runtime_event_service.get_latest_runtime_event_seq(session_id)
    total_time = (time.perf_counter() - start_time) * 1000

    avg_time = total_time / 100
    assert avg_time < 5, f"Average get_latest_seq time {avg_time:.2f}ms exceeded 5ms"


@pytest.mark.asyncio
async def test_event_write_performance():
    """Test event write performance."""
    session = await session_service.create_session(
        SessionCreate(topic="Perf test - write"),
    )
    session_id = session["id"]

    # Measure write performance for 100 events
    start_time = time.perf_counter()
    for seq in range(1, 101):
        await runtime_event_service.create_runtime_event(make_event(seq, session_id))
    write_time = (time.perf_counter() - start_time) * 1000

    avg_write_time = write_time / 100
    assert avg_write_time < 20, f"Average write time {avg_write_time:.2f}ms exceeded 20ms"


@pytest.mark.asyncio
async def test_mixed_read_write_performance():
    """Test mixed read/write operations performance."""
    session = await session_service.create_session(
        SessionCreate(topic="Perf test - mixed operations"),
    )
    session_id = session["id"]

    # Insert 200 events
    for seq in range(1, 201):
        await runtime_event_service.create_runtime_event(make_event(seq, session_id))

    # Mix of reads and writes
    start_time = time.perf_counter()

    # Read operations
    await runtime_event_service.list_runtime_events(session_id, limit=100)
    await runtime_event_service.list_runtime_events(session_id, limit=50)
    await runtime_event_service.get_latest_runtime_event_seq(session_id)

    # Write operations
    for seq in range(201, 211):
        await runtime_event_service.create_runtime_event(make_event(seq, session_id))

    # Final read
    await runtime_event_service.list_runtime_events(session_id, limit=10)

    total_time = (time.perf_counter() - start_time) * 1000

    assert total_time < 500, f"Mixed operations took {total_time:.2f}ms (expected < 500ms)"


@pytest.mark.asyncio
async def test_concurrent_session_reads():
    """Test reading from multiple sessions performance."""
    # Create 5 sessions with 100 events each
    session_ids = []
    for i in range(5):
        session = await session_service.create_session(
            SessionCreate(topic=f"Perf test - session {i}"),
        )
        session_ids.append(session["id"])

        for seq in range(1, 101):
            await runtime_event_service.create_runtime_event(
                make_event(seq, session["id"])
            )

    # Read from all sessions
    start_time = time.perf_counter()
    for session_id in session_ids:
        await runtime_event_service.list_runtime_events(
            session_id,
            limit=50,
        )
    total_time = (time.perf_counter() - start_time) * 1000

    assert total_time < 500, f"Reading from 5 sessions took {total_time:.2f}ms (expected < 500ms)"
