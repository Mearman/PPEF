"""Result collector and validator.

Collects, validates, and stores evaluation results.
Provides schema-aware validation and querying capabilities.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import UTC, datetime

from pydantic import ValidationError as PydanticValidationError

from ppef.types.case import Primitive
from ppef.types.result import EvaluationResult, ResultBatch
from ppef.types.sut import SutRole


@dataclass(frozen=True)
class ValidationError:
    """Schema validation error."""

    field: str
    message: str


@dataclass(frozen=True)
class SchemaValidation:
    """Schema validation result."""

    valid: bool
    errors: list[str]


@dataclass
class ResultFilter:
    """Filter criteria for querying results."""

    sut: str | None = None
    sut_role: SutRole | None = None
    case_id: str | None = None
    case_class: str | None = None
    valid: bool | None = None
    has_metric: str | None = None
    predicate: object | None = None  # Callable[[EvaluationResult], bool] | None


class ResultCollector:
    """Result collector with schema validation and querying."""

    SCHEMA_VERSION = "1.0.0"

    def __init__(self) -> None:
        self._results: list[EvaluationResult] = []

    def record(self, result: EvaluationResult) -> None:
        """Record a single result with validation.

        Args:
            result: Result to record.

        Raises:
            ValueError: If result fails validation.
        """
        errors = self.validate(result)
        if errors:
            messages = ", ".join(f"{e.field}: {e.message}" for e in errors)
            raise ValueError(f"Invalid result: {messages}")
        self._results.append(result)

    def record_batch(self, results: list[EvaluationResult]) -> None:
        """Record multiple results.

        Args:
            results: Results to record.
        """
        for result in results:
            self.record(result)

    def validate(self, result: EvaluationResult) -> list[ValidationError]:
        """Validate a result against the schema.

        Args:
            result: Result to validate.

        Returns:
            List of validation errors (empty if valid).
        """
        errors: list[ValidationError] = []

        if result.run.run_id == "":
            errors.append(ValidationError(field="run.runId", message="Missing run ID"))
        if result.run.sut == "":
            errors.append(ValidationError(field="run.sut", message="Missing SUT identifier"))
        if result.run.case_id == "":
            errors.append(ValidationError(field="run.caseId", message="Missing case ID"))

        if not result.metrics.numeric:
            errors.append(
                ValidationError(field="metrics.numeric", message="Missing numeric metrics")
            )

        if not result.provenance.runtime.get("platform"):
            errors.append(
                ValidationError(
                    field="provenance.runtime.platform",
                    message="Missing platform",
                )
            )

        return errors

    def query(self, filter: ResultFilter | None = None) -> list[EvaluationResult]:
        """Query results with filters.

        Args:
            filter: Filter criteria.

        Returns:
            Matching results.
        """
        if filter is None:
            return list(self._results)

        results: list[EvaluationResult] = []
        for result in self._results:
            if filter.sut is not None and result.run.sut != filter.sut:
                continue
            if filter.sut_role is not None and result.run.sut_role != filter.sut_role:
                continue
            if filter.case_id is not None and result.run.case_id != filter.case_id:
                continue
            if filter.case_class is not None and result.run.case_class != filter.case_class:
                continue
            if filter.valid is not None and result.correctness.valid != filter.valid:
                continue
            if filter.has_metric is not None and filter.has_metric not in result.metrics.numeric:
                continue
            if filter.predicate is not None:
                pred = filter.predicate
                if callable(pred) and not pred(result):
                    continue
            results.append(result)
        return results

    def get_by_sut(self, sut_id: str) -> list[EvaluationResult]:
        """Get all results for a specific SUT.

        Args:
            sut_id: SUT identifier.

        Returns:
            Results for that SUT.
        """
        return self.query(ResultFilter(sut=sut_id))

    def get_by_case_class(self, case_class: str) -> list[EvaluationResult]:
        """Get all results for a specific case class.

        Args:
            case_class: Case class.

        Returns:
            Results for that case class.
        """
        return self.query(ResultFilter(case_class=case_class))

    def get_unique_suts(self) -> list[str]:
        """Get unique SUT IDs in the collection."""
        return list(dict.fromkeys(r.run.sut for r in self._results))

    def get_unique_case_classes(self) -> list[str]:
        """Get unique case classes in the collection."""
        return list(
            dict.fromkeys(r.run.case_class for r in self._results if r.run.case_class is not None)
        )

    def get_unique_metrics(self) -> list[str]:
        """Get unique metric names in the collection."""
        metrics: dict[str, None] = {}
        for result in self._results:
            for metric in result.metrics.numeric:
                metrics[metric] = None
        return list(metrics)

    def get_all(self) -> list[EvaluationResult]:
        """Get all results."""
        return list(self._results)

    @property
    def count(self) -> int:
        """Get result count."""
        return len(self._results)

    @property
    def is_empty(self) -> bool:
        """Check if empty."""
        return len(self._results) == 0

    def clear(self) -> None:
        """Clear all results."""
        self._results.clear()

    def serialize(self, metadata: dict[str, Primitive] | None = None) -> ResultBatch:
        """Serialize to ResultBatch format.

        Args:
            metadata: Optional batch metadata.

        Returns:
            Serializable batch.
        """
        return ResultBatch(
            version=self.SCHEMA_VERSION,
            timestamp=datetime.now(UTC).isoformat(),
            results=list(self._results),
            metadata=metadata,
        )

    def load(self, batch: ResultBatch, *, append: bool = False) -> None:
        """Load from a ResultBatch.

        Args:
            batch: Batch to load.
            append: Whether to append to existing results.
        """
        if not append:
            self._results.clear()
        self.record_batch(batch.results)

    def extract_metric(self, metric_name: str) -> list[dict[str, str | float]]:
        """Extract a specific metric across all results.

        Args:
            metric_name: Metric to extract.

        Returns:
            List of {run_id, value} dicts.
        """
        return [
            {"run_id": r.run.run_id, "value": r.metrics.numeric[metric_name]}
            for r in self._results
            if metric_name in r.metrics.numeric
        ]

    def get_metric_values(self, sut_id: str, metric_name: str) -> list[float]:
        """Get metric values for a specific SUT.

        Args:
            sut_id: SUT identifier.
            metric_name: Metric name.

        Returns:
            List of metric values.
        """
        return [
            r.metrics.numeric[metric_name]
            for r in self._results
            if r.run.sut == sut_id and metric_name in r.metrics.numeric
        ]


def validate_result(result: object) -> SchemaValidation:
    """Validate an EvaluationResult against the schema.

    Args:
        result: Object to validate.

    Returns:
        Validation result with errors.
    """
    errors: list[str] = []

    if not isinstance(result, dict):
        return SchemaValidation(valid=False, errors=["Result must be a dict"])

    try:
        parsed = EvaluationResult.model_validate(result)
    except PydanticValidationError as e:
        return SchemaValidation(
            valid=False,
            errors=[str(err["msg"]) for err in e.errors()],
        )

    # Additional semantic validation beyond Pydantic structural checks
    r = parsed
    if not r.run.run_id:
        errors.append("run.runId must be a non-empty string")
    if not r.run.sut:
        errors.append("run.sut must be a non-empty string")
    if not r.run.case_id:
        errors.append("run.caseId must be a non-empty string")

    for key, value in r.metrics.numeric.items():
        if not math.isfinite(value):
            errors.append(f"metrics.numeric.{key} must be a finite number")

    return SchemaValidation(valid=len(errors) == 0, errors=errors)


def validate_case(evaluation_case: object) -> SchemaValidation:
    """Validate an EvaluationCase against the schema.

    Args:
        evaluation_case: Object to validate.

    Returns:
        Validation result with errors.
    """
    from ppef.types.case import EvaluationCase

    errors: list[str] = []

    if not isinstance(evaluation_case, dict):
        return SchemaValidation(valid=False, errors=["Case must be a dict"])

    try:
        parsed = EvaluationCase.model_validate(evaluation_case)
    except PydanticValidationError as e:
        return SchemaValidation(
            valid=False,
            errors=[str(err["msg"]) for err in e.errors()],
        )

    if not parsed.case_id:
        errors.append("caseId must be a non-empty string")

    return SchemaValidation(valid=len(errors) == 0, errors=errors)


def validate_sut_registration(registration: object) -> SchemaValidation:
    """Validate a SutRegistration against the schema.

    Args:
        registration: Object to validate.

    Returns:
        Validation result with errors.
    """
    from ppef.types.sut import SutRegistration

    errors: list[str] = []

    if not isinstance(registration, dict):
        return SchemaValidation(valid=False, errors=["Registration must be a dict"])

    try:
        parsed = SutRegistration.model_validate(registration)
    except PydanticValidationError as e:
        return SchemaValidation(
            valid=False,
            errors=[str(err["msg"]) for err in e.errors()],
        )

    if not parsed.id:
        errors.append("id must be a non-empty string")
    if not parsed.name:
        errors.append("name must be a non-empty string")
    if not parsed.version:
        errors.append("version must be a non-empty string")

    return SchemaValidation(valid=len(errors) == 0, errors=errors)


result_collector = ResultCollector()
"""Global result collector instance."""
