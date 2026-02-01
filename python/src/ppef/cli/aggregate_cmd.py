"""Aggregate Command.

Aggregates existing results from a JSON file.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Annotated, Any, cast

import typer

from ppef.aggregation.aggregators import compute_summary_stats
from ppef.cli.output_writer import write_aggregates


def aggregate(
    results_file: Annotated[str, typer.Argument(help="Path to results JSON file")],
    output: Annotated[str | None, typer.Option("-o", "--output", help="Output file path")] = None,
    fmt: Annotated[
        str, typer.Option("-f", "--format", help="Output format (json or json-pretty)")
    ] = "json-pretty",
    compute_comparisons: Annotated[
        bool, typer.Option("--compute-comparisons", help="Compute comparisons with baselines")
    ] = True,
) -> None:
    """Aggregate existing results from a JSON file."""
    try:
        typer.echo("=" * 60)
        typer.echo("Aggregating Results")
        typer.echo("=" * 60)

        # Read results file
        typer.echo(f"Reading results from: {results_file}")
        content = Path(results_file).read_text(encoding="utf-8")
        data: dict[str, Any] = json.loads(content)

        if "results" not in data or not isinstance(data["results"], list):
            typer.echo("Error: Invalid results file: missing or invalid 'results' array", err=True)
            raise SystemExit(1)

        results: list[dict[str, Any]] = cast(list[dict[str, Any]], data["results"])
        typer.echo(f"Found {len(results)} results")

        # Aggregate: group by SUT
        typer.echo("\nComputing aggregations...")
        by_sut: dict[str, list[dict[str, Any]]] = {}
        for r in results:
            sut_id = r.get("run", {}).get("sut", "unknown")
            by_sut.setdefault(sut_id, []).append(r)

        aggregates: list[dict[str, Any]] = []
        for sut_id, sut_results in by_sut.items():
            # Collect all metric names
            metric_names: set[str] = set()
            for r in sut_results:
                metric_names.update(r.get("metrics", {}).get("numeric", {}).keys())

            metrics_summary: dict[str, dict[str, Any]] = {}
            for metric_name in sorted(metric_names):
                values = [
                    r["metrics"]["numeric"][metric_name]
                    for r in sut_results
                    if metric_name in r.get("metrics", {}).get("numeric", {})
                ]
                if values:
                    stats = compute_summary_stats(values)
                    metrics_summary[metric_name] = {
                        "n": stats.n,
                        "mean": stats.mean,
                        "median": stats.median,
                        "min": stats.min,
                        "max": stats.max,
                        "std": stats.std,
                        "confidence95": list(stats.confidence95) if stats.confidence95 else None,
                        "p25": stats.p25,
                        "p75": stats.p75,
                    }

            sut_role = sut_results[0].get("run", {}).get("sutRole", "primary")
            case_ids = {r.get("run", {}).get("caseId", "") for r in sut_results}

            agg_entry: dict[str, Any] = {
                "sut": sut_id,
                "sutRole": sut_role,
                "group": {
                    "runCount": len(sut_results),
                    "caseCount": len(case_ids),
                },
                "correctness": {},
                "metrics": metrics_summary,
            }

            # Compute comparisons with baselines if requested
            if compute_comparisons and sut_role == "primary":
                from ppef.aggregation.aggregators import compute_comparison

                comparisons: dict[str, Any] = {}
                for other_sut_id, other_results in by_sut.items():
                    other_role = other_results[0].get("run", {}).get("sutRole", "primary")
                    if other_role == "baseline":
                        for metric_name in sorted(metric_names):
                            comparison = compute_comparison(sut_results, other_results, metric_name)
                            comparisons[other_sut_id] = comparison
                if comparisons:
                    agg_entry["comparisons"] = comparisons

            aggregates.append(agg_entry)

        # Build aggregation output
        aggregation_output: dict[str, Any] = {
            "version": "1.0.0",
            "timestamp": datetime.now(tz=UTC).isoformat(),
            "aggregates": aggregates,
            "results": results,
        }

        # Determine output path
        output_path = output or results_file.replace("-results-", "-aggregates-")

        # Write aggregates
        typer.echo("\nWriting aggregates...")
        write_aggregates(aggregation_output, output_path, fmt)
        typer.echo(f"Aggregates written to: {output_path}")

        # Display summary
        typer.echo(f"\n{'=' * 60}")
        typer.echo("Aggregation Summary")
        typer.echo(f"{'=' * 60}")
        for agg in aggregates:
            case_class = agg.get("caseClass")
            suffix = f" ({case_class})" if case_class else ""
            typer.echo(f"{agg['sut']}{suffix}:")
            typer.echo(f"  Runs: {agg['group']['runCount']}")
            typer.echo(f"  Cases: {agg['group']['caseCount']}")

            if agg.get("metrics"):
                typer.echo("  Metrics:")
                for metric_name, stats in agg["metrics"].items():
                    std = stats.get("std", 0) or 0
                    typer.echo(
                        f"    {metric_name}: mean={stats['mean']:.2f}, "
                        f"median={stats['median']:.2f}, std={std:.2f}"
                    )

            if agg.get("comparisons"):
                typer.echo("  Comparisons:")
                for baseline, comparison in agg["comparisons"].items():
                    typer.echo(f"    vs {baseline}:")
                    if comparison.get("pValue") is not None:
                        typer.echo(f"      p-value: {comparison['pValue']:.4f}")
                    if comparison.get("effectSize") is not None:
                        typer.echo(f"      effect size: {comparison['effectSize']:.4f}")

        typer.echo("\nAggregation completed successfully!")

    except SystemExit:
        raise
    except Exception as exc:
        typer.echo(f"Error: {exc}", err=True)
        raise SystemExit(1) from exc
