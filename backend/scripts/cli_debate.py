"""
Step 3.1 — CLI validation script.
Runs a complete debate (proposer → fact_check → opposer → fact_check → judge)
from the command line to verify the LangGraph graph works before
connecting it to the frontend.

Usage:
    python cli_debate.py "人工智能是否会取代大部分人类的工作" --turns 2
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

# Ensure the backend root is on sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.agents.graph import compile_debate_graph, DebateGraphState
from app.config import get_settings


_DIM_LABELS = {
    "logical_rigor": "逻辑严密度",
    "evidence_quality": "证据质量",
    "rebuttal_strength": "反驳力度",
    "consistency": "前后自洽",
    "persuasiveness": "说服力",
}


def _print_header(text: str):
    width = 70
    print("\n" + "=" * width)
    print(f"  {text}")
    print("=" * width)


def _print_speech(role: str, content: str, citations: list[str]):
    role_icons = {"proposer": "🔵 正方", "opposer": "🔴 反方"}
    label = role_icons.get(role, role)
    print(f"\n{'─' * 60}")
    print(f"  {label}")
    print(f"{'─' * 60}")
    print(content)
    if citations:
        print(f"\n  📎 引用: {', '.join(citations)}")


def _print_fact_check(results: list[dict]):
    print(f"\n  🔍 事实核查结果 ({len(results)} 条)")
    for r in results[:5]:
        title = r.get("title", "")
        url = r.get("url", "")
        snippet = r.get("snippet", "")[:100]
        print(f"    • {title}")
        print(f"      {url}")
        if snippet:
            print(f"      {snippet}...")


def _print_scores(scores: dict):
    for role, score_data in scores.items():
        role_icons = {"proposer": "🔵 正方", "opposer": "🔴 反方"}
        label = role_icons.get(role, role)
        print(f"\n  📊 {label} 评分:")

        if not isinstance(score_data, dict):
            print(f"    (无评分数据)")
            continue

        total = 0
        count = 0
        for dim_key, dim_label in _DIM_LABELS.items():
            dim = score_data.get(dim_key, {})
            if isinstance(dim, dict):
                s = dim.get("score", "?")
                r = dim.get("rationale", "")
                print(f"    {dim_label}: {s}/10 — {r[:60]}")
                if isinstance(s, int):
                    total += s
                    count += 1

        if count:
            print(f"    ──────────────────")
            print(f"    平均分: {total / count:.1f}/10")

        comment = score_data.get("overall_comment", "")
        if comment:
            print(f"    💬 评语: {comment[:80]}")


async def run_cli_debate(topic: str, max_turns: int):
    """Run a debate via the LangGraph graph and print results."""

    _print_header(f"Elenchus CLI Debate — {topic}")
    print(f"  轮次: {max_turns}  |  参与者: 正方 vs 反方")

    settings = get_settings()
    print(f"  辩手模型: {settings.debater.model}")
    print(f"  裁判模型: {settings.judge.model}")
    print(f"  核查模型: {settings.fact_checker.model}")
    print(f"  搜索后端: {settings.search.provider}")

    # Build initial state
    initial_state: DebateGraphState = {
        "session_id": "cli-test",
        "topic": topic,
        "participants": ["proposer", "opposer"],
        "current_turn": 0,
        "max_turns": max_turns,
        "current_speaker": "",
        "current_speaker_index": 0,
        "dialogue_history": [],
        "context_summary": "",
        "search_context": [],
        "current_scores": {},
        "cumulative_scores": {},
        "status": "in_progress",
        "error": None,
    }

    # Compile and run the graph
    app = compile_debate_graph()

    _print_header("辩论开始")

    last_turn = -1

    async for event in app.astream(initial_state, stream_mode="updates"):
        for node_name, node_output in event.items():
            if not isinstance(node_output, dict):
                continue

            # Detect turn change
            new_turn = node_output.get("current_turn")
            if new_turn is not None and new_turn != last_turn:
                last_turn = new_turn

            # Print based on node type
            if node_name in ("proposer_speaks", "opposer_speaks"):
                entries = node_output.get("dialogue_history", [])
                for entry in entries:
                    _print_speech(
                        entry.get("role", ""),
                        entry.get("content", ""),
                        entry.get("citations", []),
                    )

            elif node_name in ("fact_check_proposer", "fact_check_opposer"):
                results = node_output.get("search_context", [])
                _print_fact_check(results)

            elif node_name == "judge":
                scores = node_output.get("current_scores", {})
                _print_scores(scores)

            elif node_name == "advance_turn":
                turn = node_output.get("current_turn", 0)
                _print_header(f"第 {turn} 轮结束")

    _print_header("辩论完成")
    print("\n✅ LangGraph 辩论图运行成功！所有节点均正常工作。\n")


def main():
    parser = argparse.ArgumentParser(description="Elenchus CLI Debate")
    parser.add_argument(
        "topic",
        nargs="?",
        default="人工智能是否会在未来十年内取代大部分白领工作",
        help="The debate topic",
    )
    parser.add_argument(
        "--turns", "-t",
        type=int,
        default=1,
        help="Number of debate turns (default: 1, for quick validation)",
    )
    args = parser.parse_args()

    asyncio.run(run_cli_debate(args.topic, args.turns))


if __name__ == "__main__":
    main()
