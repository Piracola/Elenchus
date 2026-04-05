"""
Manual test script for debate runner.

Run with: python backend/manual_tests/manual_test_debate.py
"""
from scripts.test_utils import setup_backend_path, run_async

from app.agents.runner import run_debate


async def main():
    print("Starting debate...")
    state = await run_debate(
        session_id="test_session",
        topic="Is AI dangerous?",
        max_turns=1,
    )
    print("Status:", state.get("status"))
    print("Error:", state.get("error"))
    print("Messages count:", len(state.get("messages", [])))


if __name__ == "__main__":
    setup_backend_path()
    run_async(main)
