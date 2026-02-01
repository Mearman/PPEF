"""Validate Command.

Validates experiment configuration files without running experiments.
"""

from __future__ import annotations

from typing import Annotated

import typer

from ppef.cli.config_loader import load_and_validate_config


def validate(
    config_file: Annotated[str, typer.Argument(help="Path to experiment configuration JSON file")],
) -> None:
    """Validate an experiment configuration file."""
    try:
        typer.echo("=" * 60)
        typer.echo("Configuration Validation")
        typer.echo("=" * 60)

        loaded = load_and_validate_config(config_file)
        config = loaded.config

        typer.echo(f"Configuration file: {loaded.config_path}")
        typer.echo(f"Base directory: {loaded.base_dir}")
        typer.echo(f"Experiment: {config['experiment']['name']}")

        if config["experiment"].get("description"):
            typer.echo(f"Description: {config['experiment']['description']}")

        if config["experiment"].get("version"):
            typer.echo(f"Version: {config['experiment']['version']}")

        # Display SUTs
        typer.echo("\nSUTs")
        typer.echo("-" * 40)
        for sut in config.get("suts", []):
            reg = sut.get("registration", {})
            typer.echo(f"  - {sut['id']} ({reg.get('name', '?')} v{reg.get('version', '?')})")
            typer.echo(f"    Module: {sut['module']} -> {sut['exportName']}")
            typer.echo(f"    Role: {reg.get('role', '?')}")

        # Display cases
        typer.echo("\nCases")
        typer.echo("-" * 40)
        for case in config.get("cases", []):
            typer.echo(f"  - {case['id']}")
            typer.echo(f"    Module: {case['module']} -> {case['exportName']}")

        # Display executor config
        typer.echo("\nExecutor")
        typer.echo("-" * 40)
        executor = config.get("executor", {})
        typer.echo(f"  Repetitions: {executor.get('repetitions', 'default')}")
        typer.echo(f"  Seed base: {executor.get('seedBase', 'default')}")
        typer.echo(f"  Timeout: {executor.get('timeoutMs', 'default')}ms")
        typer.echo(f"  Concurrency: {executor.get('concurrency', 'sequential')}")
        typer.echo(f"  Continue on error: {executor.get('continueOnError', 'default')}")
        typer.echo(f"  Collect provenance: {executor.get('collectProvenance', 'default')}")

        # Display output config
        typer.echo("\nOutput")
        typer.echo("-" * 40)
        output_config = config.get("output", {})
        typer.echo(f"  Path: {output_config.get('path', './results')}")
        typer.echo(f"  Format: {output_config.get('format', 'json-pretty')}")
        typer.echo(f"  Aggregate: {output_config.get('aggregate', 'true')}")

        # Display schema info
        schemas = config.get("schemas", {})
        if schemas.get("input"):
            props = schemas["input"].get("properties", {})
            typer.echo(f"\nInput schema: compiles OK ({len(props)} properties)")
        if schemas.get("output"):
            props = schemas["output"].get("properties", {})
            typer.echo(f"Output schema: compiles OK ({len(props)} properties)")

        typer.echo("\nConfiguration is valid!")

    except SystemExit:
        raise
    except Exception as exc:
        typer.echo(f"Error: {exc}", err=True)
        raise SystemExit(1) from exc
