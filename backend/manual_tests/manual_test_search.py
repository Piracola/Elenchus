"""
Manual test script for search providers.

Run with: python backend/manual_tests/manual_test_search.py
"""
from app.dependencies import get_search_factory
from scripts.test_utils import run_async, setup_backend_path


async def main():
    print("Testing search...")
    search_factory = get_search_factory()
    try:
        results = await search_factory.search("test")
        print(f"Results: {results}")
    finally:
        await search_factory.close()


if __name__ == "__main__":
    setup_backend_path()
    run_async(main)
