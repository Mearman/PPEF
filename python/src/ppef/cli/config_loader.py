"""Config Loader.

Loads and validates experiment configuration from JSON files.
"""

from __future__ import annotations

import json
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, cast


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
    errors: list[str] = field(default_factory=lambda: list[str]())
    warnings: list[str] = field(default_factory=lambda: list[str]())


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
    suts_val: Any = config.get("suts")
    cases_val: Any = config.get("cases")
    suts_raw: list[Any] = cast(list[Any], suts_val) if isinstance(suts_val, list) else []
    cases_raw: list[Any] = cast(list[Any], cases_val) if isinstance(cases_val, list) else []
    if len(suts_raw) == 0 and isinstance(suts_val, list):
        warnings.append("No SUTs configured - experiment will have nothing to execute")
    if len(cases_raw) == 0 and isinstance(cases_val, list):
        warnings.append("No cases configured - experiment will have nothing to execute")

    # Check for duplicate SUT IDs
    if suts_raw:
        sut_ids: set[str] = set()
        for sut_item in suts_raw:
            if isinstance(sut_item, dict):
                sut_dict: dict[str, Any] = cast(dict[str, Any], sut_item)
                if "id" in sut_dict:
                    sut_id_val: str = str(sut_dict["id"])
                    if sut_id_val in sut_ids:
                        errors.append(f"Duplicate SUT ID: {sut_id_val}")
                    sut_ids.add(sut_id_val)

    # Check for duplicate case IDs
    if cases_raw:
        case_ids: set[str] = set()
        for case_item in cases_raw:
            if isinstance(case_item, dict):
                case_dict_item: dict[str, Any] = cast(dict[str, Any], case_item)
                if "id" in case_dict_item:
                    case_id_val: str = str(case_dict_item["id"])
                    if case_id_val in case_ids:
                        errors.append(f"Duplicate case ID: {case_id_val}")
                    case_ids.add(case_id_val)

    # Validate SUT structure
    for i, sut_raw in enumerate(suts_raw):
        if not isinstance(sut_raw, dict):
            errors.append(f"suts[{i}]: must be an object")
            continue
        sut_entry: dict[str, Any] = cast(dict[str, Any], sut_raw)
        for required in ("id", "module", "exportName", "registration"):
            if required not in sut_entry:
                errors.append(f"suts[{i}].{required}: Required")
        registration_val: Any = sut_entry.get("registration")
        if isinstance(registration_val, dict):
            reg_dict: dict[str, Any] = cast(dict[str, Any], registration_val)
            for required in ("name", "version", "role"):
                if required not in reg_dict:
                    errors.append(f"suts[{i}].registration.{required}: Required")

    # Validate case structure
    for i, case_raw in enumerate(cases_raw):
        if not isinstance(case_raw, dict):
            errors.append(f"cases[{i}]: must be an object")
            continue
        case_entry: dict[str, Any] = cast(dict[str, Any], case_raw)
        for required in ("id", "module", "exportName"):
            if required not in case_entry:
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
