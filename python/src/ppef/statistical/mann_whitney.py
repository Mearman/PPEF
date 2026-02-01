"""Statistical tests for comparing samples.

Mann-Whitney U test, Cohen's d effect size, confidence intervals,
and the Abramowitz & Stegun normal CDF approximation.

All algorithms match the TypeScript reference implementation exactly
to ensure cross-language conformance.
"""

from __future__ import annotations

import math
from dataclasses import dataclass


@dataclass
class MannWhitneyResult:
    """Result of a Mann-Whitney U test."""

    u: float
    p_value: float
    significant: bool


@dataclass
class ConfidenceIntervalResult:
    """Result of a confidence interval calculation."""

    lower: float
    upper: float


def normal_cdf(z: float) -> float:
    """Standard normal cumulative distribution function.

    Uses the Abramowitz and Stegun approximation.
    """
    sign = -1 if z < 0 else 1
    z = abs(z) / math.sqrt(2)
    a1 = 0.254829592
    a2 = -0.284496736
    a3 = 1.421413741
    a4 = -1.453152027
    a5 = 1.061405429
    p = 0.3275911

    t = 1 / (1 + p * z)
    y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * math.exp(-z * z)
    return 0.5 * (1 + sign * y)


def mann_whitney_u_test(sample_a: list[float], sample_b: list[float]) -> MannWhitneyResult:
    """Mann-Whitney U test for comparing two independent samples.

    Non-parametric test that does not assume normal distribution.
    """
    # Rank all values combined
    combined = sample_a + sample_b
    sorted_values = sorted(combined)

    # Assign ranks (handle ties by averaging)
    ranks: dict[float, list[int]] = {}
    for index, value in enumerate(sorted_values):
        if value not in ranks:
            ranks[value] = []
        ranks[value].append(index + 1)

    # Average rank for tied values
    avg_ranks: dict[float, float] = {}
    for value, positions in ranks.items():
        avg_ranks[value] = sum(positions) / len(positions)

    # Sum ranks for each sample
    rank_sum_a = sum(avg_ranks.get(value, 0) for value in sample_a)
    rank_sum_b = sum(avg_ranks.get(value, 0) for value in sample_b)

    # Calculate U statistics
    n1 = len(sample_a)
    n2 = len(sample_b)
    u1 = rank_sum_a - (n1 * (n1 + 1)) / 2
    u2 = rank_sum_b - (n2 * (n2 + 1)) / 2
    u = min(u1, u2)

    # Calculate z-score for large samples
    mean_u = (n1 * n2) / 2
    std_u = math.sqrt((n1 * n2 * (n1 + n2 + 1)) / 12)
    z = (u - mean_u) / std_u if std_u > 0 else 0

    # Two-tailed p-value
    p_value = 2 * (1 - normal_cdf(abs(z)))

    return MannWhitneyResult(u=u, p_value=p_value, significant=p_value < 0.05)


def cohens_d(sample_a: list[float], sample_b: list[float]) -> float:
    """Calculate Cohen's d effect size.

    Measures the standardized difference between two means.
    """
    n1 = len(sample_a)
    n2 = len(sample_b)

    mean1 = sum(sample_a) / n1
    mean2 = sum(sample_b) / n2

    var1 = sum((v - mean1) ** 2 for v in sample_a) / (n1 - 1)
    var2 = sum((v - mean2) ** 2 for v in sample_b) / (n2 - 1)

    pooled_std = math.sqrt(((n1 - 1) * var1 + (n2 - 1) * var2) / (n1 + n2 - 2))

    return abs(mean1 - mean2) / pooled_std if pooled_std > 0 else 0


def confidence_interval(values: list[float]) -> ConfidenceIntervalResult:
    """Calculate confidence interval for a mean.

    Uses z=1.96 approximation for 95% CI (large samples).
    """
    n = len(values)
    mean = sum(values) / n
    std = math.sqrt(sum((v - mean) ** 2 for v in values) / (n - 1))
    se = std / math.sqrt(n)
    t = 1.96  # Approximation for large samples (95% CI)

    margin = t * se
    return ConfidenceIntervalResult(lower=mean - margin, upper=mean + margin)
