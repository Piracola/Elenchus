"""
Manual test script for search providers.

Run with: python -m tests.manual_test_search
"""
import asyncio
import os
import sys

# Add the backend dir to path so app. imports work
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.search.factory import SearchProviderFactory

async def main():
    print("Testing search...")
    try:
        results = await SearchProviderFactory.search("test")
        print(f"Results: {results}")
    finally:
        await SearchProviderFactory.close()

if __name__ == "__main__":
    asyncio.run(main())
