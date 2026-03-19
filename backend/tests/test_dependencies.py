from app.dependencies import (
    clear_dependency_cache,
    get_connection_hub,
    get_event_stream_gateway,
    get_runtime_bus,
)


def test_runtime_bus_aliases_share_singleton_instance():
    clear_dependency_cache()

    runtime_bus = get_runtime_bus()

    assert get_connection_hub() is runtime_bus
    assert get_event_stream_gateway() is runtime_bus
