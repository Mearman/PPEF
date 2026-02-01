"""Experiment Executor.

Orchestrates experiment execution across SUTs and cases.
Handles error isolation, progress reporting, and result collection.

Triple loop order: SUT-major, Case-middle, Repetition-minor.
"""

from __future__ import annotations

import platform
import subprocess
import sys
import time
from collections.abc import Callable
from concurrent.futures import ProcessPoolExecutor
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any, Protocol

from ppef.executor.run_id import generate_run_id
from ppef.types.result import (
    CorrectnessResult,
    EvaluationResult,
    Provenance,
    ResultMetrics,
    ResultOutputs,
    RunContext,
)
from ppef.types.sut import SutRole

# ---------------------------------------------------------------------------
# Protocols for SUT / Case / MetricsExtractor
# ---------------------------------------------------------------------------


class SUT(Protocol):
    """Protocol for a System Under Test."""

    @property
    def id(self) -> str: ...

    @property
    def config(self) -> dict[str, Any]: ...

    def run(self, inputs: Any) -> Any: ...


class SutDefinition(Protocol):
    """Protocol for a SUT definition with registration metadata."""

    @property
    def registration(self) -> _SutRegistration: ...

    def factory(self, config: dict[str, Any] | None = None) -> SUT: ...


class _SutRegistration(Protocol):
    @property
    def id(self) -> str: ...

    @property
    def version(self) -> str: ...

    @property
    def role(self) -> SutRole: ...


class CaseDefinition(Protocol):
    """Protocol for a case definition."""

    @property
    def case(self) -> _CaseInfo: ...

    def get_input(self) -> Any: ...

    def get_inputs(self) -> Any: ...


class _CaseInfo(Protocol):
    @property
    def case_id(self) -> str: ...

    @property
    def case_class(self) -> str | None: ...

    @property
    def expected_output(self) -> dict[str, Any] | None: ...

    @property
    def version(self) -> str | None: ...


MetricsExtractor = Callable[[Any], dict[str, float]]


# ---------------------------------------------------------------------------
# Helper: convert arbitrary dict values to Primitive-safe values
# ---------------------------------------------------------------------------

Primitive = str | int | float | bool | None


def _to_primitive_record(
    config: dict[str, Any] | None,
) -> dict[str, Primitive] | None:
    if config is None:
        return None
    result: dict[str, Primitive] = {}
    for key, value in config.items():
        if value is None or isinstance(value, (str, int, float, bool)):
            result[key] = value
        else:
            import json

            result[key] = json.dumps(value)
    return result


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------


@dataclass
class ExecutorConfig:
    """Configuration for experiment execution."""

    continue_on_error: bool = True
    repetitions: int = 1
    seed_base: int = 42
    timeout_ms: int = 0
    collect_provenance: bool = True
    max_workers: int | None = None
    unsafe_in_process: bool = False
    on_progress: Callable[[ExecutionProgress], None] | None = None
    on_result: Callable[[EvaluationResult], None] | None = None
    monitor_memory: bool = True
    memory_warning_threshold_mb: int = 1024
    memory_critical_threshold_mb: int = 2048
    abort_on_memory_critical: bool = False
    base_dir: str | None = None


@dataclass
class ExecutionProgress:
    """Execution progress report."""

    total: int
    completed: int
    failed: int
    current_sut: str | None = None
    current_case: str | None = None
    current_repetition: int | None = None
    elapsed_ms: float = 0.0


@dataclass
class ExecutionSummary:
    """Execution summary returned after completion."""

    total_runs: int
    successful_runs: int
    failed_runs: int
    elapsed_ms: float
    results: list[EvaluationResult] = field(default_factory=list)
    errors: list[dict[str, str]] = field(default_factory=list)


@dataclass
class PlannedRun:
    """Execution plan for a single run."""

    run_id: str
    sut_id: str
    case_id: str
    repetition: int
    seed: int
    config: dict[str, Any] | None = None


# ---------------------------------------------------------------------------
# Provenance collection
# ---------------------------------------------------------------------------


def _get_provenance(collect_provenance: bool) -> Provenance:
    """Collect provenance information for reproducibility."""
    runtime = {
        "platform": sys.platform,
        "arch": platform.machine(),
        "pythonVersion": platform.python_version(),
    }

    if not collect_provenance:
        return Provenance(runtime=runtime)

    git_commit: str | None = None
    dirty: bool | None = None

    try:
        git_commit = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            capture_output=True,
            text=True,
            check=True,
        ).stdout.strip()
        status_output = subprocess.run(
            ["git", "status", "--porcelain"],
            capture_output=True,
            text=True,
            check=True,
        ).stdout
        dirty = len(status_output) > 0
    except (subprocess.CalledProcessError, FileNotFoundError):
        pass

    return Provenance(
        runtime=runtime,
        git_commit=git_commit,
        dirty=dirty,
        timestamp=datetime.now(UTC).isoformat(),
    )


# ---------------------------------------------------------------------------
# Memory monitoring helper
# ---------------------------------------------------------------------------


def _get_memory_bytes() -> int:
    """Get current RSS memory usage in bytes.

    Uses resource.getrusage on Unix, falls back to 0 on unsupported platforms.
    """
    try:
        import resource

        usage = resource.getrusage(resource.RUSAGE_SELF)
        # On macOS, ru_maxrss is in bytes; on Linux, it is in kilobytes.
        if sys.platform == "darwin":
            return usage.ru_maxrss
        return usage.ru_maxrss * 1024
    except (ImportError, AttributeError):
        return 0


# ---------------------------------------------------------------------------
# Executor
# ---------------------------------------------------------------------------


class Executor:
    """Experiment executor.

    Orchestrates experiment execution across SUTs and cases with
    configurable concurrency, progress reporting, and error isolation.
    """

    def __init__(self, config: ExecutorConfig | None = None) -> None:
        self._config = config or ExecutorConfig()
        self._input_cache: dict[str, Any] = {}

    @property
    def config(self) -> ExecutorConfig:
        return self._config

    # ------------------------------------------------------------------
    # Plan
    # ------------------------------------------------------------------

    def plan(
        self,
        suts: list[SutDefinition],
        cases: list[CaseDefinition],
    ) -> list[PlannedRun]:
        """Generate execution plan without running.

        Loop order: SUT-major, Case-middle, Repetition-minor.
        Seed derivation: seed = seed_base + repetition_index.
        """
        runs: list[PlannedRun] = []

        for sut_def in suts:
            for case_def in cases:
                for rep in range(self._config.repetitions):
                    seed = self._config.seed_base + rep
                    run_id = generate_run_id(
                        {
                            "sutId": sut_def.registration.id,
                            "caseId": case_def.case.case_id,
                            "seed": seed,
                            "repetition": rep,
                        }
                    )
                    runs.append(
                        PlannedRun(
                            run_id=run_id,
                            sut_id=sut_def.registration.id,
                            case_id=case_def.case.case_id,
                            repetition=rep,
                            seed=seed,
                        )
                    )

        return runs

    # ------------------------------------------------------------------
    # Execute
    # ------------------------------------------------------------------

    def execute(
        self,
        suts: list[SutDefinition],
        cases: list[CaseDefinition],
        metrics_extractor: MetricsExtractor,
        planned_runs: list[PlannedRun] | None = None,
    ) -> ExecutionSummary:
        """Execute all planned runs.

        When ``unsafe_in_process`` is True, runs execute in the current
        process (useful for debugging).  Otherwise, runs are dispatched
        to a ``ProcessPoolExecutor`` for worker isolation.
        """
        start = time.perf_counter()
        effective_runs = planned_runs if planned_runs is not None else self.plan(suts, cases)

        sut_map = {s.registration.id: s for s in suts}
        case_map = {c.case.case_id: c for c in cases}

        if self._config.unsafe_in_process:
            return self._execute_in_process(
                effective_runs, sut_map, case_map, metrics_extractor, start
            )

        max_workers = self._config.max_workers or 1
        if max_workers <= 1:
            # Sequential but still conceptually "isolated" -- for true
            # process isolation we would need picklable SUTs.  Fall back
            # to in-process sequential execution here.
            return self._execute_in_process(
                effective_runs, sut_map, case_map, metrics_extractor, start
            )

        return self._execute_parallel(
            effective_runs, sut_map, case_map, metrics_extractor, start, max_workers
        )

    # ------------------------------------------------------------------
    # Sequential (in-process) execution
    # ------------------------------------------------------------------

    def _execute_in_process(
        self,
        planned_runs: list[PlannedRun],
        sut_map: dict[str, SutDefinition],
        case_map: dict[str, CaseDefinition],
        metrics_extractor: MetricsExtractor,
        start: float,
    ) -> ExecutionSummary:
        results: list[EvaluationResult] = []
        errors: list[dict[str, str]] = []
        completed = 0
        failed = 0

        for run in planned_runs:
            sut_def = sut_map.get(run.sut_id)
            case_def = case_map.get(run.case_id)

            if sut_def is None or case_def is None:
                errors.append({"runId": run.run_id, "error": "SUT or case not found"})
                failed += 1
                continue

            try:
                result = self._execute_run(run, sut_def, case_def, metrics_extractor)
                results.append(result)

                if self._config.on_result is not None:
                    self._config.on_result(result)

                completed += 1

                if self._config.on_progress is not None:
                    self._config.on_progress(
                        ExecutionProgress(
                            total=len(planned_runs),
                            completed=completed,
                            failed=failed,
                            current_sut=run.sut_id,
                            current_case=run.case_id,
                            current_repetition=run.repetition,
                            elapsed_ms=(time.perf_counter() - start) * 1000,
                        )
                    )
            except Exception as exc:
                errors.append({"runId": run.run_id, "error": str(exc)})
                failed += 1

                if not self._config.continue_on_error:
                    raise

        return ExecutionSummary(
            total_runs=len(planned_runs),
            successful_runs=completed,
            failed_runs=failed,
            elapsed_ms=(time.perf_counter() - start) * 1000,
            results=results,
            errors=errors,
        )

    # ------------------------------------------------------------------
    # Parallel execution (ProcessPoolExecutor)
    # ------------------------------------------------------------------

    def _execute_parallel(
        self,
        planned_runs: list[PlannedRun],
        sut_map: dict[str, SutDefinition],
        case_map: dict[str, CaseDefinition],
        metrics_extractor: MetricsExtractor,
        start: float,
        max_workers: int,
    ) -> ExecutionSummary:
        """Execute runs in parallel batches using ProcessPoolExecutor.

        Note: SUTs and cases must be picklable for cross-process transfer.
        If they are not, fall back to ``unsafe_in_process=True``.
        """
        results: list[EvaluationResult] = []
        errors: list[dict[str, str]] = []
        completed = 0
        failed = 0

        with ProcessPoolExecutor(max_workers=max_workers) as pool:
            futures = {}
            for run in planned_runs:
                sut_def = sut_map.get(run.sut_id)
                case_def = case_map.get(run.case_id)

                if sut_def is None or case_def is None:
                    errors.append({"runId": run.run_id, "error": "SUT or case not found"})
                    failed += 1
                    continue

                future = pool.submit(self._execute_run, run, sut_def, case_def, metrics_extractor)
                futures[future] = run

            for future in futures:
                run = futures[future]
                try:
                    result = future.result()
                    results.append(result)

                    if self._config.on_result is not None:
                        self._config.on_result(result)

                    completed += 1

                    if self._config.on_progress is not None:
                        self._config.on_progress(
                            ExecutionProgress(
                                total=len(planned_runs),
                                completed=completed,
                                failed=failed,
                                current_sut=run.sut_id,
                                current_case=run.case_id,
                                current_repetition=run.repetition,
                                elapsed_ms=(time.perf_counter() - start) * 1000,
                            )
                        )
                except Exception as exc:
                    errors.append({"runId": run.run_id, "error": str(exc)})
                    failed += 1

                    if not self._config.continue_on_error:
                        raise

        return ExecutionSummary(
            total_runs=len(planned_runs),
            successful_runs=completed,
            failed_runs=failed,
            elapsed_ms=(time.perf_counter() - start) * 1000,
            results=results,
            errors=errors,
        )

    # ------------------------------------------------------------------
    # Single run execution
    # ------------------------------------------------------------------

    def _execute_run(
        self,
        run: PlannedRun,
        sut_def: SutDefinition,
        case_def: CaseDefinition,
        metrics_extractor: MetricsExtractor,
    ) -> EvaluationResult:
        """Execute a single planned run and return an EvaluationResult."""
        run_start = time.perf_counter()
        peak_memory_bytes = 0

        # Memory check before execution
        if self._config.monitor_memory:
            mem = _get_memory_bytes()
            peak_memory_bytes = max(peak_memory_bytes, mem)
            if (
                self._config.abort_on_memory_critical
                and mem > self._config.memory_critical_threshold_mb * 1024 * 1024
            ):
                raise MemoryError(
                    f"Memory critical threshold exceeded ({mem / (1024 * 1024):.1f}MB). "
                    "Aborting execution."
                )

        # Load or reuse input resource (cached)
        cache_key = case_def.case.case_id
        if cache_key not in self._input_cache:
            self._input_cache[cache_key] = case_def.get_input()

            if self._config.monitor_memory:
                peak_memory_bytes = max(peak_memory_bytes, _get_memory_bytes())

        resource_input = self._input_cache[cache_key]

        # Get algorithm inputs
        inputs = case_def.get_inputs()

        # Create SUT instance
        sut = sut_def.factory(run.config)

        # Combine inputs with loaded resource
        run_inputs = {**inputs, "input": resource_input} if isinstance(inputs, dict) else inputs

        # Execute SUT
        sut_result = sut.run(run_inputs)

        execution_time_ms = (time.perf_counter() - run_start) * 1000

        # Memory after execution
        final_memory_bytes = 0
        if self._config.monitor_memory:
            final_memory_bytes = _get_memory_bytes()
            peak_memory_bytes = max(peak_memory_bytes, final_memory_bytes)

        # Extract metrics
        metrics = metrics_extractor(sut_result)

        # Build correctness
        correctness = CorrectnessResult(
            expected_exists=case_def.case.expected_output is not None,
            produced_output=True,
            valid=True,
            matches_expected=None,
        )

        # Build provenance
        provenance = _get_provenance(self._config.collect_provenance)
        provenance.execution_time_ms = execution_time_ms

        if self._config.monitor_memory and self._config.collect_provenance:
            provenance.peak_memory_bytes = peak_memory_bytes
            provenance.final_memory_bytes = final_memory_bytes

        return EvaluationResult(
            run=RunContext(
                run_id=run.run_id,
                sut=run.sut_id,
                sut_role=sut_def.registration.role,
                sut_version=sut_def.registration.version,
                case_id=run.case_id,
                case_class=case_def.case.case_class,
                config=_to_primitive_record(run.config),
                seed=run.seed,
                repetition=run.repetition,
            ),
            correctness=correctness,
            outputs=ResultOutputs(summary={}),
            metrics=ResultMetrics(numeric=metrics),
            provenance=provenance,
        )


def create_executor(config: ExecutorConfig | None = None) -> Executor:
    """Create a default executor with standard configuration."""
    return Executor(config)
