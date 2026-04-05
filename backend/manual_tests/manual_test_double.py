"""
Manual test script for double debate runner.

Run with: python backend/manual_tests/manual_test_double.py
"""
from scripts.test_utils import setup_backend_path, run_async

from app.agents.runner import run_debate


async def main():
    print("Starting debate...")
    state = await run_debate(
        session_id="test_session_2",
        topic="Is the sky blue?",
        max_turns=1,
    )

    history = state.get("dialogue_history", [])
    print(f"\nTotal history length: {len(history)}\n")
    for i, entry in enumerate(history):
        print(f"[{i}] {entry.get('role')} - {entry.get('content')[:50]}...")


if __name__ == "__main__":
    setup_backend_path()
    run_async(main)
