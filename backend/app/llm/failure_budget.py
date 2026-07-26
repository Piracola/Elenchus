"""Run-scoped failure budget shared by every model invocation path.

Node-level retries (debater 3x, judge 2x, ...) multiply with the transport
retries inside ``invoke_chat_model``. Without a run-level ceiling a single
unhealthy provider can burn dozens of calls and hours of wall-clock. The budget
is stored in a ContextVar so it propagates into every task spawned by the run
(including ``asyncio.gather`` fan-outs) without threading a parameter through
each agent.
"""

from __future__ import annotations

import logging
from contextvars import ContextVar
from dataclasses import dataclass, field

from app.constants import (
    DEFAULT_MAX_RUN_DURATION_MINUTES,
    DEFAULT_MAX_TOTAL_BACKOFF_SECONDS,
    DEFAULT_MAX_TOTAL_FAILURES,
    DEFAULT_RETRY_AFTER_CLAMP_SECONDS,
)

logger = logging.getLogger(__name__)


class FailureBudgetExhausted(RuntimeError):
    """Raised when a run has spent its allowance for model failures."""

    def __init__(self, dimension: str, message: str, last_error: BaseException | None = None) -> None:
        super().__init__(message)
        self.dimension = dimension
        self.last_error = last_error


@dataclass
class RunFailureBudget:
    """Mutable per-run accounting shared across concurrent agent tasks."""

    max_total_failures: int = DEFAULT_MAX_TOTAL_FAILURES
    retry_after_clamp_seconds: int = DEFAULT_RETRY_AFTER_CLAMP_SECONDS
    max_total_backoff_seconds: int = DEFAULT_MAX_TOTAL_BACKOFF_SECONDS
    max_run_duration_minutes: int = DEFAULT_MAX_RUN_DURATION_MINUTES

    total_failures: int = field(default=0, init=False)
    total_backoff_seconds: float = field(default=0.0, init=False)

    def clamp_delay(self, delay_seconds: float) -> float:
        return max(0.0, min(float(delay_seconds), float(self.retry_after_clamp_seconds)))

    def record_backoff(self, delay_seconds: float, last_error: BaseException | None = None) -> None:
        self.total_backoff_seconds += delay_seconds
        if self.total_backoff_seconds > self.max_total_backoff_seconds:
            raise FailureBudgetExhausted(
                "backoff",
                (
                    f"模型重试等待已累计超过 {self.max_total_backoff_seconds} 秒，"
                    "运行已暂停，可稍后手动恢复。"
                ),
                last_error,
            )

    def record_failure(self, last_error: BaseException | None = None) -> None:
        self.total_failures += 1
        if self.total_failures > self.max_total_failures:
            raise FailureBudgetExhausted(
                "failures",
                (
                    f"模型调用连续失败已达 {self.max_total_failures} 次，"
                    "运行已暂停，可稍后手动恢复。"
                ),
                last_error,
            )


_BUDGET: ContextVar[RunFailureBudget | None] = ContextVar("elenchus_failure_budget", default=None)


def get_failure_budget() -> RunFailureBudget | None:
    return _BUDGET.get()


def set_failure_budget(budget: RunFailureBudget | None):
    """Install the budget for the current context; returns the reset token."""
    return _BUDGET.set(budget)


def reset_failure_budget(token) -> None:
    _BUDGET.reset(token)


def clamp_retry_delay(delay_seconds: float) -> float:
    """Clamp a provider-advised delay even when no budget is installed."""
    budget = _BUDGET.get()
    if budget is None:
        return max(0.0, min(float(delay_seconds), float(DEFAULT_RETRY_AFTER_CLAMP_SECONDS)))
    return budget.clamp_delay(delay_seconds)


def record_backoff(delay_seconds: float, last_error: BaseException | None = None) -> None:
    budget = _BUDGET.get()
    if budget is not None:
        budget.record_backoff(delay_seconds, last_error)


def record_failure(last_error: BaseException | None = None) -> None:
    budget = _BUDGET.get()
    if budget is not None:
        budget.record_failure(last_error)


def budget_from_config(config: dict | None) -> RunFailureBudget:
    """Build a budget from the runtime `debate.failure_budget` config section."""
    section = config if isinstance(config, dict) else {}

    def _positive_int(key: str, default: int, minimum: int, maximum: int) -> int:
        try:
            value = int(section.get(key, default))
        except (TypeError, ValueError):
            return default
        return max(minimum, min(maximum, value))

    return RunFailureBudget(
        max_total_failures=_positive_int("max_total_failures", DEFAULT_MAX_TOTAL_FAILURES, 1, 200),
        retry_after_clamp_seconds=_positive_int(
            "retry_after_clamp_seconds", DEFAULT_RETRY_AFTER_CLAMP_SECONDS, 1, 600
        ),
        max_total_backoff_seconds=_positive_int(
            "max_total_backoff_seconds", DEFAULT_MAX_TOTAL_BACKOFF_SECONDS, 5, 7200
        ),
        max_run_duration_minutes=_positive_int(
            "max_run_duration_minutes", DEFAULT_MAX_RUN_DURATION_MINUTES, 1, 1440
        ),
    )
