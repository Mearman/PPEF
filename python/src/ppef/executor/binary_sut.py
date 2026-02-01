"""Binary SUT Wrapper.

Enables arbitrary binaries (Python scripts, compiled executables, etc.)
to be used as System Under Test in PPEF experiments.

The BinarySUT class wraps subprocess execution for cross-language SUT
integration, communicating via stdin/stdout IPC with configurable
serialization formats and timeout handling.

Supported I/O formats:
- json: Structured data serialization (default)
- raw: Plain text passthrough
- lines: Line-separated values
"""

from __future__ import annotations

import json
import os
import subprocess
from dataclasses import dataclass, field
from typing import Any, Literal

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

InputFormat = Literal["json", "raw", "lines"]
OutputFormat = Literal["json", "raw", "lines"]


@dataclass(frozen=True)
class BinarySUTConfig:
    """Configuration for binary SUT execution."""

    command: str
    args: list[str] = field(default_factory=list)
    cwd: str | None = None
    env: dict[str, str] = field(default_factory=dict)
    input_format: InputFormat = "json"
    output_format: OutputFormat = "json"
    timeout: float = 30.0
    success_exit_code: int = 0


# ---------------------------------------------------------------------------
# BinarySUT
# ---------------------------------------------------------------------------


class BinarySUT:
    """Binary SUT wrapper implementing the SUT protocol.

    Spawns external processes, communicates via stdin/stdout,
    and provides timeout handling and error isolation.
    """

    def __init__(self, id: str, config: BinarySUTConfig) -> None:
        self._id = id
        self._config = config

    @property
    def id(self) -> str:
        return self._id

    @property
    def config(self) -> BinarySUTConfig:
        return self._config

    def run(self, inputs: Any) -> Any:
        """Execute the binary with the given inputs.

        Serializes *inputs* to stdin according to ``input_format``,
        runs the subprocess with the configured timeout, and
        deserializes stdout according to ``output_format``.

        Raises on timeout (SIGKILL), non-zero exit code, or spawn failure.
        """
        input_data = self._serialize_inputs(inputs)

        env = {**os.environ, **self._config.env} if self._config.env else None

        timeout_seconds = self._config.timeout if self._config.timeout > 0 else None

        try:
            proc = subprocess.run(
                [self._config.command, *self._config.args],
                input=input_data,
                capture_output=True,
                text=True,
                cwd=self._config.cwd,
                env=env,
                timeout=timeout_seconds,
            )
        except subprocess.TimeoutExpired:
            raise TimeoutError(f"BinarySUT timeout after {self._config.timeout}s") from None
        except FileNotFoundError:
            raise RuntimeError(
                f"BinarySUT failed to spawn: command '{self._config.command}' not found"
            ) from None

        if proc.returncode != self._config.success_exit_code:
            raise RuntimeError(f"BinarySUT exited with code {proc.returncode}: {proc.stderr}")

        return self._deserialize_output(proc.stdout)

    # ------------------------------------------------------------------
    # Serialization
    # ------------------------------------------------------------------

    def _serialize_inputs(self, inputs: Any) -> str:
        match self._config.input_format:
            case "json":
                return json.dumps(inputs)
            case "raw":
                return str(inputs)
            case "lines":
                if isinstance(inputs, list):
                    return "\n".join(str(item) for item in inputs) + "\n"
                return str(inputs) + "\n"

    def _deserialize_output(self, stdout: str) -> Any:
        trimmed = stdout.strip()
        if not trimmed:
            return None

        match self._config.output_format:
            case "json":
                return json.loads(trimmed)
            case "raw":
                return trimmed
            case "lines":
                return [line for line in trimmed.split("\n") if line]


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class CreateBinarySUTOptions:
    """Options for creating a binary SUT factory."""

    command: str
    id: str | None = None
    args: list[str] = field(default_factory=list)
    cwd: str | None = None
    env: dict[str, str] = field(default_factory=dict)
    input_format: InputFormat = "json"
    output_format: OutputFormat = "json"
    timeout: float = 30.0
    success_exit_code: int = 0


def create_binary_sut(
    options: CreateBinarySUTOptions,
) -> Any:
    """Create a binary SUT factory function.

    The returned callable matches the SUT factory signature and can be
    used interchangeably with other SUT factories in the PPEF framework.

    Example::

        factory = create_binary_sut(CreateBinarySUTOptions(
            id="python-classifier",
            command="python3",
            args=["classifier.py"],
            input_format="json",
            output_format="json",
            timeout=30.0,
        ))

        sut = factory({"model_path": "./model.pkl"})
        result = sut.run({"features": [1, 2, 3]})
    """

    def factory(config: dict[str, Any] | None = None) -> BinarySUT:
        merged = {
            "command": options.command,
            "args": list(options.args),
            "cwd": options.cwd,
            "env": dict(options.env),
            "input_format": options.input_format,
            "output_format": options.output_format,
            "timeout": options.timeout,
            "success_exit_code": options.success_exit_code,
        }

        if config is not None:
            merged.update(config)

        sut_id = (
            (
                config.get("id")
                if isinstance(config, dict) and isinstance(config.get("id"), str)
                else None
            )
            or options.id
            or f"binary-{options.command}"
        )

        return BinarySUT(
            id=sut_id,
            config=BinarySUTConfig(
                command=merged["command"],
                args=merged["args"],
                cwd=merged["cwd"],
                env=merged["env"],
                input_format=merged["input_format"],
                output_format=merged["output_format"],
                timeout=merged["timeout"],
                success_exit_code=merged["success_exit_code"],
            ),
        )

    return factory
