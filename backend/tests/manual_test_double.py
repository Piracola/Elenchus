"""
Manual test script for double debate runner.

Run with: python -m tests.manual_test_double
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.agents.runner import run_debate

async def main():
    print("Starting debate...")
    state = await run_debate(
        session_id="test_session_2",
        topic="Is the sky blue?",
        max_turns=1
    )
    
    history = state.get("dialogue_history", [])
    print(f"\nTotal history length: {len(history)}\n")
    for i, entry in enumerate(history):
        print(f"[{i}] {entry.get('role')} - {entry.get('content')[:50]}...")

if __name__ == "__main__":
    asyncio.run(main())
