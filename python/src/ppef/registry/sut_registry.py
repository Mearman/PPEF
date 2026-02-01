"""SUT Registry.

Central registry for System Under Test definitions. SUTs are registered
with their factories and metadata, enabling lazy instantiation during
experiment execution.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol, TypeVar

from ppef.types.sut import SutRegistration, SutRole

TInputs = TypeVar("TInputs")
TResult = TypeVar("TResult")


class SUT(Protocol[TInputs, TResult]):
    """Protocol for a System Under Test instance."""

    @property
    def id(self) -> str: ...

    @property
    def config(self) -> dict[str, object]: ...

    async def run(self, inputs: TInputs) -> TResult: ...


class SutFactory(Protocol[TInputs, TResult]):
    """Protocol for a SUT factory callable."""

    def __call__(self, config: dict[str, object] | None = None) -> SUT[TInputs, TResult]: ...


@dataclass(frozen=True)
class SutDefinition[TInputs, TResult]:
    """A registered SUT definition pairing metadata with a factory."""

    registration: SutRegistration
    factory: SutFactory[TInputs, TResult]


class SUTRegistry[TInputs, TResult]:
    """Registry for System Under Test definitions.

    Type Parameters:
        TInputs: The algorithm inputs type.
        TResult: The algorithm result type.
    """

    def __init__(self) -> None:
        self._definitions: dict[str, SutDefinition[TInputs, TResult]] = {}

    def register(
        self,
        registration: SutRegistration,
        factory: SutFactory[TInputs, TResult],
    ) -> SUTRegistry[TInputs, TResult]:
        """Register a new SUT.

        Args:
            registration: SUT metadata.
            factory: Factory for creating SUT instances.

        Returns:
            Self for method chaining.

        Raises:
            ValueError: If a SUT with the same ID is already registered.
        """
        if registration.id in self._definitions:
            raise ValueError(f"SUT already registered: {registration.id}")

        self._definitions[registration.id] = SutDefinition(
            registration=registration,
            factory=factory,
        )
        return self

    def get(self, id: str) -> SutDefinition[TInputs, TResult] | None:
        """Get a SUT definition by ID.

        Args:
            id: SUT identifier.

        Returns:
            SUT definition or None if not found.
        """
        return self._definitions.get(id)

    def get_or_raise(self, id: str) -> SutDefinition[TInputs, TResult]:
        """Get a SUT definition by ID, raising if not found.

        Args:
            id: SUT identifier.

        Returns:
            SUT definition.

        Raises:
            KeyError: If the SUT is not found.
        """
        definition = self._definitions.get(id)
        if definition is None:
            raise KeyError(f"SUT not found: {id}")
        return definition

    def get_by_role(self, role: SutRole) -> list[SutDefinition[TInputs, TResult]]:
        """Get all SUTs with a specific role.

        Args:
            role: Role to filter by.

        Returns:
            List of matching SUT definitions.
        """
        return [d for d in self._definitions.values() if d.registration.role == role]

    def get_by_tag(self, tag: str) -> list[SutDefinition[TInputs, TResult]]:
        """Get all SUTs with a specific tag.

        Args:
            tag: Tag to filter by.

        Returns:
            List of matching SUT definitions.
        """
        return [d for d in self._definitions.values() if tag in d.registration.tags]

    def list_all(self) -> list[str]:
        """List all registered SUT IDs.

        Returns:
            List of SUT identifiers.
        """
        return list(self._definitions.keys())

    def list_registrations(self) -> list[SutRegistration]:
        """List all registered SUT registrations.

        Returns:
            List of SUT registrations.
        """
        return [d.registration for d in self._definitions.values()]

    def has(self, id: str) -> bool:
        """Check if a SUT is registered.

        Args:
            id: SUT identifier.

        Returns:
            True if registered.
        """
        return id in self._definitions

    @property
    def size(self) -> int:
        """Get the number of registered SUTs."""
        return len(self._definitions)

    def clear(self) -> None:
        """Clear all registrations."""
        self._definitions.clear()

    def create(
        self,
        id: str,
        config: dict[str, object] | None = None,
    ) -> SUT[TInputs, TResult]:
        """Create a new SUT instance.

        Args:
            id: SUT identifier.
            config: Optional configuration overrides.

        Returns:
            SUT instance ready for execution.
        """
        definition = self.get_or_raise(id)
        return definition.factory(config)


sut_registry: SUTRegistry[object, object] = SUTRegistry()
"""Global SUT registry instance.

Use this for standard registration, or create instances for isolation.
"""
