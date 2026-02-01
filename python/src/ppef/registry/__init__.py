"""Registry module.

Central registries for evaluation cases and systems under test.
"""

from __future__ import annotations

from .case_registry import (
    CaseDefinition,
    CaseDefinitionEntry,
    CaseRegistry,
    case_registry,
)
from .sut_registry import (
    SUT,
    SutDefinition,
    SutFactory,
    SUTRegistry,
    sut_registry,
)

__all__ = [
    "SUT",
    "CaseDefinition",
    "CaseDefinitionEntry",
    "CaseRegistry",
    "SUTRegistry",
    "SutDefinition",
    "SutFactory",
    "case_registry",
    "sut_registry",
]
