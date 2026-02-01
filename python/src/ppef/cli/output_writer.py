"""Output Writer.

Handles writing results and aggregates to JSON files.
"""

from __future__ import annotations

import json
import re
from datetime import UTC, datetime
from pathlib import Path
from typing import Any


def ensure_dir(dir_path: Path) -> None:
    """Ensure a directory exists, creating it if necessary."""
    dir_path.mkdir(parents=True, exist_ok=True)


def write_results(
    results: list[dict[str, Any]],
    output_path: str | Path,
    fmt: str = "json-pretty",
) -> None:
    """Write results to a JSON file.

    Args:
        results: Results to write.
        output_path: Path to output file.
        fmt: Output format ('json' or 'json-pretty').
    """
    batch = {
        "version": "1.0.0",
        "timestamp": datetime.now(tz=UTC).isoformat(),
        "count": len(results),
        "results": results,
    }

    indent = 2 if fmt == "json-pretty" else None
    content = json.dumps(batch, indent=indent, default=str)

    path = Path(output_path)
    ensure_dir(path.parent)
    path.write_text(content, encoding="utf-8")


def write_aggregates(
    aggregation: dict[str, Any],
    output_path: str | Path,
    fmt: str = "json-pretty",
) -> None:
    """Write aggregated results to a JSON file.

    Args:
        aggregation: Aggregation output to write.
        output_path: Path to output file.
        fmt: Output format ('json' or 'json-pretty').
    """
    indent = 2 if fmt == "json-pretty" else None
    content = json.dumps(aggregation, indent=indent, default=str)

    path = Path(output_path)
    ensure_dir(path.parent)
    path.write_text(content, encoding="utf-8")


def generate_output_filename(
    experiment_name: str,
    output_type: str,
) -> str:
    """Generate output filename based on experiment name and timestamp.

    Args:
        experiment_name: Name of the experiment.
        output_type: Type of output ('results' or 'aggregates').

    Returns:
        Generated filename.
    """
    timestamp = datetime.now(tz=UTC).isoformat().replace(":", "-").replace(".", "-")[:-5]
    sanitized_name = re.sub(r"[^a-z0-9]+", "-", experiment_name, flags=re.IGNORECASE).lower()
    return f"{sanitized_name}-{output_type}-{timestamp}.json"
