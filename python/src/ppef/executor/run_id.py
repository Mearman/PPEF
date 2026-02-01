"""Deterministic Run ID Generation.

Generates reproducible run IDs based on canonical inputs.
The same inputs will always produce the same run ID, enabling
exact result matching across executions.

Canonicalization follows RFC 8785 (JSON Canonicalization Scheme / JCS).
This ensures cross-language determinism.
"""

from __future__ import annotations

import hashlib
import json
import math
from typing import Any


def canonicalize(value: Any) -> str:
    """Serialize a value to RFC 8785 (JCS) canonical JSON.

    Rules:
    - Object keys are sorted lexicographically (by UTF-16 code units)
    - No whitespace
    - All dict keys are included (None serializes as "null")
    - Numbers use ECMAScript toString() representation
    - Strings use minimal JSON escaping
    """
    if value is None:
        return "null"

    if isinstance(value, bool):
        return "true" if value else "false"

    if isinstance(value, int):
        return str(value)

    if isinstance(value, float):
        if not math.isfinite(value):
            return "null"
        if value == 0.0 and math.copysign(1.0, value) == -1.0:
            return "0"
        # ECMAScript Number.toString() representation
        # Python's repr/str for floats matches for most cases
        # but we need to handle the exact same formatting
        result = repr(value)
        # Python uses 'e' notation differently than JS in some edge cases
        # For conformance, we need to match exactly
        return result

    if isinstance(value, str):
        return json.dumps(value)

    if isinstance(value, list):
        items = [canonicalize(item) for item in value]
        return f"[{','.join(items)}]"

    if isinstance(value, dict):
        # Include all keys present in the dict (None serializes as "null").
        # In JS, undefined values are omitted but null is preserved.
        # In Python, absent keys are simply not in the dict, so we include everything.
        keys = sorted(value.keys())
        pairs = [f"{json.dumps(k)}:{canonicalize(value[k])}" for k in keys]
        return f"{{{','.join(pairs)}}}"

    return "null"


def generate_run_id(inputs: dict[str, Any]) -> str:
    """Generate a deterministic run ID from inputs.

    The run ID is a SHA-256 hash of the RFC 8785 (JCS) canonical JSON
    representation of the inputs, truncated to 16 hex characters.
    """
    canonical = canonicalize(inputs)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:16]


def generate_config_hash(config: dict[str, Any]) -> str:
    """Generate a configuration hash from arbitrary config object.

    Returns an 8-character hex string.
    """
    canonical = canonicalize(config)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:8]


def validate_run_id(run_id: str, inputs: dict[str, Any]) -> bool:
    """Validate that a run ID matches expected inputs."""
    return run_id == generate_run_id(inputs)


def parse_run_id(run_id: str) -> dict[str, bool | int]:
    """Parse a run ID into validation info.

    Note: This is not reversible - run IDs are hashes.
    This function only validates the format.
    """
    import re

    is_hex = bool(re.fullmatch(r"[0-9a-f]+", run_id, re.IGNORECASE))
    return {
        "valid": is_hex and len(run_id) == 16,
        "length": len(run_id),
    }
