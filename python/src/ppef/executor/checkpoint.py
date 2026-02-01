"""Checkpoint Manager for Experiment Execution.

Enables resumable experiment execution by:
1. Writing incremental checkpoints after each completed run
2. Detecting configuration changes to invalidate stale checkpoints
3. Skipping completed runs when resuming
4. File-based incremental checkpointing with config hash staleness detection
"""

from __future__ import annotations

import hashlib
import json
import logging
import subprocess
import threading
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from ppef.types.result import EvaluationResult

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Checkpoint data structure
# ---------------------------------------------------------------------------


@dataclass
class CheckpointData:
    """Checkpoint file format."""

    config_hash: str
    created_at: str
    updated_at: str
    completed_run_ids: list[str] = field(default_factory=list)
    results: dict[str, dict[str, Any]] = field(default_factory=dict)
    total_planned: int = 0
    git_commit: str | None = None
    worker_index: int | None = None
    total_workers: int | None = None


# ---------------------------------------------------------------------------
# Config signature for hashing
# ---------------------------------------------------------------------------


@dataclass
class _ConfigSignature:
    """Configuration signature for staleness hashing."""

    suts: list[dict[str, str]]
    cases: list[dict[str, str]]
    executor_config: dict[str, Any]
    total_runs: int


# ---------------------------------------------------------------------------
# Protocol-like interfaces for SUT/Case definitions
# ---------------------------------------------------------------------------


class _HasRegistration:
    """Duck-type for objects with a registration attribute."""

    class _Reg:
        id: str
        version: str

    registration: _Reg


class _HasCase:
    """Duck-type for objects with a case attribute."""

    class _CaseInfo:
        case_id: str
        version: str | None

    case: _CaseInfo


# ---------------------------------------------------------------------------
# CheckpointManager
# ---------------------------------------------------------------------------


class CheckpointManager:
    """File-based checkpoint manager for resumable execution.

    Saves incremental results after each completed run to prevent loss on
    crash.  Uses a config hash to detect when experiment configuration has
    changed, invalidating stale checkpoints.
    """

    def __init__(self, path: str | Path = "results/execute/checkpoint.json") -> None:
        self._path = Path(path)
        self._data: CheckpointData | None = None
        self._dirty = False
        self._lock = threading.Lock()

    @property
    def path(self) -> Path:
        return self._path

    # ------------------------------------------------------------------
    # Load / Save
    # ------------------------------------------------------------------

    def load(self) -> bool:
        """Load checkpoint from file if it exists.

        Returns True if a valid checkpoint was loaded, False otherwise.
        """
        try:
            if not self._path.exists():
                self._data = None
                self._dirty = False
                return False

            raw = json.loads(self._path.read_text(encoding="utf-8"))
            self._data = CheckpointData(
                config_hash=raw.get("configHash", ""),
                created_at=raw.get("createdAt", ""),
                updated_at=raw.get("updatedAt", ""),
                completed_run_ids=raw.get("completedRunIds", []),
                results=raw.get("results", {}),
                total_planned=raw.get("totalPlanned", 0),
                git_commit=raw.get("gitCommit"),
                worker_index=raw.get("workerIndex"),
                total_workers=raw.get("totalWorkers"),
            )
            self._dirty = False
            return True
        except (json.JSONDecodeError, OSError, KeyError):
            self._data = None
            self._dirty = False
            return False

    def save(self) -> None:
        """Save checkpoint to file."""
        if not self._dirty or self._data is None:
            return

        try:
            self._path.parent.mkdir(parents=True, exist_ok=True)
            self._path.write_text(
                json.dumps(self._to_dict(self._data), indent=2),
                encoding="utf-8",
            )
            self._dirty = False
        except OSError as exc:
            logger.warning("Failed to save checkpoint: %s", exc)

    def save_incremental(self, result: EvaluationResult) -> None:
        """Save a single result incrementally.

        Thread-safe.  Reloads from file to get latest state before merging
        the new result, preventing stale-memory corruption in concurrent
        scenarios.
        """
        with self._lock:
            # Reload from file to get latest state
            current: dict[str, Any]
            if self._path.exists():
                try:
                    current = json.loads(self._path.read_text(encoding="utf-8"))
                except (json.JSONDecodeError, OSError):
                    current = self._empty_dict()
            else:
                current = self._empty_dict()

            run_id = result.run.run_id
            completed: list[str] = current.get("completedRunIds", [])
            if run_id not in completed:
                completed.append(run_id)
            current["completedRunIds"] = completed
            current["results"][run_id] = result.model_dump(by_alias=True)
            current["updatedAt"] = datetime.now(UTC).isoformat()

            self._path.parent.mkdir(parents=True, exist_ok=True)
            self._path.write_text(
                json.dumps(current, indent=2),
                encoding="utf-8",
            )

    # ------------------------------------------------------------------
    # Query methods
    # ------------------------------------------------------------------

    def exists(self) -> bool:
        """Check if checkpoint data has been loaded."""
        return self._data is not None

    def is_completed(self, run_id: str) -> bool:
        """Check if a specific run has been completed."""
        if self._data is None:
            return False
        return run_id in self._data.completed_run_ids

    def get_completed_run_ids(self) -> set[str]:
        """Return the set of completed run IDs for efficient lookup."""
        if self._data is None:
            return set()
        return set(self._data.completed_run_ids)

    def get_results(self) -> list[dict[str, Any]]:
        """Return all stored results as dicts."""
        if self._data is None:
            return []
        return list(self._data.results.values())

    def get_progress(self) -> dict[str, int | float]:
        """Return progress information."""
        if self._data is None:
            return {"completed": 0, "total": 0, "percent": 0}
        completed = len(self._data.completed_run_ids)
        total = self._data.total_planned
        percent = round((completed / total) * 100) if total > 0 else 0
        return {"completed": completed, "total": total, "percent": percent}

    # ------------------------------------------------------------------
    # Staleness detection
    # ------------------------------------------------------------------

    def is_stale(
        self,
        suts: list[Any],
        cases: list[Any],
        config: dict[str, Any] | None = None,
        total_runs: int = 0,
    ) -> bool:
        """Check if checkpoint is stale (configuration has changed).

        Uses ``generate_config_hash`` from ``run_id`` to produce a
        deterministic hash of the current experiment configuration and
        compares it to the stored checkpoint hash.
        """
        if self._data is None:
            return False  # No checkpoint means not stale

        current_hash = self._compute_config_hash(suts, cases, config, total_runs)
        return self._data.config_hash != current_hash

    # ------------------------------------------------------------------
    # Mutation
    # ------------------------------------------------------------------

    def invalidate(self) -> None:
        """Discard checkpoint data (start fresh)."""
        self._data = None
        self._dirty = True

    def initialize_empty(
        self,
        suts: list[Any] | None = None,
        cases: list[Any] | None = None,
        config: dict[str, Any] | None = None,
        total_runs: int = 0,
        git_commit: str | None = None,
    ) -> None:
        """Create a fresh empty checkpoint."""
        config_hash: str
        if suts is not None and cases is not None and config is not None:
            config_hash = self._compute_config_hash(suts, cases, config, total_runs)
        else:
            config_hash = "pending"

        now = datetime.now(UTC).isoformat()
        self._data = CheckpointData(
            config_hash=config_hash,
            created_at=now,
            updated_at=now,
            total_planned=total_runs,
            git_commit=git_commit,
        )
        self._dirty = True

    def filter_remaining(self, planned_runs: list[Any]) -> list[Any]:
        """Return planned runs that have not yet been completed."""
        if self._data is None:
            return planned_runs
        completed_set = set(self._data.completed_run_ids)
        return [run for run in planned_runs if run.run_id not in completed_set]

    def merge_results(self, results: list[EvaluationResult]) -> None:
        """Merge new results into checkpoint (batch update)."""
        if self._data is None:
            self.initialize_empty()

        if self._data is None:
            return

        for result in results:
            run_id = result.run.run_id
            if run_id not in self._data.completed_run_ids:
                self._data.completed_run_ids.append(run_id)
                self._data.results[run_id] = result.model_dump(by_alias=True)
        self._dirty = True

    def get_summary(self) -> str:
        """Return a human-readable summary string."""
        if self._data is None:
            return "No checkpoint"
        progress = self.get_progress()
        return (
            f"Checkpoint: {progress['completed']}/{progress['total']} runs ({progress['percent']}%)"
        )

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _compute_config_hash(
        self,
        suts: list[Any],
        cases: list[Any],
        config: dict[str, Any] | None,
        total_runs: int,
    ) -> str:
        """Compute a deterministic hash of the experiment configuration."""
        config = config or {}
        signature = {
            "suts": [{"id": s.registration.id, "version": s.registration.version} for s in suts],
            "cases": [
                {
                    "id": c.case.case_id,
                    "version": getattr(c.case, "version", None) or "1.0.0",
                }
                for c in cases
            ],
            "executorConfig": {
                "repetitions": config.get("repetitions", 1),
                "seedBase": config.get("seed_base", 42),
                "timeoutMs": config.get("timeout_ms", 0),
            },
            "totalRuns": total_runs,
        }
        raw = json.dumps(signature, sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]

    @staticmethod
    def _to_dict(data: CheckpointData) -> dict[str, Any]:
        return {
            "configHash": data.config_hash,
            "createdAt": data.created_at,
            "updatedAt": data.updated_at,
            "completedRunIds": data.completed_run_ids,
            "results": data.results,
            "totalPlanned": data.total_planned,
            "gitCommit": data.git_commit,
            "workerIndex": data.worker_index,
            "totalWorkers": data.total_workers,
        }

    @staticmethod
    def _empty_dict() -> dict[str, Any]:
        now = datetime.now(UTC).isoformat()
        return {
            "configHash": "pending",
            "createdAt": now,
            "updatedAt": now,
            "completedRunIds": [],
            "results": {},
            "totalPlanned": 0,
        }


# ---------------------------------------------------------------------------
# Convenience factory
# ---------------------------------------------------------------------------


def get_git_commit() -> str | None:
    """Get git commit hash for reproducibility."""
    try:
        return subprocess.run(
            ["git", "rev-parse", "HEAD"],
            capture_output=True,
            text=True,
            check=True,
        ).stdout.strip()
    except (subprocess.CalledProcessError, FileNotFoundError):
        return None


def create_file_checkpoint_manager(
    path: str | Path = "results/execute/checkpoint.json",
) -> CheckpointManager:
    """Create a checkpoint manager with default file storage."""
    return CheckpointManager(path)
