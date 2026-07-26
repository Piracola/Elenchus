from __future__ import annotations

import asyncio

import pytest

from app.llm import invoke as invoke_module
from app.llm.failure_budget import (
    FailureBudgetExhausted,
    RunFailureBudget,
    budget_from_config,
    clamp_retry_delay,
    reset_failure_budget,
    set_failure_budget,
)


@pytest.fixture
def budget():
    installed = RunFailureBudget(
        max_total_failures=3,
        retry_after_clamp_seconds=30,
        max_total_backoff_seconds=50,
    )
    token = set_failure_budget(installed)
    yield installed
    reset_failure_budget(token)


def test_clamp_retry_delay_respects_budget(budget):
    assert clamp_retry_delay(3600) == 30
    assert clamp_retry_delay(5) == 5


def test_clamp_retry_delay_without_budget_uses_default_cap():
    # No budget installed: a hostile retry_after still cannot stall for hours.
    assert clamp_retry_delay(86400) == 120


def test_record_failure_raises_after_allowance(budget):
    for _ in range(budget.max_total_failures):
        budget.record_failure()
    with pytest.raises(FailureBudgetExhausted) as excinfo:
        budget.record_failure()
    assert excinfo.value.dimension == "failures"


def test_record_backoff_raises_after_total_wait(budget):
    budget.record_backoff(30)
    with pytest.raises(FailureBudgetExhausted) as excinfo:
        budget.record_backoff(30)
    assert excinfo.value.dimension == "backoff"


@pytest.mark.asyncio
async def test_sleep_before_retry_clamps_provider_delay(budget, monkeypatch):
    slept: list[float] = []

    async def fake_sleep(seconds):
        slept.append(seconds)

    monkeypatch.setattr(invoke_module.asyncio, "sleep", fake_sleep)
    exc = RuntimeError("Error code: 429 - {'retry_after': 3600}")

    await invoke_module._sleep_before_retry(exc, 0)

    assert slept == [30]
    assert budget.total_backoff_seconds == 30


@pytest.mark.asyncio
async def test_budget_is_shared_across_gathered_tasks(budget):
    async def fail_once():
        budget.record_failure()

    await asyncio.gather(fail_once(), fail_once())
    assert budget.total_failures == 2


def test_budget_from_config_clamps_out_of_range_values():
    parsed = budget_from_config(
        {
            "max_total_failures": 0,
            "retry_after_clamp_seconds": 99999,
            "max_total_backoff_seconds": "not-a-number",
            "max_run_duration_minutes": 30,
        }
    )
    assert parsed.max_total_failures == 1
    assert parsed.retry_after_clamp_seconds == 600
    assert parsed.max_total_backoff_seconds == 600
    assert parsed.max_run_duration_minutes == 30


def test_budget_from_config_defaults_on_empty_section():
    parsed = budget_from_config(None)
    assert parsed.max_total_failures == 12
    assert parsed.retry_after_clamp_seconds == 120
