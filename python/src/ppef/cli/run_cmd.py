"""Run Command.

Executes experiments based on JSON configuration.
"""

from __future__ import annotations

import sys
import time
from datetime import UTC
from typing import Annotated, Any

import typer

from ppef.cli.config_loader import load_and_validate_config
from ppef.cli.module_loader import (
    load_case_definition,
    load_metrics_extractor,
    load_sut_factory,
)
from ppef.cli.output_writer import (
    generate_output_filename,
    write_aggregates,
    write_results,
)


def run(
    config_file: Annotated[str, typer.Argument(help="Path to experiment configuration JSON file")],
    output: Annotated[str | None, typer.Option("-o", "--output", help="Output directory")] = None,
    fmt: Annotated[
        str, typer.Option("-f", "--format", help="Output format (json or json-pretty)")
    ] = "json-pretty",
    jobs: Annotated[int | None, typer.Option("-j", "--jobs", help="Override concurrency")] = None,
    verbose: Annotated[bool, typer.Option("-v", "--verbose", help="Verbose logging")] = False,
    quiet: Annotated[bool, typer.Option("-q", "--quiet", help="Suppress output")] = False,
    dry_run: Annotated[bool, typer.Option("--dry-run", help="Plan without running")] = False,
    unsafe_in_process: Annotated[
        bool, typer.Option("--unsafe-in-process", help="Run in-process without worker isolation")
    ] = False,
) -> None:
    """Run experiments from a configuration file."""
    try:
        _print = (lambda *_a, **_kw: None) if quiet else typer.echo

        _print(f"{'=' * 60}")
        _print(f"Experiment: {'Dry Run' if dry_run else 'Execution'}")
        _print(f"{'=' * 60}")

        # Load and validate configuration
        loaded = load_and_validate_config(config_file)
        config = loaded.config
        base_dir = loaded.base_dir

        _print(f"Configuration: {loaded.config_path}")
        _print(f"Experiment: {config['experiment']['name']}")
        if config["experiment"].get("description"):
            _print(f"Description: {config['experiment']['description']}")

        # Apply CLI overrides
        executor_config: dict[str, Any] = {**config.get("executor", {})}
        executor_config["base_dir"] = str(base_dir)
        if jobs is not None:
            executor_config["concurrency"] = jobs
            if verbose:
                _print(f"Concurrency overridden to {jobs}")

        if unsafe_in_process:
            executor_config["force_in_process"] = True
            typer.echo("WARNING: Running in-process without worker isolation", err=True)

        # Load SUTs
        _print("\nLoading SUTs...")
        sut_definitions: list[dict[str, Any]] = []
        for sut_config in config["suts"]:
            if verbose:
                _print(f"  Loading SUT: {sut_config['id']} from {sut_config['module']}")
            sut_def = load_sut_factory(
                sut_config["module"],
                sut_config["exportName"],
                base_dir,
                {
                    "id": sut_config["id"],
                    "name": sut_config["registration"]["name"],
                    "version": sut_config["registration"]["version"],
                    "role": sut_config["registration"]["role"],
                    "config": sut_config.get("config", {}),
                    "tags": sut_config["registration"].get("tags", []),
                    "description": sut_config["registration"].get("description"),
                },
                sut_config.get("config"),
            )
            sut_definitions.append(sut_def)
        _print(f"Loaded {len(sut_definitions)} SUTs")

        # Load cases
        _print("\nLoading cases...")
        case_definitions: list[dict[str, Any]] = []
        for case_config in config["cases"]:
            if verbose:
                _print(f"  Loading case: {case_config['id']} from {case_config['module']}")
            case_def = load_case_definition(
                case_config["module"],
                case_config["exportName"],
                base_dir,
            )
            case_definitions.append(case_def)
        _print(f"Loaded {len(case_definitions)} cases")

        # Load metrics extractor
        _print("\nLoading metrics extractor...")
        metrics_extractor = load_metrics_extractor(
            config["metricsExtractor"]["module"],
            config["metricsExtractor"]["exportName"],
            base_dir,
        )
        _print(f"Metrics extractor loaded from {config['metricsExtractor']['module']}")

        # Plan runs
        _print("\nPlanning execution...")
        repetitions = executor_config.get("repetitions", 1)
        seed_base = executor_config.get("seedBase", 0)
        planned_runs: list[dict[str, Any]] = []
        for sut_def in sut_definitions:
            for case_def in case_definitions:
                case_data = case_def.get("case", {}) if isinstance(case_def, dict) else case_def
                case_id = (
                    case_data.get("caseId", "")
                    if isinstance(case_data, dict)
                    else getattr(case_data, "caseId", "")
                )
                for rep in range(repetitions):
                    planned_runs.append(
                        {
                            "sutId": sut_def["id"],
                            "caseId": case_id,
                            "repetition": rep,
                            "seed": seed_base + rep,
                        }
                    )
        _print(f"Planned {len(planned_runs)} runs")

        # Dry run - show plan and exit
        if dry_run:
            _print("\nDry run - not executing")
            _print(f"SUTs: {', '.join(s['id'] for s in sut_definitions)}")
            case_ids = []
            for c in case_definitions:
                cd = c.get("case", {}) if isinstance(c, dict) else c
                case_ids.append(
                    cd.get("caseId", "") if isinstance(cd, dict) else getattr(cd, "caseId", "")
                )
            _print(f"Cases: {', '.join(case_ids)}")
            _print(f"Total runs: {len(planned_runs)}")
            return

        # Execute
        _print("\nExecuting...")
        start_time = time.monotonic()

        results: list[dict[str, Any]] = []
        successful = 0
        failed = 0
        errors_list: list[dict[str, str]] = []

        for run_plan in planned_runs:
            try:
                # Find the SUT and case
                sut_def = next(s for s in sut_definitions if s["id"] == run_plan["sutId"])
                sut_instance = sut_def["factory"]()

                case_def = next(
                    c
                    for c in case_definitions
                    if (c.get("case", {}) if isinstance(c, dict) else c).get("caseId", "")
                    == run_plan["caseId"]
                    or getattr((c.get("case", {}) if isinstance(c, dict) else c), "caseId", "")
                    == run_plan["caseId"]
                )

                get_inputs_fn = (
                    case_def.get("getInputs")
                    if isinstance(case_def, dict)
                    else getattr(case_def, "getInputs", None)
                )
                if get_inputs_fn is None:
                    msg = f"Case {run_plan['caseId']} missing getInputs"
                    raise ValueError(msg)

                inputs = get_inputs_fn()
                run_fn = (
                    sut_instance.get("run") if isinstance(sut_instance, dict) else sut_instance.run
                )

                import asyncio

                if asyncio.iscoroutinefunction(run_fn):
                    result_output = asyncio.run(run_fn(inputs))
                else:
                    result_output = run_fn(inputs)

                metrics = metrics_extractor(result_output)

                from ppef.executor.run_id import generate_run_id

                run_id = generate_run_id(
                    sut_id=run_plan["sutId"],
                    case_id=run_plan["caseId"],
                    config=sut_instance.get("config", {}),
                    seed=run_plan["seed"],
                    repetition=run_plan["repetition"],
                )

                result_entry: dict[str, Any] = {
                    "run": {
                        "runId": run_id,
                        "sut": run_plan["sutId"],
                        "sutRole": sut_def["registration"]["role"],
                        "caseId": run_plan["caseId"],
                        "seed": run_plan["seed"],
                        "repetition": run_plan["repetition"],
                    },
                    "correctness": {
                        "expectedExists": False,
                        "producedOutput": True,
                        "valid": True,
                        "matchesExpected": None,
                    },
                    "outputs": {"summary": {}},
                    "metrics": {"numeric": metrics},
                    "provenance": {"runtime": {"python": sys.version}},
                }
                results.append(result_entry)
                successful += 1
            except Exception as exc:
                failed += 1
                errors_list.append(
                    {
                        "runId": (
                            f"{run_plan['sutId']}-{run_plan['caseId']}-{run_plan['repetition']}"
                        ),
                        "error": str(exc),
                    }
                )
                if not config.get("executor", {}).get("continueOnError", True):
                    raise

        elapsed = time.monotonic() - start_time

        # Report results
        _print(f"\n{'=' * 60}")
        _print("Execution Summary")
        _print(f"{'=' * 60}")
        _print(f"Total runs: {successful + failed}")
        _print(f"Successful: {successful}")
        _print(f"Failed: {failed}")
        _print(f"Elapsed time: {elapsed:.2f}s")

        if errors_list:
            _print(f"\nErrors encountered: {len(errors_list)}")
            for err in errors_list[:5]:
                _print(f"  - {err['runId']}: {err['error']}")
            if len(errors_list) > 5:
                _print(f"  ... and {len(errors_list) - 5} more")

        # Write results
        output_config = config.get("output", {})
        output_path = output or output_config.get("path", "./results")
        output_format = fmt or output_config.get("format", "json-pretty")
        should_aggregate = output_config.get("aggregate", True)

        _print("\nWriting results...")
        results_filename = generate_output_filename(config["experiment"]["name"], "results")
        results_path = f"{output_path}/{results_filename}"
        write_results(results, results_path, output_format)
        _print(f"Results written to: {results_path}")

        # Aggregate if requested
        if should_aggregate and results:
            _print("\nAggregating results...")
            from ppef.aggregation.aggregators import compute_summary_stats

            # Group by SUT
            by_sut: dict[str, list[dict[str, Any]]] = {}
            for r in results:
                sut_id = r["run"]["sut"]
                by_sut.setdefault(sut_id, []).append(r)

            aggregates: list[dict[str, Any]] = []
            for sut_id, sut_results in by_sut.items():
                # Collect all metric names
                metric_names: set[str] = set()
                for r in sut_results:
                    metric_names.update(r.get("metrics", {}).get("numeric", {}).keys())

                metrics_summary: dict[str, Any] = {}
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
                        }

                sut_role = sut_results[0]["run"].get("sutRole", "primary")
                aggregates.append(
                    {
                        "sut": sut_id,
                        "sutRole": sut_role,
                        "group": {
                            "runCount": len(sut_results),
                            "caseCount": len({r["run"]["caseId"] for r in sut_results}),
                        },
                        "correctness": {},
                        "metrics": metrics_summary,
                    }
                )

            from datetime import datetime

            aggregation_output: dict[str, Any] = {
                "version": "1.0.0",
                "timestamp": datetime.now(tz=UTC).isoformat(),
                "aggregates": aggregates,
            }

            aggregates_filename = generate_output_filename(
                config["experiment"]["name"], "aggregates"
            )
            aggregates_path = f"{output_path}/{aggregates_filename}"
            write_aggregates(aggregation_output, aggregates_path, output_format)
            _print(f"Aggregates written to: {aggregates_path}")

            _print("\nAggregation Summary")
            for agg in aggregates:
                _print(f"{agg['sut']}:")
                _print(f"  Runs: {agg['group']['runCount']}")
                _print(f"  Cases: {agg['group']['caseCount']}")
                for metric_name, stats in agg["metrics"].items():
                    std = stats.get("std", 0) or 0
                    _print(f"  {metric_name}: mean={stats['mean']:.2f}, std={std:.2f}")

        _print("\nExperiment completed successfully!")

    except SystemExit:
        raise
    except Exception as exc:
        typer.echo(f"Error: {exc}", err=True)
        if verbose:
            import traceback

            traceback.print_exc()
        raise SystemExit(1) from exc
