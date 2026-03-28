"""
Manual test script for search providers.

Run with: python backend/manual_tests/manual_test_search.py
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.dependencies import get_search_factory


async def main():
    print("Testing search...")
    search_factory = get_search_factory()
    try:
        results = await search_factory.search("test")
        print(f"Results: {results}")
    finally:
        await search_factory.close()


if __name__ == "__main__":
    asyncio.run(main())
