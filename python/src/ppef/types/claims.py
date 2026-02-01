"""Evaluation claims type definitions."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from .case import Primitive

type ValidityScope = Literal["global", "caseClass", "parameterRange", "localStructure"]
type ComparisonDirection = Literal["greater", "less", "equal"]
type ClaimStatus = Literal["satisfied", "violated", "inconclusive"]


class EvaluationClaim(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    claim_id: str = Field(alias="claimId")
    description: str
    sut: str
    baseline: str
    metric: str
    direction: ComparisonDirection
    threshold: float | None = None
    scope: ValidityScope
    scope_constraints: dict[str, Primitive | list[Primitive]] | None = Field(
        default=None, alias="scopeConstraints"
    )
    significance_level: float | None = Field(default=None, alias="significanceLevel")
    min_effect_size: float | None = Field(default=None, alias="minEffectSize")
    tags: list[str] | None = None
    citation: str | None = None


class ClaimEvidence(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    primary_value: float = Field(alias="primaryValue")
    baseline_value: float = Field(alias="baselineValue")
    delta: float
    ratio: float
    p_value: float | None = Field(default=None, alias="pValue")
    effect_size: float | None = Field(default=None, alias="effectSize")
    n: int | None = None
    delta_ci95: tuple[float, float] | None = Field(default=None, alias="deltaCI95")


class ClaimEvaluation(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    claim: EvaluationClaim
    status: ClaimStatus
    evidence: ClaimEvidence
    inconclusive_reason: str | None = Field(default=None, alias="inconclusiveReason")
    notes: list[str] | None = None


class ClaimEvaluationSummary(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    version: str
    timestamp: str
    evaluations: list[ClaimEvaluation]
    summary: dict[str, object]
