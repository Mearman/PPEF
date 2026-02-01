"""Perturbation type definitions."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from .case import Primitive

type PerturbationType = Literal[
    "edge-removal",
    "edge-addition",
    "seed-shift",
    "node-removal",
    "degree-rewiring",
    "weight-noise",
]


class PerturbationConfig(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    type: PerturbationType
    intensity: float
    seed: int | None = None
    params: dict[str, Primitive] | None = None


class DegradationPoint(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    perturbation_level: float = Field(alias="perturbationLevel")
    metric_value: float = Field(alias="metricValue")
    std_dev: float | None = Field(default=None, alias="stdDev")


class RobustnessMetrics(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    variance_under_perturbation: float = Field(alias="varianceUnderPerturbation")
    std_under_perturbation: float = Field(alias="stdUnderPerturbation")
    coefficient_of_variation: float = Field(alias="coefficientOfVariation")
    ranking_stability: float | None = Field(default=None, alias="rankingStability")
    degradation_curve: list[DegradationPoint] | None = Field(default=None, alias="degradationCurve")
    breakpoint: float | None = None


class RobustnessAnalysisResult(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    sut: str
    case_class: str | None = Field(default=None, alias="caseClass")
    perturbation: str
    metric: str
    robustness: RobustnessMetrics
    baseline_value: float = Field(alias="baselineValue")
    run_count: int = Field(alias="runCount")


class RobustnessAnalysisOutput(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    version: str
    timestamp: str
    results: list[RobustnessAnalysisResult]
    config: dict[str, object]
