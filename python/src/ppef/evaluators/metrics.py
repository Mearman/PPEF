"""Metrics Evaluator.

Evaluates metrics against threshold, baseline, and target-range criteria.
Enables evaluation without claims by checking if metrics meet specified
criteria (thresholds, baselines, or target ranges).
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any

from ppef.types.aggregate import AggregatedResult
from ppef.types.evaluator import (
    EvaluationSummary,
    EvaluationType,
    MetricsCriterion,
    MetricsCriterionResult,
    MetricsEvaluatorConfig,
    ValidationResult,
)


class MetricsEvaluator:
    """Metrics evaluator -- evaluates metrics against criteria."""

    VERSION = "1.0.0"

    @property
    def type(self) -> EvaluationType:
        return "metrics"

    # ------------------------------------------------------------------
    # validate_config
    # ------------------------------------------------------------------

    def validate_config(self, config: MetricsEvaluatorConfig) -> ValidationResult:
        """Validate metrics evaluator configuration."""
        errors: list[str] = []
        warnings: list[str] = []

        if not isinstance(config.criteria, list):  # type: ignore[unnecessary-isinstance]
            errors.append("criteria must be a list")
        elif len(config.criteria) == 0:
            warnings.append("No criteria provided - evaluation will produce empty results")
        else:
            for i, criterion in enumerate(config.criteria):
                errors.extend(self._validate_criterion(criterion, i))

        return ValidationResult(
            valid=len(errors) == 0,
            errors=errors or None,
            warnings=warnings or None,
        )

    def _validate_criterion(self, criterion: MetricsCriterion, index: int) -> list[str]:
        errors: list[str] = []
        prefix = f"Criterion[{index}]"

        if not criterion.criterion_id or not isinstance(criterion.criterion_id, str):  # type: ignore[unnecessary-isinstance]
            errors.append(f"{prefix}: criterionId is required")
        if not criterion.description or not isinstance(criterion.description, str):  # type: ignore[unnecessary-isinstance]
            errors.append(f"{prefix}: description is required")
        if not criterion.metric or not isinstance(criterion.metric, str):  # type: ignore[unnecessary-isinstance]
            errors.append(f"{prefix}: metric is required")
        if not criterion.sut or not isinstance(criterion.sut, str):  # type: ignore[unnecessary-isinstance]
            errors.append(f"{prefix}: sut is required")

        match criterion.type:
            case "threshold":
                if criterion.threshold is None:
                    errors.append(f"{prefix}: threshold required for threshold type")
                else:
                    operator = criterion.threshold.get("operator")
                    if operator not in ("gt", "gte", "lt", "lte", "eq"):
                        errors.append(f"{prefix}: threshold.operator must be valid")
                    value = criterion.threshold.get("value")
                    if not isinstance(value, (int, float)):
                        errors.append(f"{prefix}: threshold.value must be a number")
            case "baseline":
                if criterion.baseline is None:
                    errors.append(f"{prefix}: baseline required for baseline type")
                else:
                    sut = criterion.baseline.get("sut")
                    if not sut or not isinstance(sut, str):
                        errors.append(f"{prefix}: baseline.sut is required")
                    operator = criterion.baseline.get("operator")
                    if operator not in ("gt", "gte", "lt", "lte", "eq"):
                        errors.append(f"{prefix}: baseline.operator must be valid")
            case "target-range":
                if criterion.target_range is None:
                    errors.append(f"{prefix}: targetRange required for target-range type")
                else:
                    tr_min = criterion.target_range.get("min")
                    tr_max = criterion.target_range.get("max")
                    if tr_min is None and tr_max is None:
                        errors.append(f"{prefix}: targetRange must have min or max")
                    if (
                        tr_min is not None
                        and tr_max is not None
                        and float(str(tr_min)) > float(str(tr_max))
                    ):
                        errors.append(f"{prefix}: targetRange.min must be <= targetRange.max")

        return errors

    # ------------------------------------------------------------------
    # evaluate
    # ------------------------------------------------------------------

    def evaluate(
        self,
        config: MetricsEvaluatorConfig,
        input_data: dict[str, Any],
    ) -> dict[str, Any]:
        """Evaluate metrics against criteria.

        *input_data* is an ``EvaluationContext`` dict with at least an
        ``aggregates`` key.
        """
        aggregates: list[AggregatedResult] = input_data["aggregates"]

        results = [self._evaluate_criterion(criterion, aggregates) for criterion in config.criteria]
        summary = self._compute_summary(results)

        now = datetime.now(UTC).isoformat()
        return {
            "type": "metrics",
            "version": self.VERSION,
            "timestamp": now,
            "data": {
                "version": "1.0.0",
                "timestamp": now,
                "results": [r.model_dump(by_alias=True) for r in results],
                "summary": summary,
            },
            "metadata": {
                "inputSource": input_data.get("metadata", {}).get("source"),
                "config": config.model_dump(by_alias=True),
            },
        }

    # ------------------------------------------------------------------
    # summarize
    # ------------------------------------------------------------------

    def summarize(self, output: dict[str, Any]) -> dict[str, Any]:
        """Summarize evaluation output."""
        summary = output["data"]["summary"]
        return EvaluationSummary(
            total=summary["total"],
            passed=summary["passed"],
            failed=summary["failed"],
            inconclusive=summary["inconclusive"],
            passRate=summary["passRate"],
            additional={"passRateBySut": json.dumps(summary.get("passRateBySut", {}))},
        ).model_dump(by_alias=True)

    # ------------------------------------------------------------------
    # private helpers
    # ------------------------------------------------------------------

    def _evaluate_criterion(
        self,
        criterion: MetricsCriterion,
        aggregates: list[AggregatedResult],
    ) -> MetricsCriterionResult:
        relevant = self._filter_by_sut(aggregates, criterion.sut)

        if not relevant:
            return MetricsCriterionResult(
                criterion=criterion,
                status="inconclusive",
                observed=[],
                expected={"type": criterion.type},
                inconclusiveReason=f"No aggregates found for SUT: {criterion.sut}",
            )

        observed: list[dict[str, object]] = []
        for agg in relevant:
            if criterion.metric in agg.metrics:
                stats = agg.metrics[criterion.metric]
                if isinstance(stats.mean, (int, float)):  # type: ignore[unnecessary-isinstance]
                    observed.append({"sut": agg.sut, "value": stats.mean})

        if not observed:
            return MetricsCriterionResult(
                criterion=criterion,
                status="inconclusive",
                observed=[],
                expected={"type": criterion.type},
                inconclusiveReason=f"Metric {criterion.metric} not found in aggregates",
            )

        return self._evaluate_by_type(criterion, observed, aggregates)

    @staticmethod
    def _filter_by_sut(
        aggregates: list[AggregatedResult],
        sut: str,
    ) -> list[AggregatedResult]:
        if sut == "*":
            return aggregates
        return [a for a in aggregates if a.sut == sut]

    def _evaluate_by_type(
        self,
        criterion: MetricsCriterion,
        observed: list[dict[str, object]],
        aggregates: list[AggregatedResult],
    ) -> MetricsCriterionResult:
        match criterion.type:
            case "threshold":
                return self._evaluate_threshold(criterion, observed)
            case "baseline":
                return self._evaluate_baseline(criterion, observed, aggregates)
            case "target-range":
                return self._evaluate_target_range(criterion, observed)

    # -- threshold -------------------------------------------------------

    def _evaluate_threshold(
        self,
        criterion: MetricsCriterion,
        observed: list[dict[str, object]],
    ) -> MetricsCriterionResult:
        assert criterion.threshold is not None
        operator = str(criterion.threshold["operator"])
        value = float(criterion.threshold["value"])  # type: ignore[arg-type]

        if criterion.sut == "*":
            status = (
                "pass"
                if all(self._compare(float(o["value"]), operator, value) for o in observed)  # type: ignore[arg-type]
                else "fail"
            )
        else:
            status = (
                "pass"
                if any(self._compare(float(o["value"]), operator, value) for o in observed)  # type: ignore[arg-type]
                else "fail"
            )

        return MetricsCriterionResult(
            criterion=criterion,
            status=status,
            observed=observed,
            expected={"type": "threshold", "threshold": value},
        )

    # -- baseline --------------------------------------------------------

    def _evaluate_baseline(
        self,
        criterion: MetricsCriterion,
        observed: list[dict[str, object]],
        aggregates: list[AggregatedResult],
    ) -> MetricsCriterionResult:
        assert criterion.baseline is not None
        baseline_sut = str(criterion.baseline["sut"])
        operator = str(criterion.baseline["operator"])

        baseline_agg = next((a for a in aggregates if a.sut == baseline_sut), None)
        if baseline_agg is None:
            return MetricsCriterionResult(
                criterion=criterion,
                status="inconclusive",
                observed=observed,
                expected={"type": "baseline"},
                inconclusiveReason=f"Baseline SUT not found: {baseline_sut}",
            )

        if criterion.metric not in baseline_agg.metrics:
            return MetricsCriterionResult(
                criterion=criterion,
                status="inconclusive",
                observed=observed,
                expected={"type": "baseline"},
                inconclusiveReason=f"Baseline metric not found: {criterion.metric}",
            )

        baseline_stats = baseline_agg.metrics[criterion.metric]
        if not isinstance(baseline_stats.mean, (int, float)):  # type: ignore[unnecessary-isinstance]
            return MetricsCriterionResult(
                criterion=criterion,
                status="inconclusive",
                observed=observed,
                expected={"type": "baseline"},
                inconclusiveReason=f"Baseline metric not found: {criterion.metric}",
            )

        baseline_value = baseline_stats.mean
        primary_observed = [o for o in observed if o.get("sut") != baseline_sut]
        status = (
            "pass"
            if any(
                self._compare(float(o["value"]), operator, baseline_value)  # type: ignore[arg-type]
                for o in primary_observed
            )
            else "fail"
        )

        return MetricsCriterionResult(
            criterion=criterion,
            status=status,
            observed=observed,
            expected={"type": "baseline", "baselineValue": baseline_value},
        )

    # -- target-range ----------------------------------------------------

    def _evaluate_target_range(
        self,
        criterion: MetricsCriterion,
        observed: list[dict[str, object]],
    ) -> MetricsCriterionResult:
        assert criterion.target_range is not None
        tr_min = criterion.target_range.get("min")
        tr_max = criterion.target_range.get("max")
        min_inclusive = bool(criterion.target_range.get("minInclusive", True))
        max_inclusive = bool(criterion.target_range.get("maxInclusive", True))

        def in_range(value: float) -> bool:
            if tr_min is not None:
                above = value >= float(str(tr_min)) if min_inclusive else value > float(str(tr_min))
                if not above:
                    return False
            if tr_max is not None:
                below = value <= float(str(tr_max)) if max_inclusive else value < float(str(tr_max))
                if not below:
                    return False
            return True

        if criterion.sut == "*":
            status = "pass" if all(in_range(float(o["value"])) for o in observed) else "fail"  # type: ignore[arg-type]
        else:
            status = "pass" if any(in_range(float(o["value"])) for o in observed) else "fail"  # type: ignore[arg-type]

        return MetricsCriterionResult(
            criterion=criterion,
            status=status,
            observed=observed,
            expected={
                "type": "target-range",
                "targetRange": {"min": tr_min, "max": tr_max},
            },
        )

    # -- comparison operator ---------------------------------------------

    @staticmethod
    def _compare(value: float, operator: str, threshold: float) -> bool:
        match operator:
            case "gt":
                return value > threshold
            case "gte":
                return value >= threshold
            case "lt":
                return value < threshold
            case "lte":
                return value <= threshold
            case "eq":
                return abs(value - threshold) < 0.0001
            case _:
                return False

    # -- summary ---------------------------------------------------------

    @staticmethod
    def _compute_summary(results: list[MetricsCriterionResult]) -> dict[str, Any]:
        total = len(results)
        passed = sum(1 for r in results if r.status == "pass")
        failed = sum(1 for r in results if r.status == "fail")
        inconclusive = sum(1 for r in results if r.status == "inconclusive")
        pass_rate = passed / total if total > 0 else 0.0

        sut_results: dict[str, list[MetricsCriterionResult]] = {}
        for result in results:
            for obs in result.observed:
                sut = str(obs.get("sut", ""))
                if sut:
                    sut_results.setdefault(sut, []).append(result)

        pass_rate_by_sut: dict[str, float] = {}
        for sut, sut_result_list in sut_results.items():
            sut_passed = sum(1 for r in sut_result_list if r.status == "pass")
            pass_rate_by_sut[sut] = sut_passed / len(sut_result_list)

        return {
            "total": total,
            "passed": passed,
            "failed": failed,
            "inconclusive": inconclusive,
            "passRate": pass_rate,
            "passRateBySut": pass_rate_by_sut,
        }
