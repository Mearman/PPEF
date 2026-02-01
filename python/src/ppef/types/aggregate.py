"""Aggregated result type definitions."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from .case import Primitive
from .sut import SutRole


class SummaryStats(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

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


class ComparisonMetrics(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    deltas: dict[str, float]
    ratios: dict[str, float]
    better_rate: float | None = Field(default=None, alias="betterRate")
    u_statistic: float | None = Field(default=None, alias="uStatistic")
    p_value: float | None = Field(default=None, alias="pValue")
    effect_size: float | None = Field(default=None, alias="effectSize")


class CoverageMetrics(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    case_coverage: float = Field(alias="caseCoverage")
    metric_coverage: dict[str, float] = Field(alias="metricCoverage")
    missing_cases: list[str] | None = Field(default=None, alias="missingCases")


class AggregatedResult(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    sut: str
    sut_role: SutRole = Field(alias="sutRole")
    case_class: str | None = Field(default=None, alias="caseClass")
    group: dict[str, object]
    correctness: dict[str, object]
    metrics: dict[str, SummaryStats]
    comparisons: dict[str, ComparisonMetrics] | None = None
    coverage: CoverageMetrics | None = None
    metadata: dict[str, Primitive] | None = None


class AggregationOutput(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    version: str
    timestamp: str
    aggregates: list[AggregatedResult]
    metadata: dict[str, object] | None = None
