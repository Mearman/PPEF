"""System Under Test (SUT) type definitions."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

type SutRole = Literal["primary", "baseline", "oracle"]


class SutRegistration(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    name: str
    version: str
    role: SutRole
    config: dict[str, object] = Field(default_factory=dict)
    tags: list[str] = Field(default_factory=list)
    description: str | None = None
