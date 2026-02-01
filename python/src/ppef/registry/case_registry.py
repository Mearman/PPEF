"""Case Registry.

Central registry for evaluation case definitions. Cases are registered
with their factories, enabling lazy loading of resources during
experiment execution.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol, TypeVar

from ppef.types.case import EvaluationCase

TInput = TypeVar("TInput")
TInputs = TypeVar("TInputs")


class CaseDefinition(Protocol[TInput, TInputs]):
    """Protocol for a case definition with metadata and resource factories."""

    @property
    def case(self) -> EvaluationCase: ...

    async def get_input(self) -> TInput: ...

    def get_inputs(self) -> TInputs: ...


@dataclass(frozen=True)
class CaseDefinitionEntry[TInput, TInputs]:
    """A concrete case definition entry stored in the registry."""

    case: EvaluationCase
    _get_input: object  # Callable[[], Awaitable[TInput]]
    _get_inputs: object  # Callable[[], TInputs]

    async def get_input(self) -> TInput:
        """Load the input resource for this case."""
        from collections.abc import Awaitable

        fn = self._get_input
        if callable(fn):
            result = fn()
            if isinstance(result, Awaitable):
                return await result
            return result  # type: ignore[return-value]
        raise TypeError("get_input is not callable")

    def get_inputs(self) -> TInputs:
        """Get the algorithm inputs for this case."""
        fn = self._get_inputs
        if callable(fn):
            return fn()  # type: ignore[return-value]
        raise TypeError("get_inputs is not callable")


class CaseRegistry[TInput, TInputs]:
    """Registry for evaluation case definitions.

    Type Parameters:
        TInput: The resource type (e.g., Graph, Dataset).
        TInputs: The algorithm inputs type.
    """

    def __init__(self) -> None:
        self._definitions: dict[str, CaseDefinition[TInput, TInputs]] = {}

    def register(
        self,
        definition: CaseDefinition[TInput, TInputs],
    ) -> CaseRegistry[TInput, TInputs]:
        """Register a new case.

        Args:
            definition: Case definition including metadata and factories.

        Returns:
            Self for method chaining.

        Raises:
            ValueError: If a case with the same ID is already registered.
        """
        case_id = definition.case.case_id
        if case_id in self._definitions:
            raise ValueError(f"Case already registered: {case_id}")

        self._definitions[case_id] = definition
        return self

    def register_all(
        self,
        definitions: list[CaseDefinition[TInput, TInputs]],
    ) -> CaseRegistry[TInput, TInputs]:
        """Register multiple cases at once.

        Args:
            definitions: List of case definitions.

        Returns:
            Self for method chaining.
        """
        for definition in definitions:
            self.register(definition)
        return self

    def get(self, case_id: str) -> CaseDefinition[TInput, TInputs] | None:
        """Get a case definition by ID.

        Args:
            case_id: Case identifier.

        Returns:
            Case definition or None if not found.
        """
        return self._definitions.get(case_id)

    def get_or_raise(self, case_id: str) -> CaseDefinition[TInput, TInputs]:
        """Get a case definition by ID, raising if not found.

        Args:
            case_id: Case identifier.

        Returns:
            Case definition.

        Raises:
            KeyError: If the case is not found.
        """
        definition = self._definitions.get(case_id)
        if definition is None:
            raise KeyError(f"Case not found: {case_id}")
        return definition

    def get_by_class(self, case_class: str) -> list[CaseDefinition[TInput, TInputs]]:
        """Get all cases with a specific class.

        Args:
            case_class: Class to filter by.

        Returns:
            List of matching case definitions.
        """
        return [d for d in self._definitions.values() if d.case.case_class == case_class]

    def get_by_tag(self, tag: str) -> list[CaseDefinition[TInput, TInputs]]:
        """Get all cases with a specific tag.

        Args:
            tag: Tag to filter by.

        Returns:
            List of matching case definitions.
        """
        return [
            d for d in self._definitions.values() if d.case.tags is not None and tag in d.case.tags
        ]

    def list_all(self) -> list[str]:
        """List all registered case IDs.

        Returns:
            List of case identifiers.
        """
        return list(self._definitions.keys())

    def list_cases(self) -> list[EvaluationCase]:
        """List all registered case specifications.

        Returns:
            List of case specifications.
        """
        return [d.case for d in self._definitions.values()]

    def list_classes(self) -> list[str]:
        """List all unique case classes.

        Returns:
            List of case class names.
        """
        classes: set[str] = set()
        for definition in self._definitions.values():
            if definition.case.case_class is not None:
                classes.add(definition.case.case_class)
        return sorted(classes)

    def has(self, case_id: str) -> bool:
        """Check if a case is registered.

        Args:
            case_id: Case identifier.

        Returns:
            True if registered.
        """
        return case_id in self._definitions

    @property
    def size(self) -> int:
        """Get the number of registered cases."""
        return len(self._definitions)

    def clear(self) -> None:
        """Clear all registrations."""
        self._definitions.clear()

    async def get_input(self, case_id: str) -> TInput:
        """Load the input resource for a case.

        Args:
            case_id: Case identifier.

        Returns:
            The input resource.
        """
        definition = self.get_or_raise(case_id)
        return await definition.get_input()

    def get_inputs(self, case_id: str) -> TInputs:
        """Get the algorithm inputs for a case.

        Args:
            case_id: Case identifier.

        Returns:
            Algorithm inputs.
        """
        definition = self.get_or_raise(case_id)
        return definition.get_inputs()


case_registry: CaseRegistry[object, object] = CaseRegistry()
"""Global case registry instance.

Use this for standard registration, or create instances for isolation.
"""
