"""Plan Command.

Shows execution plan without running experiments.
"""

from __future__ import annotations

from collections import defaultdict
from typing import Annotated, Any

import typer

from ppef.cli.config_loader import load_and_validate_config
from ppef.cli.module_loader import load_case_definition, load_sut_factory


def plan(
    config_file: Annotated[str, typer.Argument(help="Path to experiment configuration JSON file")],
) -> None:
    """Show execution plan without running experiments."""
    try:
        typer.echo("=" * 60)
        typer.echo("Execution Plan")
        typer.echo("=" * 60)

        loaded = load_and_validate_config(config_file)
        config = loaded.config
        base_dir = loaded.base_dir

        # Load SUTs
        typer.echo("\nLoading SUTs...")
        sut_definitions: list[dict[str, Any]] = []
        for sut_config in config["suts"]:
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

        # Load cases
        typer.echo("Loading cases...")
        case_definitions: list[dict[str, Any]] = []
        for case_config in config["cases"]:
            case_def = load_case_definition(
                case_config["module"],
                case_config["exportName"],
                base_dir,
            )
            case_definitions.append(case_def)

        # Plan runs
        typer.echo("Planning runs...")
        repetitions = config.get("executor", {}).get("repetitions", 1)
        seed_base = config.get("executor", {}).get("seedBase", 0)

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

        typer.echo(f"\nTotal planned runs: {len(planned_runs)}")

        # Group by SUT
        by_sut: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for run_info in planned_runs:
            by_sut[run_info["sutId"]].append(run_info)

        for sut_id, runs in by_sut.items():
            typer.echo(f"\n{sut_id}")
            typer.echo("-" * 40)

            # Group by case class
            by_case_class: dict[str, list[dict[str, Any]]] = defaultdict(list)
            for run_info in runs:
                case_def = next(
                    (
                        c
                        for c in case_definitions
                        if (c.get("case", {}) if isinstance(c, dict) else c).get("caseId", "")
                        == run_info["caseId"]
                        or getattr((c.get("case", {}) if isinstance(c, dict) else c), "caseId", "")
                        == run_info["caseId"]
                    ),
                    None,
                )
                case_class = "uncategorized"
                if case_def is not None:
                    cd = case_def.get("case", {}) if isinstance(case_def, dict) else case_def
                    case_class = (
                        cd.get("caseClass")
                        if isinstance(cd, dict)
                        else getattr(cd, "caseClass", None)
                    ) or "uncategorized"
                by_case_class[case_class].append(run_info)

            for case_class, class_runs in by_case_class.items():
                typer.echo(f"  {case_class}: {len(class_runs)} runs")

        # Schema validation status
        schemas = config.get("schemas", {})
        has_input_schema = bool(schemas.get("input"))
        has_output_schema = bool(schemas.get("output"))
        sut_overrides = sum(1 for s in config.get("suts", []) if s.get("outputSchema"))
        case_overrides = sum(1 for c in config.get("cases", []) if c.get("inputSchema"))

        if has_input_schema or has_output_schema or sut_overrides > 0 or case_overrides > 0:
            typer.echo("\nSchema Validation")
            typer.echo("-" * 40)
            parts: list[str] = []
            if has_input_schema:
                props = schemas.get("input", {}).get("properties", {})
                parts.append(f"input ({len(props)} properties)")
            if has_output_schema:
                props = schemas.get("output", {}).get("properties", {})
                parts.append(f"output ({len(props)} properties)")
            if parts:
                typer.echo(f"  Experiment-level: {', '.join(parts)}")
            if sut_overrides > 0:
                typer.echo(f"  Per-SUT output overrides: {sut_overrides}")
            if case_overrides > 0:
                typer.echo(f"  Per-case input overrides: {case_overrides}")

        typer.echo("\nExecution plan validated successfully!")

    except SystemExit:
        raise
    except Exception as exc:
        typer.echo(f"Error: {exc}", err=True)
        raise SystemExit(1) from exc
