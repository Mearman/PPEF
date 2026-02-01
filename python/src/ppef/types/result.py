"""Evaluation result type definitions."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from .case import Primitive
from .sut import SutRole

type FailureType = Literal[
    "no_output",
    "invalid_structure",
    "constraint_violation",
    "exception",
    "oracle_mismatch",
    "timeout",
]


class RunContext(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    run_id: str = Field(alias="runId")
    sut: str
    sut_role: SutRole = Field(alias="sutRole")
    sut_version: str | None = Field(default=None, alias="sutVersion")
    case_id: str = Field(alias="caseId")
    case_class: str | None = Field(default=None, alias="caseClass")
    config: dict[str, Primitive] | None = None
    seed: int | None = None
    repetition: int | None = None


class CorrectnessResult(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    expected_exists: bool = Field(alias="expectedExists")
    produced_output: bool = Field(alias="producedOutput")
    valid: bool
    matches_expected: bool | None = Field(alias="matchesExpected")
    failure_type: FailureType | None = Field(default=None, alias="failureType")
    notes: list[str] | None = None


class RankedItem(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    item_id: str = Field(alias="itemId")
    score: float
    metadata: dict[str, Primitive] | None = None


class ArtefactReference(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    type: str
    uri: str
    hash: str | None = None
    metadata: dict[str, Primitive] | None = None


class ResultOutputs(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    summary: dict[str, Primitive | list[Primitive]] | None = None
    labels: dict[str, Primitive] | None = None
    ranking: list[RankedItem] | None = None
    artefacts: list[ArtefactReference] | None = None
    extra: dict[str, object] | None = None


class ResultMetrics(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    numeric: dict[str, float]
    extra: dict[str, float] | None = None


class Provenance(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    runtime: dict[str, str]
    git_commit: str | None = Field(default=None, alias="gitCommit")
    dirty: bool | None = None
    dependency_lock_hash: str | None = Field(default=None, alias="dependencyLockHash")
    parent_run_ids: list[str] | None = Field(default=None, alias="parentRunIds")
    timestamp: str | None = None
    execution_time_ms: float | None = Field(default=None, alias="executionTimeMs")
    peak_memory_bytes: int | None = Field(default=None, alias="peakMemoryBytes")
    final_memory_bytes: int | None = Field(default=None, alias="finalMemoryBytes")


class EvaluationResult(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    run: RunContext
    correctness: CorrectnessResult
    outputs: ResultOutputs
    metrics: ResultMetrics
    provenance: Provenance
    error: str | None = None


class ResultBatch(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    version: str
    timestamp: str
    results: list[EvaluationResult]
    metadata: dict[str, Primitive] | None = None
