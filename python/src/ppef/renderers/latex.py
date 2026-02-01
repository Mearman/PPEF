"""LaTeX Renderer.

Pure transformation from aggregated results to LaTeX tables.
NO aggregation logic allowed here - only formatting and rendering.
"""

from __future__ import annotations

import json
import math
import re
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any


@dataclass
class ClaimStatusDisplay:
    """Claim status display symbols."""

    satisfied: str = r"\checkmark"
    violated: str = r"\times"
    inconclusive: str = "?"


LATEX_CLAIM_STATUS = ClaimStatusDisplay()
UNICODE_CLAIM_STATUS = ClaimStatusDisplay(
    satisfied="v",
    violated="x",
    inconclusive="?",
)


@dataclass
class ColumnSpec:
    """Column specification for a table."""

    key: str
    header: str
    align: str = "l"
    format_fn: Callable[[Any], str] | None = None
    bold: bool = False
    sortable: bool = False


@dataclass
class TableRenderSpec:
    """Table render specification."""

    id: str
    filename: str
    label: str
    caption: str
    columns: list[ColumnSpec]
    extract_data: Callable[[list[dict[str, Any]]], list[dict[str, Any]]]
    filter_fn: Callable[[dict[str, Any]], bool] | None = None
    sort_fn: Callable[[dict[str, Any], dict[str, Any]], int] | None = None
    caption_placeholders: dict[str, Callable[[list[dict[str, Any]]], str]] = field(
        default_factory=lambda: dict[str, Callable[[list[dict[str, Any]]], str]]()
    )


@dataclass
class RenderOutput:
    """Render output."""

    id: str
    filename: str
    content: str
    format: str = "latex"


def escape_latex(text: str) -> str:
    """Escape special LaTeX characters."""
    text = text.replace("\\", r"\textbackslash{}")
    text = re.sub(r"([&%$#_{}])", r"\\\1", text)
    text = text.replace("~", r"\textasciitilde{}")
    text = text.replace("^", r"\textasciicircum{}")
    return text


class LaTeXRenderer:
    """LaTeX table renderer."""

    def __init__(
        self,
        *,
        claim_status: ClaimStatusDisplay | None = None,
        booktabs: bool = True,
        default_decimals: int = 2,
    ) -> None:
        self.claim_status = claim_status or LATEX_CLAIM_STATUS
        self.booktabs = booktabs
        self.default_decimals = default_decimals

    def render_table(
        self,
        aggregates: list[dict[str, Any]],
        spec: TableRenderSpec,
    ) -> RenderOutput:
        """Render a single table."""
        data = spec.extract_data(aggregates)

        if spec.sort_fn is not None:
            import functools

            data = sorted(data, key=functools.cmp_to_key(spec.sort_fn))

        caption = spec.caption
        for placeholder, compute in spec.caption_placeholders.items():
            caption = caption.replace(f"{{{placeholder}}}", compute(aggregates))

        content = self._build_table(data, spec.columns, caption, spec.label)

        return RenderOutput(
            id=spec.id,
            filename=spec.filename,
            content=content,
            format="latex",
        )

    def render_all(
        self,
        aggregates: list[dict[str, Any]],
        specs: list[TableRenderSpec],
    ) -> list[RenderOutput]:
        """Render all tables."""
        return [self.render_table(aggregates, spec) for spec in specs]

    def render_evaluation(self, evaluation: dict[str, Any]) -> RenderOutput:
        """Render evaluation output (generic for all evaluation types).

        Dispatches to type-specific rendering methods.
        """
        eval_type = evaluation.get("type", "")

        if eval_type == "claims":
            return self._render_claims_evaluation(evaluation)
        if eval_type == "robustness":
            return self._render_robustness_evaluation(evaluation)
        if eval_type == "metrics":
            return self._render_metrics_evaluation(evaluation)
        if eval_type == "exploratory":
            return self._render_exploratory_evaluation(evaluation)
        return self._render_custom_evaluation(evaluation)

    def _render_claims_evaluation(self, evaluation: dict[str, Any]) -> RenderOutput:
        """Render claims evaluation output."""
        evaluations = evaluation.get("data", {}).get("evaluations", [])
        return self.render_claim_summary(evaluations)

    def _render_robustness_evaluation(self, evaluation: dict[str, Any]) -> RenderOutput:
        """Render robustness evaluation output."""
        data = evaluation.get("data", {})
        results = data.get("results", [])
        config = data.get("config", {})

        rows: list[str] = []
        for result in results:
            robustness = result.get("robustness", {})
            variance = self.format_number(robustness.get("varianceUnderPerturbation", 0), 4)
            cv = self.format_number(robustness.get("coefficientOfVariation", 0), 3)
            std = self.format_number(robustness.get("stdUnderPerturbation", 0), 4)
            baseline = self.format_number(result.get("baselineValue", 0), 3)

            rows.append(
                f"    {escape_latex(result.get('sut', ''))} & "
                f"{escape_latex(result.get('perturbation', ''))} & "
                f"{escape_latex(result.get('metric', ''))} & "
                f"{baseline} & {std} & {variance} & {cv} \\\\"
            )

        suts = len({r.get("sut", "") for r in results})
        metrics_list = config.get("metrics", [])
        perturbations_list = config.get("perturbations", [])
        caption = (
            f"Robustness analysis. {suts} SUT(s) analyzed for "
            f"{len(metrics_list)} metric(s) under {len(perturbations_list)} perturbation(s)."
        )

        content = (
            "\\begin{table}[htbp]\n"
            "  \\centering\n"
            f"  \\caption{{{caption}}}\n"
            "  \\label{tab:robustness-summary}\n"
            "  \\begin{tabular}{lllrrrr}\n"
            "    \\toprule\n"
            "    SUT & Perturbation & Metric & Baseline & Std & Variance & CV \\\\\n"
            "    \\midrule\n" + "\n".join(rows) + "\n"
            "    \\bottomrule\n"
            "  \\end{tabular}\n"
            "\\end{table}\n"
        )

        return RenderOutput(
            id="robustness-summary",
            filename="robustness-summary.tex",
            content=content,
            format="latex",
        )

    def _render_metrics_evaluation(self, evaluation: dict[str, Any]) -> RenderOutput:
        """Render metrics evaluation output."""
        data = evaluation.get("data", {})
        results = data.get("results", [])
        summary = data.get("summary", {})

        rows: list[str] = []
        for result in results:
            criterion = result.get("criterion", {})
            criterion_id = escape_latex(criterion.get("criterionId", ""))
            crit_type = escape_latex(criterion.get("type", ""))

            status = result.get("status", "")
            if status == "pass":
                status_sym = r"\checkmark"
            elif status == "fail":
                status_sym = r"\times"
            else:
                status_sym = "?"

            expected = result.get("expected", {})
            expected_str = "--"
            expected_type = expected.get("type", "")
            if expected_type == "threshold":
                expected_str = self.format_number(expected.get("threshold", 0))
            elif expected_type == "baseline":
                expected_str = self.format_number(expected.get("baselineValue", 0))
            elif expected_type == "target-range":
                target_range = expected.get("targetRange", {})
                min_val = target_range.get("min")
                max_val = target_range.get("max")
                min_str = self.format_number(min_val) if min_val is not None else "-inf"
                max_str = self.format_number(max_val) if max_val is not None else "inf"
                expected_str = f"[{min_str}, {max_str}]"

            observed_parts: list[str] = []
            for obs in result.get("observed", []):
                sut_name = escape_latex(str(obs.get("sut", "")))
                obs_val = self.format_number(obs.get("value", 0))
                observed_parts.append(f"{sut_name}={obs_val}")
            observed_str = ", ".join(observed_parts)

            rows.append(
                f"    {criterion_id} & {crit_type} & ${status_sym}$"
                f" & {expected_str} & {observed_str} \\\\"
            )

        passed = summary.get("passed", 0)
        total = summary.get("total", 0)
        pass_rate = summary.get("passRate", 0)
        pct = self.format_percentage(pass_rate)
        caption = f"Metrics evaluation summary. {passed}/{total} criteria passed ({pct})."

        content = (
            "\\begin{table}[htbp]\n"
            "  \\centering\n"
            f"  \\caption{{{caption}}}\n"
            "  \\label{tab:metrics-summary}\n"
            "  \\begin{tabular}{lllll}\n"
            "    \\toprule\n"
            "    Criterion & Type & Status & Expected & Observed \\\\\n"
            "    \\midrule\n" + "\n".join(rows) + "\n"
            "    \\bottomrule\n"
            "  \\end{tabular}\n"
            "\\end{table}\n"
        )

        return RenderOutput(
            id="metrics-summary",
            filename="metrics-summary.tex",
            content=content,
            format="latex",
        )

    def _render_exploratory_evaluation(self, evaluation: dict[str, Any]) -> RenderOutput:
        """Render exploratory evaluation output."""
        data = evaluation.get("data", {})
        rankings = data.get("rankings", {})
        pairwise = data.get("pairwiseComparisons", [])
        case_class_effects = data.get("caseClassEffects", [])
        metric_correlations = data.get("metricCorrelations", [])

        sections: list[str] = []

        # Section 1: Rankings
        sections.append(self._render_sut_rankings(rankings))

        # Section 2: Significant pairwise comparisons
        significant = [c for c in pairwise if c.get("significant")]
        if significant:
            sections.append(self._render_pairwise_comparisons(significant))

        # Section 3: Case-class effects
        if case_class_effects:
            sig_effects = [e for e in case_class_effects if e.get("significant")]
            if sig_effects:
                sections.append(self._render_case_class_effects(sig_effects))

        # Section 4: Metric correlations
        if metric_correlations:
            sections.append(self._render_metric_correlations(metric_correlations))

        content = "\n\n".join(sections)

        return RenderOutput(
            id="exploratory-analysis",
            filename="exploratory-analysis.tex",
            content=content,
            format="latex",
        )

    def _render_sut_rankings(self, rankings: dict[str, list[dict[str, Any]]]) -> str:
        """Render SUT rankings tables."""
        tables: list[str] = []

        for metric, sut_rankings in rankings.items():
            if not sut_rankings:
                continue

            rows: list[str] = []
            for ranking in sut_rankings:
                mean = self.format_number(ranking.get("mean", 0), 3)
                median = self.format_number(ranking.get("median", 0), 3)
                std = (
                    self.format_number(ranking["std"], 3)
                    if ranking.get("std") is not None
                    else "--"
                )

                rows.append(
                    f"    {ranking.get('rank', 0)} & {escape_latex(ranking.get('sut', ''))} "
                    f"& {mean} & {median} & {std} & {ranking.get('n', 0)} \\\\"
                )

            safe_label = re.sub(r"[^a-z0-9]", "-", metric, flags=re.IGNORECASE)
            caption = f"SUT rankings for metric: {escape_latex(metric)}"

            tables.append(
                "\\begin{table}[htbp]\n"
                "  \\centering\n"
                f"  \\caption{{{caption}}}\n"
                f"  \\label{{tab:ranking-{safe_label}}}\n"
                "  \\begin{tabular}{rlrrrr}\n"
                "    \\toprule\n"
                "    Rank & SUT & Mean & Median & Std & N \\\\\n"
                "    \\midrule\n" + "\n".join(rows) + "\n"
                "    \\bottomrule\n"
                "  \\end{tabular}\n"
                "\\end{table}"
            )

        return "\n\n".join(tables)

    def _render_pairwise_comparisons(self, comparisons: list[dict[str, Any]]) -> str:
        """Render pairwise comparisons table."""
        rows: list[str] = []

        for comp in comparisons:
            delta = self.format_number(comp.get("delta", 0), 3)
            p_value = (
                self.format_number(comp["pValue"], 4) if comp.get("pValue") is not None else "--"
            )
            effect_size = (
                self.format_number(comp["effectSize"], 3)
                if comp.get("effectSize") is not None
                else "--"
            )

            rows.append(
                f"    {escape_latex(comp.get('sutA', ''))} & "
                f"{escape_latex(comp.get('sutB', ''))} & "
                f"{escape_latex(comp.get('metric', ''))} & "
                f"{delta} & {p_value} & {effect_size} \\\\"
            )

        caption = f"Significant pairwise differences ({len(comparisons)} found)"

        return (
            "\\begin{table}[htbp]\n"
            "  \\centering\n"
            f"  \\caption{{{caption}}}\n"
            "  \\label{tab:pairwise-comparisons}\n"
            "  \\begin{tabular}{llllll}\n"
            "    \\toprule\n"
            "    SUT A & SUT B & Metric & Delta & p-value & Effect Size \\\\\n"
            "    \\midrule\n" + "\n".join(rows) + "\n"
            "    \\bottomrule\n"
            "  \\end{tabular}\n"
            "\\end{table}"
        )

    def _render_case_class_effects(self, effects: list[dict[str, Any]]) -> str:
        """Render case-class effects table."""
        rows: list[str] = []

        for effect in effects:
            deviation = self.format_number(effect.get("deviationFromMean", 0), 3)
            percentage = (
                self.format_number(effect["percentageDeviation"], 1)
                if effect.get("percentageDeviation") is not None
                else "--"
            )

            rows.append(
                f"    {escape_latex(effect.get('caseClass', ''))} & "
                f"{escape_latex(effect.get('sut', ''))} & "
                f"{escape_latex(effect.get('metric', ''))} & "
                f"{deviation} & {percentage}\\% \\\\"
            )

        caption = f"Significant case-class effects ({len(effects)} found)"

        return (
            "\\begin{table}[htbp]\n"
            "  \\centering\n"
            f"  \\caption{{{caption}}}\n"
            "  \\label{tab:case-class-effects}\n"
            "  \\begin{tabular}{lllrr}\n"
            "    \\toprule\n"
            "    Case Class & SUT & Metric & Deviation & \\% Deviation \\\\\n"
            "    \\midrule\n" + "\n".join(rows) + "\n"
            "    \\bottomrule\n"
            "  \\end{tabular}\n"
            "\\end{table}"
        )

    def _render_metric_correlations(self, correlations: list[dict[str, Any]]) -> str:
        """Render metric correlations table."""
        rows: list[str] = []

        for corr in correlations:
            pearson = self.format_number(corr.get("pearsonR", 0), 3)
            spearman = (
                self.format_number(corr["spearmanRho"], 3)
                if corr.get("spearmanRho") is not None
                else "--"
            )

            rows.append(
                f"    {escape_latex(corr.get('metricA', ''))} & "
                f"{escape_latex(corr.get('metricB', ''))} & "
                f"{pearson} & {spearman} & "
                f"{escape_latex(corr.get('interpretation', ''))} \\\\"
            )

        return (
            "\\begin{table}[htbp]\n"
            "  \\centering\n"
            "  \\caption{Metric correlations}\n"
            "  \\label{tab:metric-correlations}\n"
            "  \\begin{tabular}{lllll}\n"
            "    \\toprule\n"
            "    Metric A & Metric B & Pearson r & Spearman $\\rho$ & Interpretation \\\\\n"
            "    \\midrule\n" + "\n".join(rows) + "\n"
            "    \\bottomrule\n"
            "  \\end{tabular}\n"
            "\\end{table}"
        )

    def _render_custom_evaluation(self, evaluation: dict[str, Any]) -> RenderOutput:
        """Render custom evaluation output (generic fallback)."""
        eval_type = evaluation.get("type", "unknown")
        content = (
            "\\begin{verbatim}\n"
            + json.dumps(evaluation, indent=2, default=str)
            + "\n\\end{verbatim}\n"
        )

        return RenderOutput(
            id=f"custom-{eval_type}",
            filename=f"custom-{eval_type}.tex",
            content=content,
            format="latex",
        )

    def render_claim_summary(self, evaluations: list[dict[str, Any]]) -> RenderOutput:
        """Render claim evaluation summary."""
        rows: list[str] = []
        for evaluation in evaluations:
            claim = evaluation.get("claim", {})
            status = evaluation.get("status", "")
            evidence = evaluation.get("evidence", {})

            symbol = getattr(self.claim_status, status, status)
            delta = self.format_number(evidence.get("delta", 0), 3)
            p_value = (
                self.format_number(evidence["pValue"], 4)
                if evidence.get("pValue") is not None
                else "--"
            )

            rows.append(
                f"    {escape_latex(claim.get('claimId', ''))} & "
                f"{escape_latex(claim.get('description', ''))} & "
                f"${symbol}$ & {delta} & {p_value} \\\\"
            )

        satisfied = sum(1 for e in evaluations if e.get("status") == "satisfied")
        violated = sum(1 for e in evaluations if e.get("status") == "violated")
        inconclusive = sum(1 for e in evaluations if e.get("status") == "inconclusive")

        caption = (
            f"Claim evaluation summary. {satisfied} satisfied,"
            f" {violated} violated, {inconclusive} inconclusive."
        )

        content = (
            "\\begin{table}[htbp]\n"
            "  \\centering\n"
            f"  \\caption{{{caption}}}\n"
            "  \\label{tab:claim-summary}\n"
            "  \\begin{tabular}{llccc}\n"
            "    \\toprule\n"
            "    Claim & Description & Status & Delta & p-value \\\\\n"
            "    \\midrule\n" + "\n".join(rows) + "\n"
            "    \\bottomrule\n"
            "  \\end{tabular}\n"
            "\\end{table}\n"
        )

        return RenderOutput(
            id="claim-summary",
            filename="claim-summary.tex",
            content=content,
            format="latex",
        )

    def _build_table(
        self,
        data: list[dict[str, Any]],
        columns: list[ColumnSpec],
        caption: str,
        label: str,
    ) -> str:
        """Build a LaTeX table from data."""
        column_spec = "".join(c.align for c in columns)
        headers = " & ".join(c.header for c in columns)

        rows: list[str] = []
        for row in data:
            cells: list[str] = []
            for col in columns:
                value = row.get(col.key)
                if col.format_fn is not None:
                    formatted = col.format_fn(value)
                else:
                    formatted = self._format_value(value)
                if col.bold:
                    formatted = f"\\textbf{{{formatted}}}"
                cells.append(formatted)
            rows.append(f"    {' & '.join(cells)} \\\\")

        if self.booktabs:
            top = r"\toprule"
            mid = r"\midrule"
            bottom = r"\bottomrule"
        else:
            top = r"\hline"
            mid = r"\hline"
            bottom = r"\hline"

        return (
            "\\begin{table}[htbp]\n"
            "  \\centering\n"
            f"  \\caption{{{caption}}}\n"
            f"  \\label{{{label}}}\n"
            f"  \\begin{{tabular}}{{{column_spec}}}\n"
            f"    {top}\n"
            f"    {headers} \\\\\n"
            f"    {mid}\n" + "\n".join(rows) + "\n"
            f"    {bottom}\n"
            "  \\end{tabular}\n"
            "\\end{table}\n"
        )

    def _format_value(self, value: Any) -> str:
        """Format a value for LaTeX."""
        if value is None:
            return "--"
        if isinstance(value, float | int):
            return self.format_number(value)
        if isinstance(value, str):
            return escape_latex(value)
        return escape_latex(json.dumps(value, default=str))

    def format_number(self, n: float | int | None, decimals: int | None = None) -> str:
        """Format a number with configurable decimals."""
        if n is None or (isinstance(n, float) and not math.isfinite(n)):
            return "--"
        dec = decimals if decimals is not None else self.default_decimals
        return f"{n:.{dec}f}"

    def format_speedup(self, ratio: float) -> str:
        """Format a speedup ratio."""
        if not math.isfinite(ratio):
            return "--"
        return f"${ratio:.2f}\\times$"

    def format_percentage(self, n: float) -> str:
        """Format a percentage."""
        if not math.isfinite(n):
            return "--"
        return f"{round(n)}\\%"


def create_latex_renderer(**kwargs: Any) -> LaTeXRenderer:
    """Create a LaTeX renderer with options."""
    return LaTeXRenderer(**kwargs)
