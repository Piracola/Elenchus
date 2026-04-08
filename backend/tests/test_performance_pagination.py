"""Performance tests for pagination operations."""

from __future__ import annotations

import time

import pytest

from app.models.schemas import SessionCreate
from app.services import runtime_event_service, session_service


def make_event(seq: int, session_id: str = "session_pagination_perf") -> dict[str, object]:
    """Create a test runtime event for pagination tests."""
    return {
        "schema_version": "2026-03-17",
        "event_id": f"evt_page_{seq}",
        "session_id": session_id,
        "seq": seq,
        "timestamp": f"2026-03-18T00:{seq // 60:02d}:{seq % 60:02d}+00:00",
        "source": "pagination.perf.test",
        "type": "speech_end" if seq % 2 == 0 else "judge_score",
        "phase": "processing",
        "payload": {
            "content": f"Pagination test event {seq}" * 2,
            "role": "proposer" if seq % 2 == 0 else "opposer",
            "turn": seq // 2,
        },
    }


@pytest.mark.asyncio
async def test_pagination_first_page_performance():
    """Test first page load performance - should be very fast."""
    session = await session_service.create_session(
        SessionCreate(topic="Pagination perf - first page"),
    )
    session_id = session["id"]

    # Insert 1000 events
    for seq in range(1, 1001):
        await runtime_event_service.create_runtime_event(make_event(seq, session_id))

    # Measure first page load (80 events - typical batch size)
    start_time = time.perf_counter()
    result = await runtime_event_service.list_runtime_events(
        session_id,
        limit=80,
    )
    load_time = (time.perf_counter() - start_time) * 1000

    assert len(result["events"]) == 80
    assert result["has_more"] is True
    assert load_time < 50, f"First page load took {load_time:.2f}ms (expected < 50ms)"


@pytest.mark.asyncio
async def test_pagination_sequential_pages_performance():
    """Test loading 5 sequential pages performance."""
    session = await session_service.create_session(
        SessionCreate(topic="Pagination perf - sequential"),
    )
    session_id = session["id"]

    # Insert 1000 events
    for seq in range(1, 1001):
        await runtime_event_service.create_runtime_event(make_event(seq, session_id))

    # Load 5 pages sequentially
    start_time = time.perf_counter()

    page1 = await runtime_event_service.list_runtime_events(session_id, limit=80)
    assert len(page1["events"]) == 80

    page2 = await runtime_event_service.list_runtime_events(
        session_id,
        before_seq=page1["next_before_seq"],
        limit=80
    )
    assert len(page2["events"]) == 80

    page3 = await runtime_event_service.list_runtime_events(
        session_id,
        before_seq=page2["next_before_seq"],
        limit=80
    )
    assert len(page3["events"]) == 80

    page4 = await runtime_event_service.list_runtime_events(
        session_id,
        before_seq=page3["next_before_seq"],
        limit=80
    )
    assert len(page4["events"]) == 80

    page5 = await runtime_event_service.list_runtime_events(
        session_id,
        before_seq=page4["next_before_seq"],
        limit=80
    )
    assert len(page5["events"]) == 80

    total_time = (time.perf_counter() - start_time) * 1000

    assert total_time < 300, f"Loading 5 pages took {total_time:.2f}ms (expected < 300ms)"


@pytest.mark.asyncio
async def test_pagination_random_access_performance():
    """Test jumping to different pages (random access)."""
    session = await session_service.create_session(
        SessionCreate(topic="Pagination perf - random access"),
    )
    session_id = session["id"]

    # Insert 2000 events
    for seq in range(1, 2001):
        await runtime_event_service.create_runtime_event(make_event(seq, session_id))

    # Jump to different pages
    start_time = time.perf_counter()

    # Jump to page at seq 1500
    page_1500 = await runtime_event_service.list_runtime_events(
        session_id,
        before_seq=1500,
        limit=80
    )
    assert len(page_1500["events"]) == 80

    # Jump to page at seq 1000
    page_1000 = await runtime_event_service.list_runtime_events(
        session_id,
        before_seq=1000,
        limit=80
    )
    assert len(page_1000["events"]) == 80

    # Jump to page at seq 500
    page_500 = await runtime_event_service.list_runtime_events(
        session_id,
        before_seq=500,
        limit=80
    )
    assert len(page_500["events"]) == 80

    total_time = (time.perf_counter() - start_time) * 1000

    assert total_time < 200, f"Random access jumps took {total_time:.2f}ms (expected < 200ms)"


@pytest.mark.asyncio
async def test_pagination_different_page_sizes():
    """Test performance with different page sizes."""
    session = await session_service.create_session(
        SessionCreate(topic="Pagination perf - page sizes"),
    )
    session_id = session["id"]

    # Insert 1000 events
    for seq in range(1, 1001):
        await runtime_event_service.create_runtime_event(make_event(seq, session_id))

    # Test small page (20 events)
    start_time = time.perf_counter()
    small_page = await runtime_event_service.list_runtime_events(
        session_id, limit=20
    )
    small_time = (time.perf_counter() - start_time) * 1000
    assert len(small_page["events"]) == 20

    # Test medium page (80 events)
    start_time = time.perf_counter()
    medium_page = await runtime_event_service.list_runtime_events(
        session_id, limit=80
    )
    medium_time = (time.perf_counter() - start_time) * 1000
    assert len(medium_page["events"]) == 80

    # Test large page (200 events)
    start_time = time.perf_counter()
    large_page = await runtime_event_service.list_runtime_events(
        session_id, limit=200
    )
    large_time = (time.perf_counter() - start_time) * 1000
    assert len(large_page["events"]) == 200

    assert small_time < 30, f"Small page took {small_time:.2f}ms (expected < 30ms)"
    assert medium_time < 50, f"Medium page took {medium_time:.2f}ms (expected < 50ms)"
    assert large_time < 150, f"Large page took {large_time:.2f}ms (expected < 150ms)"


@pytest.mark.asyncio
async def test_pagination_total_count_performance():
    """Test that getting total count is fast."""
    session = await session_service.create_session(
        SessionCreate(topic="Pagination perf - total count"),
    )
    session_id = session["id"]

    # Insert 2000 events
    for seq in range(1, 2001):
        await runtime_event_service.create_runtime_event(make_event(seq, session_id))

    # Measure total count query
    start_time = time.perf_counter()
    result = await runtime_event_service.list_runtime_events(
        session_id,
        limit=80,
    )
    query_time = (time.perf_counter() - start_time) * 1000

    assert result["total"] == 2000
    assert query_time < 100, f"Total count query took {query_time:.2f}ms (expected < 100ms)"


@pytest.mark.asyncio
async def test_pagination_backward_navigation():
    """Test backward navigation performance (loading older events after newer)."""
    session = await session_service.create_session(
        SessionCreate(topic="Pagination perf - backward nav"),
    )
    session_id = session["id"]

    # Insert 1000 events
    for seq in range(1, 1001):
        await runtime_event_service.create_runtime_event(make_event(seq, session_id))

    # Load newest events first
    newest = await runtime_event_service.list_runtime_events(
        session_id, limit=80
    )

    # Load older events
    older = await runtime_event_service.list_runtime_events(
        session_id,
        before_seq=newest["next_before_seq"],
        limit=80
    )

    # Navigate back to newer (backward)
    start_time = time.perf_counter()
    back_to_newer = await runtime_event_service.list_runtime_events(
        session_id,
        limit=80,
    )
    backward_time = (time.perf_counter() - start_time) * 1000

    assert len(older["events"]) == 80
    assert len(back_to_newer["events"]) == 80
    assert backward_time < 50, f"Backward navigation took {backward_time:.2f}ms (expected < 50ms)"


@pytest.mark.asyncio
async def test_pagination_stress_test_rapid_requests():
    """Stress test: 50 rapid pagination requests."""
    session = await session_service.create_session(
        SessionCreate(topic="Pagination perf - stress test"),
    )
    session_id = session["id"]

    # Insert 1000 events
    for seq in range(1, 1001):
        await runtime_event_service.create_runtime_event(make_event(seq, session_id))

    # Make 50 rapid requests
    start_time = time.perf_counter()
    for i in range(50):
        before_seq = 1000 - (i * 20) if i > 0 else None
        await runtime_event_service.list_runtime_events(
            session_id,
            before_seq=before_seq,
            limit=20,
        )
    total_time = (time.perf_counter() - start_time) * 1000

    avg_time = total_time / 50
    assert avg_time < 50, f"Average request time {avg_time:.2f}ms exceeded 50ms"


@pytest.mark.asyncio
async def test_pagination_edge_cases_performance():
    """Test edge cases performance."""
    session = await session_service.create_session(
        SessionCreate(topic="Pagination perf - edge cases"),
    )
    session_id = session["id"]

    # Insert 100 events
    for seq in range(1, 101):
        await runtime_event_service.create_runtime_event(make_event(seq, session_id))

    # Test: Request more than available
    start_time = time.perf_counter()
    result = await runtime_event_service.list_runtime_events(
        session_id, limit=200
    )
    over_request_time = (time.perf_counter() - start_time) * 1000

    assert len(result["events"]) == 100
    assert result["has_more"] is False
    assert over_request_time < 50, f"Over-request took {over_request_time:.2f}ms (expected < 50ms)"

    # Test: Request with very large before_seq
    start_time = time.perf_counter()
    result = await runtime_event_service.list_runtime_events(
        session_id, before_seq=999999, limit=80
    )
    large_before_time = (time.perf_counter() - start_time) * 1000

    assert len(result["events"]) == 80
    assert large_before_time < 50, f"Large before_seq took {large_before_time:.2f}ms (expected < 50ms)"


@pytest.mark.asyncio
async def test_pagination_memory_stability():
    """Test that repeated pagination doesn't cause memory issues."""
    session = await session_service.create_session(
        SessionCreate(topic="Pagination perf - memory stability"),
    )
    session_id = session["id"]

    # Insert 500 events
    for seq in range(1, 501):
        await runtime_event_service.create_runtime_event(make_event(seq, session_id))

    # Load all pages
    start_time = time.perf_counter()
    page_count = 0
    before_seq = None

    while True:
        result = await runtime_event_service.list_runtime_events(
            session_id,
            before_seq=before_seq,
            limit=50,
        )
        page_count += 1

        if not result["has_more"]:
            break

        before_seq = result["next_before_seq"]

    total_time = (time.perf_counter() - start_time) * 1000

    assert page_count == 10  # 500 events / 50 per page
    assert total_time < 500, f"Loading all pages took {total_time:.2f}ms (expected < 500ms)"


@pytest.mark.asyncio
async def test_session_list_pagination_performance():
    """Test session list pagination performance."""
    # Create 50 sessions
    for i in range(50):
        await session_service.create_session(
            SessionCreate(topic=f"Session {i}"),
        )

    # Test first page
    start_time = time.perf_counter()
    page1 = await session_service.list_sessions(offset=0, limit=20)
    first_page_time = (time.perf_counter() - start_time) * 1000

    assert len(page1) == 20
    assert first_page_time < 100, f"First page took {first_page_time:.2f}ms (expected < 100ms)"

    # Test second page
    start_time = time.perf_counter()
    page2 = await session_service.list_sessions(offset=20, limit=20)
    second_page_time = (time.perf_counter() - start_time) * 1000

    assert len(page2) == 20
    assert second_page_time < 100, f"Second page took {second_page_time:.2f}ms (expected < 100ms)"

    # Test count
    start_time = time.perf_counter()
    total = await session_service.count_sessions()
    count_time = (time.perf_counter() - start_time) * 1000

    assert total == 50
    assert count_time < 50, f"Count took {count_time:.2f}ms (expected < 50ms)"
