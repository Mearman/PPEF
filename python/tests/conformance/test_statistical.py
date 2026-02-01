"""Conformance tests for statistical functions.

Tests against pinned vectors in spec/conformance/statistical-vectors.json.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from ppef.statistical.mann_whitney import (
    cohens_d,
    confidence_interval,
    mann_whitney_u_test,
    normal_cdf,
)

SPEC_DIR = Path(__file__).resolve().parent.parent.parent.parent / "spec" / "conformance"


def load_statistical_vectors() -> list[dict]:
    with open(SPEC_DIR / "statistical-vectors.json") as f:
        data = json.load(f)
    return data["vectors"]


ALL_VECTORS = load_statistical_vectors()


def vectors_by_function(func_name: str) -> list[dict]:
    return [v for v in ALL_VECTORS if v["function"] == func_name]


class TestNormalCDFConformance:
    @pytest.mark.parametrize(
        "vector",
        vectors_by_function("normalCDF"),
        ids=lambda v: v["description"],
    )
    def test_normal_cdf(self, vector: dict) -> None:
        result = normal_cdf(vector["inputs"]["z"])
        expected = vector["expected"]["result"]
        tolerance = vector["tolerance"]
        assert result == pytest.approx(expected, abs=tolerance), (
            f"normalCDF({vector['inputs']['z']}) = {result}, expected {expected}"
        )


class TestMannWhitneyConformance:
    @pytest.mark.parametrize(
        "vector",
        vectors_by_function("mannWhitneyUTest"),
        ids=lambda v: v["description"],
    )
    def test_mann_whitney_u(self, vector: dict) -> None:
        result = mann_whitney_u_test(vector["inputs"]["sampleA"], vector["inputs"]["sampleB"])
        tolerance = vector["tolerance"]
        assert result.u == pytest.approx(vector["expected"]["u"], abs=tolerance)
        assert result.p_value == pytest.approx(vector["expected"]["pValue"], abs=tolerance)
        assert result.significant == vector["expected"]["significant"]


class TestCohensDConformance:
    @pytest.mark.parametrize(
        "vector",
        vectors_by_function("cohensD"),
        ids=lambda v: v["description"],
    )
    def test_cohens_d(self, vector: dict) -> None:
        result = cohens_d(vector["inputs"]["sampleA"], vector["inputs"]["sampleB"])
        expected = vector["expected"]["result"]
        tolerance = vector["tolerance"]
        assert result == pytest.approx(expected, abs=tolerance), (
            f"cohensD = {result}, expected {expected}"
        )


class TestConfidenceIntervalConformance:
    @pytest.mark.parametrize(
        "vector",
        vectors_by_function("confidenceInterval"),
        ids=lambda v: v["description"],
    )
    def test_confidence_interval(self, vector: dict) -> None:
        result = confidence_interval(vector["inputs"]["values"])
        tolerance = vector["tolerance"]
        assert result.lower == pytest.approx(vector["expected"]["lower"], abs=tolerance)
        assert result.upper == pytest.approx(vector["expected"]["upper"], abs=tolerance)
