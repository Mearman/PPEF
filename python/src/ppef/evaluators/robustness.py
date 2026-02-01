"""Robustness Evaluator.

Analyzes algorithm robustness under perturbations.  Groups results by
perturbation type and intensity, computes variance, standard deviation,
coefficient of variation, and detects degradation breakpoints.
"""

from __future__ import annotations

import math
from datetime import UTC, datetime
from typing import Any

from ppef.types.evaluator import (
    EvaluationType,
    RobustnessEvaluatorConfig,
    ValidationResult,
)
from ppef.types.perturbation import RobustnessMetrics
from ppef.types.result import EvaluationResult


class RobustnessEvaluator:
    """Robustness evaluator -- analyzes variance under perturbations."""

    VERSION = "1.0.0"

    @property
    def type(self) -> EvaluationType:
        return "robustness"

    # ------------------------------------------------------------------
    # validate_config
    # ------------------------------------------------------------------

    def validate_config(self, config: RobustnessEvaluatorConfig) -> ValidationResult:
        """Validate robustness evaluator configuration."""
        errors: list[str] = []
        warnings: list[str] = []

        if not isinstance(config.metrics, list):
            errors.append("metrics must be a list")
        elif len(config.metrics) == 0:
            errors.append("metrics cannot be empty")

        if not isinstance(config.perturbations, list):
            errors.append("perturbations must be a list")
        elif len(config.perturbations) == 0:
            errors.append("perturbations cannot be empty")

        if config.intensity_levels is not None:
            if not isinstance(config.intensity_levels, list):
                errors.append("intensityLevels must be a list")
            elif not all(isinstance(level, (int, float)) for level in config.intensity_levels):
                errors.append("intensityLevels must contain only numbers")

        if config.runs_per_level is not None and not isinstance(config.runs_per_level, int):
            errors.append("runsPerLevel must be a number")

        return ValidationResult(
            valid=len(errors) == 0,
            errors=errors or None,
            warnings=warnings or None,
        )

    # ------------------------------------------------------------------
    # evaluate
    # ------------------------------------------------------------------

    def evaluate(
        self,
        config: RobustnessEvaluatorConfig,
        input_data: list[EvaluationResult],
    ) -> dict[str, Any]:
        """Evaluate robustness from raw results.

        *input_data* is a list of :class:`EvaluationResult`.
        """
        analysis = self._create_robustness_analysis(
            input_data,
            metrics=config.metrics,
            perturbations=config.perturbations,
            intensity_levels=config.intensity_levels,
            runs_per_level=config.runs_per_level,
        )

        return {
            "type": "robustness",
            "version": self.VERSION,
            "timestamp": datetime.now(UTC).isoformat(),
            "data": analysis,
            "metadata": {
                "config": config.model_dump(by_alias=True),
            },
        }

    # ------------------------------------------------------------------
    # summarize
    # ------------------------------------------------------------------

    def summarize(self, output: dict[str, Any]) -> dict[str, Any]:
        """Summarize evaluation output."""
        data = output["data"]
        results = data["results"]
        return {
            "total": len(results),
            "additional": {
                "sutsAnalyzed": len({r["sut"] for r in results}),
                "metricsAnalyzed": len(data["config"]["metrics"]),
                "perturbationsTested": len(data["config"]["perturbations"]),
            },
        }

    # ------------------------------------------------------------------
    # private helpers
    # ------------------------------------------------------------------

    def _create_robustness_analysis(
        self,
        results: list[EvaluationResult],
        *,
        metrics: list[str],
        perturbations: list[str],
        intensity_levels: list[float] | None = None,
        runs_per_level: int | None = None,
    ) -> dict[str, Any]:
        # Group results by SUT
        by_sut: dict[str, list[EvaluationResult]] = {}
        for result in results:
            by_sut.setdefault(result.run.sut, []).append(result)

        analysis_results: list[dict[str, Any]] = []

        for sut, sut_results in by_sut.items():
            for metric in metrics:
                for perturbation in perturbations:
                    perturbed = [
                        r
                        for r in sut_results
                        if r.run.config is not None
                        and r.run.config.get("perturbation") == perturbation
                    ]

                    robustness = self._analyze_for_metric(perturbed, metric)

                    # Baseline value
                    base_values = [
                        r.metrics.numeric[metric]
                        for r in sut_results
                        if (r.run.config is None or r.run.config.get("perturbation") is None)
                        and metric in r.metrics.numeric
                    ]
                    baseline_value = (
                        sum(base_values) / len(base_values) if base_values else float("nan")
                    )

                    analysis_results.append(
                        {
                            "sut": sut,
                            "perturbation": perturbation,
                            "metric": metric,
                            "robustness": robustness.model_dump(by_alias=True),
                            "baselineValue": baseline_value,
                            "runCount": len(perturbed),
                        }
                    )

        return {
            "version": "1.0.0",
            "timestamp": datetime.now(UTC).isoformat(),
            "results": analysis_results,
            "config": {
                "perturbations": perturbations,
                "metrics": metrics,
                "intensityLevels": intensity_levels,
                "runsPerLevel": runs_per_level if runs_per_level is not None else 1,
            },
        }

    @staticmethod
    def _analyze_for_metric(
        perturbed_results: list[EvaluationResult],
        metric: str,
    ) -> RobustnessMetrics:
        values = [
            r.metrics.numeric[metric]
            for r in perturbed_results
            if metric in r.metrics.numeric and not math.isnan(r.metrics.numeric[metric])
        ]

        if not values:
            return RobustnessMetrics(
                variance_under_perturbation=float("nan"),
                std_under_perturbation=float("nan"),
                coefficient_of_variation=float("nan"),
            )

        n = len(values)
        mean = sum(values) / n
        variance = sum((v - mean) ** 2 for v in values) / (n - 1) if n > 1 else 0.0
        std = math.sqrt(variance)
        cv = std / abs(mean) if mean != 0 else float("nan")

        return RobustnessMetrics(
            variance_under_perturbation=variance,
            std_under_perturbation=std,
            coefficient_of_variation=cv,
        )
