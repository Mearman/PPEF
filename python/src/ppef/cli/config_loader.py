"""Config Loader.

Loads and validates experiment configuration from JSON files.
"""

from __future__ import annotations

import json
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


@dataclass
class LoadedConfig:
    """Loaded and validated experiment configuration."""

    config: dict[str, Any]
    base_dir: Path
    config_path: Path


@dataclass
class ValidationResult:
    """Validation result with errors and warnings."""

    valid: bool
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


def load_config(config_path: str | Path) -> LoadedConfig:
    """Load and parse experiment configuration from a JSON file.

    Args:
        config_path: Path to config file (can be absolute or relative).

    Returns:
        Loaded configuration with base directory.

    Raises:
        FileNotFoundError: If config file does not exist.
        json.JSONDecodeError: If config file is not valid JSON.
    """
    absolute_path = Path(config_path).resolve()
    content = absolute_path.read_text(encoding="utf-8")
    config: dict[str, Any] = json.loads(content)
    base_dir = absolute_path.parent

    return LoadedConfig(
        config=config,
        base_dir=base_dir,
        config_path=absolute_path,
    )


def validate_config(config: dict[str, Any]) -> ValidationResult:
    """Validate experiment configuration.

    Performs structural validation of the experiment config dict.

    Args:
        config: Configuration dictionary to validate.

    Returns:
        Validation result with errors and warnings.
    """
    errors: list[str] = []
    warnings: list[str] = []

    # Required top-level fields
    if "experiment" not in config:
        errors.append("Missing required field: experiment")
    elif not isinstance(config["experiment"], dict):
        errors.append("experiment: must be an object")
    elif "name" not in config["experiment"] or not config["experiment"]["name"]:
        errors.append("experiment.name: Required")

    if "executor" not in config:
        errors.append("Missing required field: executor")

    if "suts" not in config:
        errors.append("Missing required field: suts")
    elif not isinstance(config["suts"], list):
        errors.append("suts: must be an array")

    if "cases" not in config:
        errors.append("Missing required field: cases")
    elif not isinstance(config["cases"], list):
        errors.append("cases: must be an array")

    if "metricsExtractor" not in config:
        errors.append("Missing required field: metricsExtractor")

    if "output" not in config:
        warnings.append("No output configuration specified - using defaults")

    # Check for empty SUTs/cases
    if isinstance(config.get("suts"), list) and len(config["suts"]) == 0:
        warnings.append("No SUTs configured - experiment will have nothing to execute")
    if isinstance(config.get("cases"), list) and len(config["cases"]) == 0:
        warnings.append("No cases configured - experiment will have nothing to execute")

    # Check for duplicate SUT IDs
    if isinstance(config.get("suts"), list):
        sut_ids: set[str] = set()
        for sut in config["suts"]:
            if isinstance(sut, dict) and "id" in sut:
                if sut["id"] in sut_ids:
                    errors.append(f"Duplicate SUT ID: {sut['id']}")
                sut_ids.add(sut["id"])

    # Check for duplicate case IDs
    if isinstance(config.get("cases"), list):
        case_ids: set[str] = set()
        for case in config["cases"]:
            if isinstance(case, dict) and "id" in case:
                if case["id"] in case_ids:
                    errors.append(f"Duplicate case ID: {case['id']}")
                case_ids.add(case["id"])

    # Validate SUT structure
    if isinstance(config.get("suts"), list):
        for i, sut in enumerate(config["suts"]):
            if not isinstance(sut, dict):
                errors.append(f"suts[{i}]: must be an object")
                continue
            for required in ("id", "module", "exportName", "registration"):
                if required not in sut:
                    errors.append(f"suts[{i}].{required}: Required")
            if isinstance(sut.get("registration"), dict):
                for required in ("name", "version", "role"):
                    if required not in sut["registration"]:
                        errors.append(f"suts[{i}].registration.{required}: Required")

    # Validate case structure
    if isinstance(config.get("cases"), list):
        for i, case in enumerate(config["cases"]):
            if not isinstance(case, dict):
                errors.append(f"cases[{i}]: must be an object")
                continue
            for required in ("id", "module", "exportName"):
                if required not in case:
                    errors.append(f"cases[{i}].{required}: Required")

    return ValidationResult(
        valid=len(errors) == 0,
        errors=errors,
        warnings=warnings,
    )


def load_and_validate_config(config_path: str | Path) -> LoadedConfig:
    """Load and validate experiment configuration.

    Args:
        config_path: Path to config file.

    Returns:
        Loaded and validated configuration.

    Raises:
        SystemExit: If validation fails.
    """
    loaded = load_config(config_path)
    validation = validate_config(loaded.config)

    if not validation.valid:
        error_list = "\n".join(f"  - {e}" for e in validation.errors)
        print(f"Configuration validation failed:\n{error_list}", file=sys.stderr)
        raise SystemExit(1)

    for warning in validation.warnings:
        print(f"Warning: {warning}", file=sys.stderr)

    return loaded
