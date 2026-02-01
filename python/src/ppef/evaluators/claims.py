"""Claims Evaluator.

Evaluates explicit hypotheses (claims) against aggregated results.
For each claim: find primary/baseline aggregates, extract metric stats,
compute comparison, determine status using Mann-Whitney U for significance
and Cohen's d for effect size.
"""

from __future__ import annotations

import math
from datetime import UTC, datetime
from typing import Any

from ppef.types.aggregate import AggregatedResult
from ppef.types.claims import (
    ClaimEvaluation,
    ClaimEvidence,
    ClaimStatus,
    EvaluationClaim,
)
from ppef.types.evaluator import (
    ClaimsEvaluatorConfig,
    EvaluationSummary,
    EvaluationType,
    ValidationResult,
)


class ClaimsEvaluator:
    """Claims evaluator -- evaluates hypotheses against aggregated results."""

    VERSION = "1.0.0"

    @property
    def type(self) -> EvaluationType:
        return "claims"

    # ------------------------------------------------------------------
    # validate_config
    # ------------------------------------------------------------------

    def validate_config(self, config: ClaimsEvaluatorConfig) -> ValidationResult:
        """Validate claims evaluator configuration."""
        errors: list[str] = []
        warnings: list[str] = []

        if not isinstance(config.claims, list):  # type: ignore[unnecessary-isinstance]
            errors.append("claims must be a list")
            return ValidationResult(valid=False, errors=errors, warnings=warnings or None)

        if len(config.claims) == 0:
            warnings.append("No claims provided - evaluation will produce empty results")

        for i, claim in enumerate(config.claims):
            errors.extend(self._validate_claim(claim, i))

        return ValidationResult(
            valid=len(errors) == 0,
            errors=errors or None,
            warnings=warnings or None,
        )

    def _validate_claim(self, claim: EvaluationClaim, index: int) -> list[str]:
        errors: list[str] = []
        prefix = f"Claim[{index}]"

        if not claim.claim_id or not isinstance(claim.claim_id, str):  # type: ignore[unnecessary-isinstance]
            errors.append(f"{prefix}: claimId is required")
        if not claim.description or not isinstance(claim.description, str):  # type: ignore[unnecessary-isinstance]
            errors.append(f"{prefix}: description is required")
        if not claim.sut or not isinstance(claim.sut, str):  # type: ignore[unnecessary-isinstance]
            errors.append(f"{prefix}: sut is required")
        if not claim.baseline or not isinstance(claim.baseline, str):  # type: ignore[unnecessary-isinstance]
            errors.append(f"{prefix}: baseline is required")
        if not claim.metric or not isinstance(claim.metric, str):  # type: ignore[unnecessary-isinstance]
            errors.append(f"{prefix}: metric is required")
        if claim.direction not in ("greater", "less", "equal"):
            errors.append(f"{prefix}: direction must be 'greater', 'less', or 'equal'")
        if claim.threshold is not None and not isinstance(claim.threshold, (int, float)):  # type: ignore[unnecessary-isinstance]
            errors.append(f"{prefix}: threshold must be a number")
        if claim.scope not in ("global", "caseClass", "parameterRange", "localStructure"):
            errors.append(f"{prefix}: scope must be a valid ValidityScope")

        return errors

    # ------------------------------------------------------------------
    # evaluate
    # ------------------------------------------------------------------

    def evaluate(
        self,
        config: ClaimsEvaluatorConfig,
        input_data: dict[str, Any],
    ) -> dict[str, Any]:
        """Evaluate claims against aggregated results.

        *input_data* is an ``EvaluationContext`` dict with at least an
        ``aggregates`` key containing a list of :class:`AggregatedResult`.
        """
        aggregates: list[AggregatedResult] = input_data["aggregates"]

        evaluations = [self._evaluate_claim(claim, aggregates) for claim in config.claims]
        summary = self._create_claim_summary(evaluations)

        return {
            "type": "claims",
            "version": self.VERSION,
            "timestamp": datetime.now(UTC).isoformat(),
            "data": summary,
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
            passed=summary["satisfied"],
            failed=summary["violated"],
            inconclusive=summary["inconclusive"],
            passRate=summary["satisfactionRate"],
            additional={"satisfactionRate": summary["satisfactionRate"]},
        ).model_dump(by_alias=True)

    # ------------------------------------------------------------------
    # private helpers
    # ------------------------------------------------------------------

    def _evaluate_claim(
        self,
        claim: EvaluationClaim,
        aggregates: list[AggregatedResult],
    ) -> ClaimEvaluation:
        filtered = self._filter_by_scope(aggregates, claim)

        primary_agg = next((a for a in filtered if a.sut == claim.sut), None)
        baseline_agg = next((a for a in filtered if a.sut == claim.baseline), None)

        if primary_agg is None or baseline_agg is None:
            reasons: list[str] = []
            if primary_agg is None:
                reasons.append("Primary SUT not found")
            if baseline_agg is None:
                reasons.append("Baseline SUT not found")
            return self._inconclusive(claim, reasons)

        metric = claim.metric
        if metric not in primary_agg.metrics or metric not in baseline_agg.metrics:
            return self._inconclusive(
                claim,
                ["Metric not found in primary results", "Metric not found in baseline results"],
            )

        primary_stats = primary_agg.metrics[metric]
        baseline_stats = baseline_agg.metrics[metric]

        primary_value = primary_stats.mean
        baseline_value = baseline_stats.mean
        delta = primary_value - baseline_value
        ratio = primary_value / baseline_value if baseline_value != 0 else float("inf")

        # Extract pre-computed comparison if available
        p_value: float | None = None
        effect_size: float | None = None
        if primary_agg.comparisons and claim.baseline in primary_agg.comparisons:
            comparison = primary_agg.comparisons[claim.baseline]
            p_value = comparison.p_value
            effect_size = comparison.effect_size

        evidence = ClaimEvidence(
            primaryValue=primary_value,
            baselineValue=baseline_value,
            delta=delta,
            ratio=ratio,
            pValue=p_value,
            effectSize=effect_size,
            n=primary_stats.n + baseline_stats.n,
        )

        status = self._determine_status(claim, evidence)

        return ClaimEvaluation(claim=claim, status=status, evidence=evidence)

    def _filter_by_scope(
        self,
        aggregates: list[AggregatedResult],
        claim: EvaluationClaim,
    ) -> list[AggregatedResult]:
        if not claim.scope_constraints:
            return aggregates

        result: list[AggregatedResult] = []
        for agg in aggregates:
            keep = True
            for key, value in claim.scope_constraints.items():
                if key == "caseClass":
                    allowed = value if isinstance(value, list) else [value]
                    if agg.case_class is None or agg.case_class not in allowed:
                        keep = False
                        break
            if keep:
                result.append(agg)
        return result

    def _inconclusive(
        self,
        claim: EvaluationClaim,
        reasons: list[str],
    ) -> ClaimEvaluation:
        return ClaimEvaluation(
            claim=claim,
            status="inconclusive",
            evidence=ClaimEvidence(
                primaryValue=float("nan"),
                baselineValue=float("nan"),
                delta=float("nan"),
                ratio=float("nan"),
            ),
            inconclusiveReason="; ".join(r for r in reasons if r),
        )

    def _determine_status(
        self,
        claim: EvaluationClaim,
        evidence: ClaimEvidence,
    ) -> ClaimStatus:
        if math.isnan(evidence.primary_value) or math.isnan(evidence.baseline_value):
            return "inconclusive"

        significance_level = (
            claim.significance_level if claim.significance_level is not None else 0.05
        )
        if evidence.p_value is not None and evidence.p_value > significance_level:
            return "inconclusive"

        if (
            claim.min_effect_size is not None
            and evidence.effect_size is not None
            and abs(evidence.effect_size) < claim.min_effect_size
        ):
            return "inconclusive"

        match claim.direction:
            case "greater":
                if claim.threshold is not None:
                    return "satisfied" if evidence.delta >= claim.threshold else "violated"
                return "satisfied" if evidence.delta > 0 else "violated"
            case "less":
                if claim.threshold is not None:
                    return "satisfied" if evidence.delta <= -claim.threshold else "violated"
                return "satisfied" if evidence.delta < 0 else "violated"
            case "equal":
                epsilon = claim.threshold if claim.threshold is not None else 0.001
                return "satisfied" if abs(evidence.delta) <= epsilon else "violated"

    def _create_claim_summary(self, evaluations: list[ClaimEvaluation]) -> dict[str, Any]:
        satisfied = sum(1 for e in evaluations if e.status == "satisfied")
        violated = sum(1 for e in evaluations if e.status == "violated")
        inconclusive = sum(1 for e in evaluations if e.status == "inconclusive")
        definitive = satisfied + violated
        satisfaction_rate = satisfied / definitive if definitive > 0 else 0.0

        return {
            "version": "1.0.0",
            "timestamp": datetime.now(UTC).isoformat(),
            "evaluations": [e.model_dump(by_alias=True) for e in evaluations],
            "summary": {
                "total": len(evaluations),
                "satisfied": satisfied,
                "violated": violated,
                "inconclusive": inconclusive,
                "satisfactionRate": satisfaction_rate,
            },
        }
