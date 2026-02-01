"""Exploratory Evaluator.

Hypothesis-free analysis for discovering patterns in evaluation data:
- Rankings per metric (configurable direction)
- All pairwise comparisons between SUTs
- Case-class effects (deviation from mean)
- Metric correlations (Pearson + Spearman)
"""

from __future__ import annotations

import math
from datetime import UTC, datetime
from typing import Any

from ppef.statistical import normal_cdf
from ppef.types.aggregate import AggregatedResult
from ppef.types.evaluator import (
    CaseClassEffect,
    EvaluationSummary,
    EvaluationType,
    ExploratoryEvaluatorConfig,
    MetricCorrelation,
    MetricDirection,
    PairwiseComparison,
    SutMetricRanking,
    ValidationResult,
)


class ExploratoryEvaluator:
    """Exploratory evaluator -- hypothesis-free comparative analysis."""

    VERSION = "1.0.0"
    DEFAULT_SIGNIFICANCE = 0.05

    @property
    def type(self) -> EvaluationType:
        return "exploratory"

    # ------------------------------------------------------------------
    # validate_config
    # ------------------------------------------------------------------

    def validate_config(self, config: ExploratoryEvaluatorConfig) -> ValidationResult:
        """Validate exploratory evaluator configuration."""
        errors: list[str] = []
        warnings: list[str] = []

        if config.significance_level is not None and (
            config.significance_level <= 0 or config.significance_level >= 1
        ):
            errors.append("significanceLevel must be between 0 and 1 (exclusive)")

        if config.min_effect_size is not None and config.min_effect_size < 0:
            errors.append("minEffectSize must be non-negative")

        if config.metric_directions:
            valid_dirs = ("higher-better", "lower-better")
            for metric, direction in config.metric_directions.items():
                if direction not in valid_dirs:
                    errors.append(
                        f'Invalid direction for metric "{metric}": '
                        f'must be "higher-better" or "lower-better"'
                    )

        if not config.metrics or len(config.metrics) == 0:
            warnings.append("No metrics specified - will analyze all available metrics")
        if not config.suts or len(config.suts) == 0:
            warnings.append("No SUTs specified - will analyze all available SUTs")

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
        config: ExploratoryEvaluatorConfig,
        input_data: dict[str, Any],
    ) -> dict[str, Any]:
        """Perform exploratory evaluation.

        *input_data* is an ``EvaluationContext`` dict with at least an
        ``aggregates`` key.
        """
        aggregates: list[AggregatedResult] = input_data["aggregates"]
        significance_level = (
            config.significance_level
            if config.significance_level is not None
            else self.DEFAULT_SIGNIFICANCE
        )

        suts_to_analyze = self._determine_suts(aggregates, config.suts)
        metrics_to_analyze = self._determine_metrics(aggregates, config.metrics)

        filtered = [a for a in aggregates if a.sut in suts_to_analyze]

        # Rankings
        rankings: dict[str, list[dict[str, Any]]] = {}
        for metric in metrics_to_analyze:
            direction: MetricDirection = (
                config.metric_directions.get(metric, "higher-better")
                if config.metric_directions
                else "higher-better"
            )
            rankings[metric] = [
                r.model_dump(by_alias=True)
                for r in self._compute_rankings(filtered, metric, direction)
            ]

        # Pairwise comparisons
        pairwise = self._compute_pairwise_comparisons(
            filtered,
            suts_to_analyze,
            metrics_to_analyze,
            significance_level,
            config.min_effect_size,
        )

        # Case-class effects
        case_class_effects: list[dict[str, Any]] | None = None
        if config.analyze_case_class_effects is not False:
            effects = self._analyze_case_class_effects(
                filtered, metrics_to_analyze, significance_level
            )
            case_class_effects = [e.model_dump(by_alias=True) for e in effects] if effects else None

        # Metric correlations
        metric_correlations: list[dict[str, Any]] | None = None
        if config.compute_correlations is not False and len(metrics_to_analyze) >= 2:
            corrs = self._compute_metric_correlations(filtered, metrics_to_analyze)
            metric_correlations = [c.model_dump(by_alias=True) for c in corrs] if corrs else None

        # Best SUT per metric
        best_sut_per_metric: dict[str, str] = {}
        for metric, ranking_list in rankings.items():
            if ranking_list:
                best_sut_per_metric[metric] = ranking_list[0]["sut"]

        case_classes = {a.case_class for a in filtered}

        pairwise_dicts = [p.model_dump(by_alias=True) for p in pairwise]

        summary_data: dict[str, object] = {
            "version": self.VERSION,
            "timestamp": datetime.now(UTC).isoformat(),
            "rankings": rankings,
            "pairwiseComparisons": pairwise_dicts,
            "caseClassEffects": case_class_effects,
            "metricCorrelations": metric_correlations,
            "summary": {
                "sutsAnalyzed": len(suts_to_analyze),
                "metricsAnalyzed": len(metrics_to_analyze),
                "pairwiseComparisonsCount": len(pairwise),
                "significantDifferences": sum(1 for c in pairwise if c.significant),
                "caseClassesAnalyzed": len(case_classes),
                "bestSutPerMetric": best_sut_per_metric,
            },
        }

        return {
            "type": "exploratory",
            "version": self.VERSION,
            "timestamp": datetime.now(UTC).isoformat(),
            "data": summary_data,
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
            total=summary["pairwiseComparisonsCount"],
            passed=summary["significantDifferences"],
            additional={
                "sutsAnalyzed": summary["sutsAnalyzed"],
                "metricsAnalyzed": summary["metricsAnalyzed"],
                "significantDifferences": summary["significantDifferences"],
            },
        ).model_dump(by_alias=True)

    # ------------------------------------------------------------------
    # private helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _determine_suts(
        aggregates: list[AggregatedResult],
        config_suts: list[str] | None,
    ) -> list[str]:
        if config_suts and len(config_suts) > 0:
            return config_suts
        return list({a.sut for a in aggregates})

    @staticmethod
    def _determine_metrics(
        aggregates: list[AggregatedResult],
        config_metrics: list[str] | None,
    ) -> list[str]:
        if config_metrics and len(config_metrics) > 0:
            return config_metrics
        metrics: set[str] = set()
        for agg in aggregates:
            metrics.update(agg.metrics.keys())
        return list(metrics)

    # -- rankings -------------------------------------------------------

    @staticmethod
    def _compute_rankings(
        aggregates: list[AggregatedResult],
        metric: str,
        direction: MetricDirection,
    ) -> list[SutMetricRanking]:
        sut_stats: dict[str, dict[str, Any]] = {}

        for agg in aggregates:
            if metric not in agg.metrics:
                continue
            metric_stats = agg.metrics[metric]
            if agg.sut not in sut_stats:
                sut_stats[agg.sut] = {"values": [], "total": 0.0, "count": 0}
            entry = sut_stats[agg.sut]
            entry["values"].append(metric_stats.mean)
            entry["total"] += metric_stats.mean
            entry["count"] += 1

        rankings: list[SutMetricRanking] = []
        for sut, stats in sut_stats.items():
            values: list[float] = stats["values"]
            count: int = stats["count"]
            mean = stats["total"] / count
            sorted_vals = sorted(values)
            n = len(sorted_vals)
            if n % 2 == 0:
                median = (sorted_vals[n // 2 - 1] + sorted_vals[n // 2]) / 2
            else:
                median = sorted_vals[n // 2]

            variance = sum((v - mean) ** 2 for v in values) / count if count > 0 else 0.0
            std = math.sqrt(variance)

            rankings.append(
                SutMetricRanking(
                    sut=sut,
                    mean=mean,
                    median=median,
                    std=std if std > 0 else None,
                    rank=0,
                    n=count,
                )
            )

        rankings.sort(key=lambda r: r.mean, reverse=(direction == "higher-better"))

        for i, r in enumerate(rankings):
            r.rank = i + 1

        return rankings

    # -- pairwise comparisons -------------------------------------------

    def _compute_pairwise_comparisons(
        self,
        aggregates: list[AggregatedResult],
        suts: list[str],
        metrics: list[str],
        significance_level: float,
        min_effect_size: float | None,
    ) -> list[PairwiseComparison]:
        comparisons: list[PairwiseComparison] = []
        for metric in metrics:
            for i in range(len(suts)):
                for j in range(i + 1, len(suts)):
                    comp = self._compare_sut_pair(
                        aggregates,
                        suts[i],
                        suts[j],
                        metric,
                        significance_level,
                        min_effect_size,
                    )
                    if comp is not None:
                        comparisons.append(comp)
        return comparisons

    def _compare_sut_pair(
        self,
        aggregates: list[AggregatedResult],
        sut_a: str,
        sut_b: str,
        metric: str,
        significance_level: float,
        min_effect_size: float | None,
    ) -> PairwiseComparison | None:
        values_a: list[float] = []
        values_b: list[float] = []

        for agg in aggregates:
            if metric not in agg.metrics:
                continue
            if agg.sut == sut_a:
                values_a.append(agg.metrics[metric].mean)
            elif agg.sut == sut_b:
                values_b.append(agg.metrics[metric].mean)

        if not values_a or not values_b:
            return None

        mean_a = sum(values_a) / len(values_a)
        mean_b = sum(values_b) / len(values_b)
        delta = mean_a - mean_b
        ratio = mean_a / mean_b if mean_b != 0 else float("inf")

        p_value: float | None = None
        effect_size: float | None = None

        # Check for pre-computed comparisons
        agg_a = next((a for a in aggregates if a.sut == sut_a), None)
        if agg_a and agg_a.comparisons and sut_b in agg_a.comparisons:
            comp = agg_a.comparisons[sut_b]
            p_value = comp.p_value
            effect_size = comp.effect_size

        # Estimate if no pre-computed values
        if p_value is None and len(values_a) >= 3 and len(values_b) >= 3:
            var_a = self._variance(values_a)
            var_b = self._variance(values_b)
            pooled_std = math.sqrt(
                ((len(values_a) - 1) * var_a + (len(values_b) - 1) * var_b)
                / (len(values_a) + len(values_b) - 2)
            )

            if pooled_std > 0:
                effect_size = delta / pooled_std

                se = pooled_std * math.sqrt(1 / len(values_a) + 1 / len(values_b))
                t = delta / se
                df = len(values_a) + len(values_b) - 2

                if df >= 30:
                    p_value = 2 * (1 - normal_cdf(abs(t)))

        significant = (
            p_value is not None
            and p_value < significance_level
            and (
                min_effect_size is None
                or (effect_size is not None and abs(effect_size) >= min_effect_size)
            )
        )

        return PairwiseComparison(
            sut_a=sut_a,
            sut_b=sut_b,
            metric=metric,
            delta=delta,
            ratio=ratio,
            p_value=p_value,
            effect_size=effect_size,
            significant=significant,
        )

    # -- case-class effects ---------------------------------------------

    def _analyze_case_class_effects(
        self,
        aggregates: list[AggregatedResult],
        metrics: list[str],
        significance_level: float,
    ) -> list[CaseClassEffect]:
        effects: list[CaseClassEffect] = []

        suts = list({a.sut for a in aggregates})
        case_classes = list({a.case_class for a in aggregates})

        if len(case_classes) < 2:
            return effects

        for metric in metrics:
            for sut in suts:
                sut_aggs = [a for a in aggregates if a.sut == sut and metric in a.metrics]
                if not sut_aggs:
                    continue

                all_values = [a.metrics[metric].mean for a in sut_aggs]
                overall_mean = sum(all_values) / len(all_values)
                overall_std = math.sqrt(self._variance(all_values))

                for case_class in case_classes:
                    case_aggs = [a for a in sut_aggs if a.case_class == case_class]
                    if not case_aggs:
                        continue

                    case_values = [a.metrics[metric].mean for a in case_aggs]
                    case_mean = sum(case_values) / len(case_values)
                    deviation = case_mean - overall_mean
                    pct_deviation = (deviation / overall_mean) * 100 if overall_mean != 0 else 0.0

                    significant = False
                    if overall_std > 0 and len(case_values) >= 2:
                        z_score = abs(deviation) / (overall_std / math.sqrt(len(case_values)))
                        p_val = 2 * (1 - normal_cdf(z_score))
                        significant = p_val < significance_level

                    effects.append(
                        CaseClassEffect(
                            case_class=str(case_class),
                            sut=sut,
                            metric=metric,
                            deviation_from_mean=deviation,
                            percentage_deviation=pct_deviation,
                            significant=significant,
                        )
                    )

        return effects

    # -- metric correlations -------------------------------------------

    def _compute_metric_correlations(
        self,
        aggregates: list[AggregatedResult],
        metrics: list[str],
    ) -> list[MetricCorrelation]:
        correlations: list[MetricCorrelation] = []
        for i in range(len(metrics)):
            for j in range(i + 1, len(metrics)):
                corr = self._compute_correlation(aggregates, metrics[i], metrics[j])
                if corr is not None:
                    correlations.append(corr)
        return correlations

    def _compute_correlation(
        self,
        aggregates: list[AggregatedResult],
        metric_a: str,
        metric_b: str,
    ) -> MetricCorrelation | None:
        pairs: list[tuple[float, float]] = []
        for agg in aggregates:
            if metric_a not in agg.metrics or metric_b not in agg.metrics:
                continue
            pairs.append((agg.metrics[metric_a].mean, agg.metrics[metric_b].mean))

        if len(pairs) < 3:
            return None

        x_values = [p[0] for p in pairs]
        y_values = [p[1] for p in pairs]

        pearson_r = self._pearson_correlation(x_values, y_values)
        spearman_rho = self._spearman_correlation(x_values, y_values)
        interpretation = self._interpret_correlation(pearson_r)

        return MetricCorrelation(
            metric_a=metric_a,
            metric_b=metric_b,
            pearson_r=pearson_r,
            spearman_rho=spearman_rho,
            interpretation=interpretation,
        )

    # -- statistics helpers --------------------------------------------

    @staticmethod
    def _pearson_correlation(x: list[float], y: list[float]) -> float:
        n = len(x)
        mean_x = sum(x) / n
        mean_y = sum(y) / n

        numerator = 0.0
        sum_sq_x = 0.0
        sum_sq_y = 0.0

        for i in range(n):
            dx = x[i] - mean_x
            dy = y[i] - mean_y
            numerator += dx * dy
            sum_sq_x += dx * dx
            sum_sq_y += dy * dy

        denominator = math.sqrt(sum_sq_x * sum_sq_y)
        return numerator / denominator if denominator != 0 else 0.0

    def _spearman_correlation(self, x: list[float], y: list[float]) -> float:
        rank_x = self._compute_ranks(x)
        rank_y = self._compute_ranks(y)
        return self._pearson_correlation(rank_x, rank_y)

    @staticmethod
    def _compute_ranks(values: list[float]) -> list[float]:
        indexed = sorted(enumerate(values), key=lambda pair: pair[1])
        ranks = [0.0] * len(values)
        i = 0
        while i < len(indexed):
            j = i
            while j < len(indexed) and indexed[j][1] == indexed[i][1]:
                j += 1
            avg_rank = (i + j + 1) / 2
            for k in range(i, j):
                ranks[indexed[k][0]] = avg_rank
            i = j
        return ranks

    @staticmethod
    def _interpret_correlation(r: float) -> str:
        abs_r = abs(r)
        if abs_r >= 0.9:
            return "very strong"
        if abs_r >= 0.7:
            return "strong"
        if abs_r >= 0.5:
            return "moderate"
        if abs_r >= 0.3:
            return "weak"
        return "negligible"

    @staticmethod
    def _variance(values: list[float]) -> float:
        if not values:
            return 0.0
        mean = sum(values) / len(values)
        return sum((v - mean) ** 2 for v in values) / len(values)
