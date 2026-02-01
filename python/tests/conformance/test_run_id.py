"""Conformance tests for run ID generation.

Tests against pinned vectors in spec/conformance/run-id-vectors.json.
These vectors must produce identical output across all PPEF implementations.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from ppef.executor.run_id import canonicalize, generate_config_hash, generate_run_id


@pytest.fixture
def run_id_vectors() -> dict:
    """Load run ID conformance vectors."""
    spec_dir = Path(__file__).resolve().parent.parent.parent.parent / "spec" / "conformance"
    with open(spec_dir / "run-id-vectors.json") as f:
        return json.load(f)


def _vectors_params(vectors_file: str, key: str):
    """Helper to load and parametrize from vector file."""
    spec_dir = Path(__file__).resolve().parent.parent.parent.parent / "spec" / "conformance"
    with open(spec_dir / vectors_file) as f:
        data = json.load(f)
    return data[key]


class TestRunIdConformance:
    """Run ID conformance tests against pinned vectors."""

    @pytest.fixture(autouse=True)
    def _load_vectors(self, run_id_vectors: dict) -> None:
        self.vectors = run_id_vectors

    @pytest.mark.parametrize(
        "vector",
        _vectors_params("run-id-vectors.json", "runIdVectors"),
        ids=lambda v: v["description"],
    )
    def test_canonicalization(self, vector: dict) -> None:
        """Canonical JSON must match exactly."""
        result = canonicalize(vector["inputs"])
        assert result == vector["canonicalized"], (
            f"Canonicalization mismatch for {vector['description']}: "
            f"got {result!r}, expected {vector['canonicalized']!r}"
        )

    @pytest.mark.parametrize(
        "vector",
        _vectors_params("run-id-vectors.json", "runIdVectors"),
        ids=lambda v: v["description"],
    )
    def test_run_id_generation(self, vector: dict) -> None:
        """Run ID must match pinned value exactly."""
        result = generate_run_id(vector["inputs"])
        assert result == vector["runId"], (
            f"Run ID mismatch for {vector['description']}: "
            f"got {result!r}, expected {vector['runId']!r}"
        )


class TestConfigHashConformance:
    """Config hash conformance tests against pinned vectors."""

    @pytest.mark.parametrize(
        "vector",
        _vectors_params("run-id-vectors.json", "configHashVectors"),
        ids=lambda v: v["description"],
    )
    def test_config_hash_canonicalization(self, vector: dict) -> None:
        """Canonical JSON must match exactly."""
        result = canonicalize(vector["config"])
        assert result == vector["canonicalized"], (
            f"Canonicalization mismatch for {vector['description']}: "
            f"got {result!r}, expected {vector['canonicalized']!r}"
        )

    @pytest.mark.parametrize(
        "vector",
        _vectors_params("run-id-vectors.json", "configHashVectors"),
        ids=lambda v: v["description"],
    )
    def test_config_hash_generation(self, vector: dict) -> None:
        """Config hash must match pinned value exactly."""
        result = generate_config_hash(vector["config"])
        assert result == vector["configHash"], (
            f"Config hash mismatch for {vector['description']}: "
            f"got {result!r}, expected {vector['configHash']!r}"
        )
