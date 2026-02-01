"""Evaluation case type definitions."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

type Primitive = str | int | float | bool | None


class ArtefactReference(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    type: str
    uri: str
    hash: str | None = None
    metadata: dict[str, Primitive] | None = None


class CaseInputs(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    summary: dict[str, Primitive | list[Primitive]] | None = None
    artefacts: list[ArtefactReference] | None = None


class EvaluationCase(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    case_id: str = Field(alias="caseId")
    name: str | None = None
    case_class: str | None = Field(default=None, alias="caseClass")
    inputs: CaseInputs
    expected_output: dict[str, object] | None = Field(default=None, alias="expectedOutput")
    version: str | None = None
    tags: list[str] | None = None
