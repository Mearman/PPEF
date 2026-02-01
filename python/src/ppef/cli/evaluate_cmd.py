"""Evaluate Command.

Evaluates results using the extensible evaluator system.
Supports claims, robustness, metrics, exploratory, and custom evaluators.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Annotated, Any

import typer

from ppef.types.evaluator import EvaluationType

VALID_EVALUATION_TYPES: set[str] = {"claims", "robustness", "metrics", "exploratory", "custom"}
VALID_OUTPUT_FORMATS: set[str] = {"json", "json-pretty", "latex", "markdown"}


def _to_evaluation_type(value: str) -> EvaluationType:
    """Convert string to EvaluationType."""
    if value not in VALID_EVALUATION_TYPES:
        valid = ", ".join(sorted(VALID_EVALUATION_TYPES))
        msg = f"Invalid evaluation type: {value}. Must be one of: {valid}"
        raise typer.BadParameter(msg)
    return value  # type: ignore[return-value]


def evaluate(
    aggregates_file: Annotated[str, typer.Argument(help="Path to aggregates JSON file")],
    eval_type: Annotated[
        str,
        typer.Option(
            "-t", "--type", help="Evaluation type (claims|robustness|metrics|exploratory|custom)"
        ),
    ] = "",
    config: Annotated[
        str | None, typer.Option("-c", "--config", help="Evaluator configuration JSON file")
    ] = None,
    output: Annotated[str | None, typer.Option("-o", "--output", help="Output file path")] = None,
    fmt: Annotated[
        str, typer.Option("-f", "--format", help="Output format (json|json-pretty|latex|markdown)")
    ] = "json-pretty",
    verbose: Annotated[
        bool, typer.Option("-v", "--verbose", help="Verbose output with summary statistics")
    ] = False,
) -> None:
    """Evaluate results using the extensible evaluator system."""
    try:
        if not eval_type:
            typer.echo("Error: --type is required", err=True)
            raise SystemExit(1)

        evaluation_type = _to_evaluation_type(eval_type)

        typer.echo("=" * 60)
        typer.echo("Evaluating Results")
        typer.echo("=" * 60)

        # Load aggregates
        typer.echo(f"Reading aggregates from: {aggregates_file}")
        content = Path(aggregates_file).read_text(encoding="utf-8")
        data: dict[str, Any] = json.loads(content)

        # Determine if file has aggregates or raw results
        has_aggregates = isinstance(data.get("aggregates"), list)
        has_results = isinstance(data.get("results"), list)

        aggregates: list[dict[str, Any]]
        raw_results: list[dict[str, Any]] | None = None

        if has_aggregates:
            aggregates = data["aggregates"]
            typer.echo(f"Found {len(aggregates)} aggregated results")
            if has_results:
                raw_results = data["results"]
        elif has_results:
            typer.echo(f"Found {len(data['results'])} raw results - need to aggregate first")
            typer.echo(
                "Error: Please run 'ppef aggregate' on the results file first,"
                " or use an aggregates file",
                err=True,
            )
            raise SystemExit(1)
        else:
            typer.echo(
                "Error: Invalid file: must contain 'aggregates' or 'results' array", err=True
            )
            raise SystemExit(1)

        # Load evaluator config
        raw_config: dict[str, Any] = {}
        if config is not None:
            typer.echo(f"Loading evaluator config from: {config}")
            config_content = Path(config).read_text(encoding="utf-8")
            raw_config = json.loads(config_content)
        else:
            typer.echo("Warning: No evaluator config provided - using default empty config")

        typer.echo(f"Evaluator type: {evaluation_type}")

        # Get evaluator from registry
        from ppef.evaluators.registry import EvaluatorRegistry

        evaluator = EvaluatorRegistry.get(evaluation_type)
        if evaluator is None:
            typer.echo(f"Error: Evaluator not found for type: {evaluation_type}", err=True)
            raise SystemExit(1)

        # Validate config
        typer.echo("\nValidating evaluator configuration...")
        validation = evaluator.validate_config(raw_config)
        if not validation.valid:
            typer.echo("Error: Evaluator configuration validation failed:", err=True)
            for err in validation.errors or []:
                typer.echo(f"  - {err}", err=True)
            raise SystemExit(1)
        if validation.warnings:
            typer.echo("Configuration warnings:")
            for warning in validation.warnings:
                typer.echo(f"  - {warning}")
        typer.echo("Configuration valid")

        # Prepare context
        context: dict[str, Any] = {
            "aggregates": aggregates,
            "rawResults": raw_results,
            "metadata": {"source": aggregates_file},
        }

        # Run evaluation
        typer.echo("\nRunning evaluation...")
        if evaluation_type == "robustness":
            if not raw_results:
                typer.echo(
                    "Error: Robustness evaluation requires raw results, but none found", err=True
                )
                raise SystemExit(1)
            eval_output = evaluator.evaluate(raw_config, raw_results)
        else:
            eval_output = evaluator.evaluate(raw_config, context)

        summary = evaluator.summarize(eval_output)
        typer.echo(f"Evaluation complete: {evaluation_type}")

        # Display summary
        if verbose:
            typer.echo(f"\n{'=' * 60}")
            typer.echo("Evaluation Summary")
            typer.echo(f"{'=' * 60}")
            typer.echo(f"Total items: {summary.get('total', 0)}")
            if summary.get("passed") is not None:
                typer.echo(f"Passed: {summary['passed']}")
            if summary.get("failed") is not None:
                typer.echo(f"Failed: {summary['failed']}")
            if summary.get("inconclusive") is not None:
                typer.echo(f"Inconclusive: {summary['inconclusive']}")
            if summary.get("passRate") is not None:
                typer.echo(f"Pass rate: {summary['passRate'] * 100:.1f}%")
            if summary.get("additional"):
                typer.echo("Additional:")
                for key, value in summary["additional"].items():
                    typer.echo(f"  {key}: {value}")

        # Determine output path
        output_format = fmt if fmt in VALID_OUTPUT_FORMATS else "json-pretty"
        default_output_name = aggregates_file.replace(
            "-aggregates", f"-evaluation-{evaluation_type}"
        )
        output_path = output or default_output_name

        # Format and write output
        typer.echo("\nWriting output...")
        if output_format == "latex":
            from ppef.renderers.latex import LaTeXRenderer

            renderer = LaTeXRenderer()
            rendered = renderer.render_evaluation(eval_output)
            output_filename = output or rendered["filename"]
            Path(output_filename).write_text(rendered["content"], encoding="utf-8")
        else:
            indent = 2 if output_format == "json-pretty" else None
            output_content = json.dumps(eval_output, indent=indent, default=str)
            output_filename = (
                output_path if output_path.endswith(".json") else f"{output_path}.json"
            )
            Path(output_filename).parent.mkdir(parents=True, exist_ok=True)
            Path(output_filename).write_text(output_content, encoding="utf-8")

        typer.echo(f"Output written to: {output_filename}")
        typer.echo("\nEvaluation completed successfully!")

    except SystemExit:
        raise
    except Exception as exc:
        typer.echo(f"Error: {exc}", err=True)
        if verbose:
            import traceback

            traceback.print_exc()
        raise SystemExit(1) from exc
