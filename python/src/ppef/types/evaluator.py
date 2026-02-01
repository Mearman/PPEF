"""Evaluator type definitions."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from .claims import EvaluationClaim

type EvaluationType = Literal["claims", "robustness", "metrics", "exploratory", "custom"]
type MetricDirection = Literal["higher-better", "lower-better"]
type MetricsCriterionType = Literal["threshold", "baseline", "target-range"]


class EvaluatorConfig(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: str | None = None
    description: str | None = None
    options: dict[str, Any] | None = None


class ValidationResult(BaseModel):
    valid: bool
    errors: list[str] | None = None
    warnings: list[str] | None = None


class EvaluationSummary(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    total: int
    passed: int | None = None
    failed: int | None = None
    inconclusive: int | None = None
    pass_rate: float | None = Field(default=None, alias="passRate")
    additional: dict[str, float | str] | None = None


# Claims evaluator config
class ClaimsEvaluatorConfig(EvaluatorConfig):
    claims: list[EvaluationClaim]
    significance_level: float | None = Field(default=None, alias="significanceLevel")
    min_effect_size: float | None = Field(default=None, alias="minEffectSize")


# Robustness evaluator config
class RobustnessEvaluatorConfig(EvaluatorConfig):
    metrics: list[str]
    perturbations: list[str]
    intensity_levels: list[float] | None = Field(default=None, alias="intensityLevels")
    runs_per_level: int | None = Field(default=None, alias="runsPerLevel")


# Metrics evaluator types
class MetricsCriterion(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    criterion_id: str = Field(alias="criterionId")
    description: str
    type: MetricsCriterionType
    metric: str
    sut: str
    threshold: dict[str, object] | None = None
    baseline: dict[str, object] | None = None
    target_range: dict[str, object] | None = Field(default=None, alias="targetRange")
    scope_constraints: dict[str, object] | None = Field(default=None, alias="scopeConstraints")
    tags: list[str] | None = None


class MetricsCriterionResult(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    criterion: MetricsCriterion
    status: Literal["pass", "fail", "inconclusive"]
    observed: list[dict[str, object]]
    expected: dict[str, object]
    inconclusive_reason: str | None = Field(default=None, alias="inconclusiveReason")


class MetricsEvaluationSummary(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    version: str
    timestamp: str
    results: list[MetricsCriterionResult]
    summary: dict[str, object]


class MetricsEvaluatorConfig(EvaluatorConfig):
    criteria: list[MetricsCriterion]


# Exploratory evaluator types
class SutMetricRanking(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    sut: str
    mean: float
    median: float
    std: float | None = None
    rank: int
    n: int


class PairwiseComparison(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    sut_a: str = Field(alias="sutA")
    sut_b: str = Field(alias="sutB")
    metric: str
    delta: float
    ratio: float
    p_value: float | None = Field(default=None, alias="pValue")
    effect_size: float | None = Field(default=None, alias="effectSize")
    significant: bool


class CaseClassEffect(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    case_class: str = Field(alias="caseClass")
    sut: str
    metric: str
    deviation_from_mean: float = Field(alias="deviationFromMean")
    percentage_deviation: float | None = Field(default=None, alias="percentageDeviation")
    significant: bool


class MetricCorrelation(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    metric_a: str = Field(alias="metricA")
    metric_b: str = Field(alias="metricB")
    pearson_r: float = Field(alias="pearsonR")
    spearman_rho: float | None = Field(default=None, alias="spearmanRho")
    interpretation: str


class ExploratoryEvaluatorConfig(EvaluatorConfig):
    model_config = ConfigDict(populate_by_name=True)

    metrics: list[str] | None = None
    suts: list[str] | None = None
    metric_directions: dict[str, MetricDirection] | None = Field(
        default=None, alias="metricDirections"
    )
    significance_level: float | None = Field(default=None, alias="significanceLevel")
    min_effect_size: float | None = Field(default=None, alias="minEffectSize")
    compute_correlations: bool | None = Field(default=None, alias="computeCorrelations")
    analyze_case_class_effects: bool | None = Field(default=None, alias="analyzeCaseClassEffects")


class ExploratoryEvaluationSummary(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    version: str
    timestamp: str
    rankings: dict[str, list[SutMetricRanking]]
    pairwise_comparisons: list[PairwiseComparison] = Field(alias="pairwiseComparisons")
    case_class_effects: list[CaseClassEffect] | None = Field(default=None, alias="caseClassEffects")
    metric_correlations: list[MetricCorrelation] | None = Field(
        default=None, alias="metricCorrelations"
    )
    summary: dict[str, object]
