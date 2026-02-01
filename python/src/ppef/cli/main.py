"""PPEF CLI entry point.

Command-line interface for the Portable Programmatic Evaluation Framework.
"""

from __future__ import annotations

import typer

from ppef.cli.aggregate_cmd import aggregate
from ppef.cli.evaluate_cmd import evaluate
from ppef.cli.plan_cmd import plan
from ppef.cli.run_cmd import run
from ppef.cli.validate_cmd import validate

app = typer.Typer(
    name="ppef",
    help="Portable Programmatic Evaluation Framework - CLI for experiment execution",
    no_args_is_help=True,
)

app.command()(run)
app.command()(validate)
app.command()(plan)
app.command()(aggregate)
app.command()(evaluate)


@app.callback(invoke_without_command=True)
def default_command(
    ctx: typer.Context,
    config_file: str | None = typer.Argument(
        default=None,
        help="Path to experiment configuration JSON file (shorthand for 'ppef run')",
    ),
) -> None:
    """Portable Programmatic Evaluation Framework."""
    if ctx.invoked_subcommand is not None:
        return
    if config_file is not None:
        # Delegate to run command
        ctx.invoke(run, config_file=config_file)
