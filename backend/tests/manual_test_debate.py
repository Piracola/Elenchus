"""
Manual test script for debate runner.

Run with: python -m tests.manual_test_debate
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.agents.runner import run_debate

async def main():
    print("Starting debate...")
    state = await run_debate(
        session_id="test_session",
        topic="Is AI dangerous?",
        max_turns=1
    )
    print("Status:", state.get("status"))
    print("Error:", state.get("error"))
    print("Messages count:", len(state.get("messages", [])))

if __name__ == "__main__":
    asyncio.run(main())
