from app.dependencies import (
    clear_dependency_cache,
    get_runtime_bus,
)


def test_runtime_bus_is_cached_singleton():
    clear_dependency_cache()

    runtime_bus = get_runtime_bus()
    assert get_runtime_bus() is runtime_bus
