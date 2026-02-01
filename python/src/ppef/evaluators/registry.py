"""Evaluator Registry.

Central registry for all evaluator types. Enables the plugin
architecture by allowing custom evaluators to be registered
alongside built-in evaluators.
"""

from __future__ import annotations

import warnings
from typing import Any, ClassVar, Protocol, runtime_checkable

from ppef.types.evaluator import EvaluationType, ValidationResult


@runtime_checkable
class Evaluator(Protocol):
    """Protocol for all evaluators."""

    @property
    def type(self) -> EvaluationType: ...

    def validate_config(self, config: Any) -> ValidationResult: ...

    def evaluate(self, config: Any, input_data: Any) -> dict[str, Any]: ...

    def summarize(self, output: dict[str, Any]) -> dict[str, Any]: ...


class EvaluatorRegistry:
    """Registry of all available evaluators.

    Evaluators are stored by their type identifier. The registry
    provides methods to register new evaluators, retrieve evaluators
    by type, and list all registered types.
    """

    _evaluators: ClassVar[dict[EvaluationType, Evaluator]] = {}

    @classmethod
    def register(cls, evaluator: Evaluator) -> None:
        """Register an evaluator.

        If an evaluator with the same type already exists, it will
        be replaced with the new evaluator.
        """
        if evaluator.type in cls._evaluators:
            warnings.warn(
                f"Replacing existing evaluator for type: {evaluator.type}",
                stacklevel=2,
            )
        cls._evaluators[evaluator.type] = evaluator

    @classmethod
    def get(cls, evaluation_type: EvaluationType) -> Evaluator | None:
        """Get an evaluator by type.

        Returns the evaluator instance or ``None`` if not found.
        """
        return cls._evaluators.get(evaluation_type)

    @classmethod
    def get_as[T](cls, evaluation_type: EvaluationType, clazz: type[T]) -> T | None:
        """Get an evaluator by type with runtime type checking.

        Returns ``None`` if the evaluator does not exist or is not
        an instance of *clazz*.
        """
        evaluator = cls._evaluators.get(evaluation_type)
        return evaluator if isinstance(evaluator, clazz) else None

    @classmethod
    def get_or_throw[T](cls, evaluation_type: EvaluationType, clazz: type[T]) -> T:
        """Get an evaluator by type, raising if not found.

        Raises :class:`KeyError` if the type is not registered or
        the evaluator is not an instance of *clazz*.
        """
        evaluator = cls.get_as(evaluation_type, clazz)
        if evaluator is None:
            msg = f"Evaluator not found for type: {evaluation_type}"
            raise KeyError(msg)
        return evaluator

    @classmethod
    def types(cls) -> list[EvaluationType]:
        """List all registered evaluator types."""
        return list(cls._evaluators.keys())

    @classmethod
    def has(cls, evaluation_type: EvaluationType) -> bool:
        """Check if an evaluator type is registered."""
        return evaluation_type in cls._evaluators

    @classmethod
    def unregister(cls, evaluation_type: EvaluationType) -> bool:
        """Unregister an evaluator by type.

        Primarily useful for testing.  Returns ``True`` if the
        evaluator was removed.
        """
        if evaluation_type in cls._evaluators:
            del cls._evaluators[evaluation_type]
            return True
        return False

    @classmethod
    def clear(cls) -> None:
        """Clear all registered evaluators.

        Primarily useful for testing.
        """
        cls._evaluators.clear()

    @classmethod
    def size(cls) -> int:
        """Get the number of registered evaluators."""
        return len(cls._evaluators)


def register_built_in_evaluators() -> None:
    """Register the four built-in evaluators.

    Called automatically when this module is first imported so that
    the standard evaluators are always available.
    """
    from ppef.evaluators.claims import ClaimsEvaluator
    from ppef.evaluators.exploratory import ExploratoryEvaluator
    from ppef.evaluators.metrics import MetricsEvaluator
    from ppef.evaluators.robustness import RobustnessEvaluator

    EvaluatorRegistry.register(ClaimsEvaluator())
    EvaluatorRegistry.register(RobustnessEvaluator())
    EvaluatorRegistry.register(MetricsEvaluator())
    EvaluatorRegistry.register(ExploratoryEvaluator())


# Auto-register built-in evaluators on module load.
register_built_in_evaluators()
