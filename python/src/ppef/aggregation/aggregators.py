"""Aggregation functions.

Pure functions for computing aggregated statistics from evaluation results.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any

from ppef.statistical.mann_whitney import mann_whitney_u_test


@dataclass
class SummaryStatsResult:
    """Summary statistics for a numeric array."""

    n: int
    mean: float
    median: float
    min: float
    max: float
    std: float | None = None
    confidence95: tuple[float, float] | None = None
    sum: float | None = None
    p25: float | None = None
    p75: float | None = None


# Simplified t-table for 95% CI (probability = 0.975)
_T_TABLE: dict[int, float] = {
    1: 12.706,
    2: 4.303,
    3: 3.182,
    4: 2.776,
    5: 2.571,
    6: 2.447,
    7: 2.365,
    8: 2.306,
    9: 2.262,
    10: 2.228,
    15: 2.131,
    20: 2.086,
    25: 2.06,
    30: 2.042,
    40: 2.021,
    50: 2.009,
    100: 1.984,
}


def get_t_value(df: int, probability: float = 0.975) -> float:
    """Get t-value for confidence interval calculation.

    Simplified lookup table for common degrees of freedom.
    """
    if probability != 0.975:
        return 1.96  # Fall back to z-value

    dfs = sorted(_T_TABLE.keys())
    for key in dfs:
        if df <= key:
            return _T_TABLE[key]

    # Large sample: use z-value
    return 1.96


def compute_summary_stats(values: list[float]) -> SummaryStatsResult:
    """Compute summary statistics for an array of numbers."""
    if len(values) == 0:
        return SummaryStatsResult(
            n=0,
            mean=float("nan"),
            median=float("nan"),
            min=float("nan"),
            max=float("nan"),
        )

    n = len(values)
    sorted_values = sorted(values)
    total = sum(values)
    mean = total / n
    min_val = sorted_values[0]
    max_val = sorted_values[n - 1]

    # Median
    mid_index = n // 2
    if n % 2 == 0:
        median = (sorted_values[mid_index - 1] + sorted_values[mid_index]) / 2
    else:
        median = sorted_values[mid_index]

    # Standard deviation (sample)
    std: float | None = None
    if n > 1:
        squared_diffs = [(v - mean) ** 2 for v in values]
        variance = sum(squared_diffs) / (n - 1)
        std = math.sqrt(variance)

    # 95% confidence interval
    confidence95: tuple[float, float] | None = None
    if std is not None and n > 1:
        standard_error = std / math.sqrt(n)
        t_value = get_t_value(n - 1, 0.975)
        margin = t_value * standard_error
        confidence95 = (mean - margin, mean + margin)

    # Percentiles
    p25 = sorted_values[math.floor(n * 0.25)]
    p75 = sorted_values[math.floor(n * 0.75)]

    return SummaryStatsResult(
        n=n,
        mean=mean,
        median=median,
        min=min_val,
        max=max_val,
        std=std,
        confidence95=confidence95,
        sum=total,
        p25=p25,
        p75=p75,
    )


def compute_speedup(baseline_time: float, treatment_time: float) -> float:
    """Compute speedup ratio (baseline / treatment)."""
    if treatment_time == 0:
        return float("inf")
    return baseline_time / treatment_time


def compute_max_speedup(pairs: list[tuple[float, float]]) -> float:
    """Compute maximum speedup from multiple pairs."""
    if len(pairs) == 0:
        return 0
    return max(compute_speedup(b, t) for b, t in pairs)


def compute_comparison(
    primary_results: list[dict[str, Any]],
    baseline_results: list[dict[str, Any]],
    metric_name: str,
) -> dict[str, Any]:
    """Compute comparison metrics between primary and baseline results.

    Results are dicts with at minimum: run.caseId and metrics.numeric[metric_name]
    """
    # Extract values and match by case ID
    primary_by_case: dict[str, float | None] = {}
    baseline_by_case: dict[str, float | None] = {}

    for result in primary_results:
        metrics: dict[str, Any] = result.get("metrics", {})
        numeric: dict[str, Any] = metrics.get("numeric", {})
        value: float | None = numeric.get(metric_name)
        run: dict[str, Any] = result["run"]
        primary_by_case[run["caseId"]] = value

    for result in baseline_results:
        metrics_b: dict[str, Any] = result.get("metrics", {})
        numeric_b: dict[str, Any] = metrics_b.get("numeric", {})
        value_b: float | None = numeric_b.get(metric_name)
        run_b: dict[str, Any] = result["run"]
        baseline_by_case[run_b["caseId"]] = value_b

    # Get matching case IDs
    common_case_ids = [cid for cid in primary_by_case if cid in baseline_by_case]

    if not common_case_ids:
        return {"deltas": {"default": 0}, "ratios": {"default": 1}}

    # Extract paired values
    primary_values: list[float] = []
    baseline_values: list[float] = []
    for case_id in common_case_ids:
        pv = primary_by_case.get(case_id)
        bv = baseline_by_case.get(case_id)
        if pv is not None and bv is not None:
            primary_values.append(pv)
            baseline_values.append(bv)

    primary_stats = compute_summary_stats(primary_values)
    baseline_stats = compute_summary_stats(baseline_values)

    delta = primary_stats.mean - baseline_stats.mean
    ratio = float("inf") if baseline_stats.mean == 0 else primary_stats.mean / baseline_stats.mean

    # Win rate
    wins = sum(1 for i, pv in enumerate(primary_values) if pv > baseline_values[i])
    better_rate = wins / len(primary_values)

    # Mann-Whitney U test
    mwu_result = mann_whitney_u_test(primary_values, baseline_values)

    # Effect size (Cohen's d)
    effect_size: float | None = None
    if (
        primary_stats.std is not None
        and baseline_stats.std is not None
        and primary_stats.n > 1
        and baseline_stats.n > 1
    ):
        pooled_std = math.sqrt(
            (
                (primary_stats.n - 1) * primary_stats.std**2
                + (baseline_stats.n - 1) * baseline_stats.std**2
            )
            / (primary_stats.n + baseline_stats.n - 2)
        )
        effect_size = 0 if pooled_std == 0 else abs(delta) / pooled_std

    return {
        "deltas": {"default": delta},
        "ratios": {"default": ratio},
        "betterRate": better_rate,
        "uStatistic": mwu_result.u,
        "pValue": mwu_result.p_value,
        "effectSize": effect_size,
    }


def compute_rankings(
    results: list[dict[str, Any]],
    metric_name: str,
    ascending: bool = False,
) -> list[dict[str, Any]]:
    """Compute rankings from results."""
    with_values: list[dict[str, Any]] = []
    for result in results:
        metrics_r: dict[str, Any] = result.get("metrics", {})
        numeric_r: dict[str, Any] = metrics_r.get("numeric", {})
        value: float | None = numeric_r.get(metric_name)
        if value is not None and not math.isnan(value):
            with_values.append({"result": result, "value": value})

    with_values.sort(key=lambda x: float(x["value"]), reverse=not ascending)

    return [{**item, "rank": index + 1} for index, item in enumerate(with_values)]
