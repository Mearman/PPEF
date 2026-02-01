"""Module Loader.

Dynamically loads Python modules containing SUT factories,
case definitions, and metrics extractors.
"""

from __future__ import annotations

import importlib
import importlib.util
import sys
from pathlib import Path
from typing import Any, Protocol, cast


class SutInstance(Protocol):
    """Protocol for a SUT instance returned by a factory."""

    @property
    def id(self) -> str: ...

    @property
    def config(self) -> dict[str, Any]: ...

    async def run(self, inputs: Any) -> Any: ...


def _load_module(module_path: str, base_dir: Path) -> Any:
    """Load a Python module from a file path.

    Args:
        module_path: Path to module file (relative to base directory).
        base_dir: Base directory for resolving relative paths.

    Returns:
        Loaded module object.

    Raises:
        ImportError: If module cannot be loaded.
    """
    absolute_path = (base_dir / module_path).resolve()

    if not absolute_path.exists():
        msg = f"Module not found: {absolute_path}"
        raise ImportError(msg)

    module_name = absolute_path.stem

    spec = importlib.util.spec_from_file_location(module_name, absolute_path)
    if spec is None or spec.loader is None:
        msg = f"Failed to create module spec for: {absolute_path}"
        raise ImportError(msg)

    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


def _get_exported_function(module: Any, export_name: str, module_path: str) -> Any:
    """Extract a function export from a loaded module.

    Args:
        module: Loaded module.
        export_name: Name of the export to extract.
        module_path: Module path (for error messages).

    Returns:
        The exported function.

    Raises:
        AttributeError: If export does not exist.
        TypeError: If export is not callable.
    """
    if not hasattr(module, export_name):
        msg = f'Export "{export_name}" not found in {module_path}'
        raise AttributeError(msg)

    exported = getattr(module, export_name)

    if not callable(exported):
        msg = (
            f'Export "{export_name}" in {module_path} is not callable. '
            f"Found type: {type(exported).__name__}"
        )
        raise TypeError(msg)

    return exported


def load_sut_factory(
    module_path: str,
    export_name: str,
    base_dir: Path,
    registration: dict[str, Any],
    config: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Load a SUT factory from a module.

    Args:
        module_path: Path to module file.
        export_name: Name of the export to use.
        base_dir: Base directory for resolving paths.
        registration: SUT registration metadata.
        config: Optional configuration to pass to factory.

    Returns:
        SUT definition dict with registration and factory.

    Raises:
        ImportError: If module cannot be loaded.
        AttributeError: If export does not exist.
        TypeError: If export is not callable.
    """
    module = _load_module(module_path, base_dir)
    factory_fn = _get_exported_function(module, export_name, module_path)

    def factory(user_config: dict[str, Any] | None = None) -> dict[str, Any]:
        merged = {**(config or {}), **(user_config or {})}
        instance = factory_fn(merged) if merged else factory_fn()
        instance_config = getattr(instance, "config", {}) or {}
        return {
            "id": registration["id"],
            "config": {**(config or {}), **(user_config or {}), **instance_config},
            "run": instance.run if hasattr(instance, "run") else instance["run"],
        }

    return {
        "registration": registration,
        "factory": factory,
        "id": registration["id"],
        "source_module": module_path,
        "source_export_name": export_name,
    }


def load_case_definition(
    module_path: str,
    export_name: str,
    base_dir: Path,
) -> dict[str, Any]:
    """Load a case definition from a module.

    Args:
        module_path: Path to module file.
        export_name: Name of the export to use.
        base_dir: Base directory for resolving paths.

    Returns:
        Case definition dict.

    Raises:
        ImportError: If module cannot be loaded.
        AttributeError: If export does not exist.
        ValueError: If case definition is invalid.
    """
    module = _load_module(module_path, base_dir)
    case_fn = _get_exported_function(module, export_name, module_path)

    definition: Any = case_fn()

    # Normalize to dict for type safety
    def_dict: dict[str, Any] = (
        cast(dict[str, Any], definition)
        if isinstance(definition, dict)
        else cast(
            dict[str, Any],
            {
                "case": getattr(definition, "case", None),
                "getInput": getattr(definition, "getInput", None),
                "getInputs": getattr(definition, "getInputs", None),
            },
        )
    )

    # Validate structure
    case_data: Any = def_dict.get("case")
    if case_data is None:
        msg = (
            f'Export "{export_name}" in {module_path} does not return'
            " a valid case definition. Missing case."
        )
        raise ValueError(msg)

    case_id: Any = (
        cast(dict[str, Any], case_data).get("caseId")
        if isinstance(case_data, dict)
        else getattr(case_data, "caseId", None)
    )
    if not case_id:
        msg = (
            f'Export "{export_name}" in {module_path} does not return'
            " a valid case definition. Missing case.caseId."
        )
        raise ValueError(msg)

    get_input: Any = def_dict.get("getInput")
    if not callable(get_input):
        msg = (
            f'Export "{export_name}" in {module_path} does not return'
            " a valid case definition. Missing getInput function."
        )
        raise ValueError(msg)

    get_inputs: Any = def_dict.get("getInputs")
    if not callable(get_inputs):
        msg = (
            f'Export "{export_name}" in {module_path} does not return'
            " a valid case definition. Missing getInputs function."
        )
        raise ValueError(msg)

    result: dict[str, Any] = dict(def_dict)
    result["source_module"] = module_path
    result["source_export_name"] = export_name

    return result


def load_metrics_extractor(
    module_path: str,
    export_name: str,
    base_dir: Path,
) -> Any:
    """Load a metrics extractor from a module.

    Args:
        module_path: Path to module file.
        export_name: Name of the export to use.
        base_dir: Base directory for resolving paths.

    Returns:
        Metrics extractor callable.

    Raises:
        ImportError: If module cannot be loaded.
        AttributeError: If export does not exist.
        TypeError: If export is not callable.
    """
    module = _load_module(module_path, base_dir)
    return _get_exported_function(module, export_name, module_path)
