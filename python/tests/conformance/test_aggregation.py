"""Conformance tests for aggregation functions.

Tests against pinned vectors in spec/conformance/aggregation-vectors.json.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import pytest

from ppef.aggregation.aggregators import compute_summary_stats

SPEC_DIR = Path(__file__).resolve().parent.parent.parent.parent / "spec" / "conformance"


def load_aggregation_vectors() -> list[dict]:
    with open(SPEC_DIR / "aggregation-vectors.json") as f:
        data = json.load(f)
    return data["vectors"]


ALL_VECTORS = load_aggregation_vectors()


class TestComputeSummaryStatsConformance:
    @pytest.mark.parametrize(
        "vector",
        ALL_VECTORS,
        ids=lambda v: v["description"],
    )
    def test_compute_summary_stats(self, vector: dict) -> None:
        result = compute_summary_stats(vector["inputs"])
        expected = vector["expected"]
        tolerance = vector["tolerance"]

        assert result.n == expected["n"]

        # Handle NaN for empty arrays
        if expected["mean"] is None:
            assert math.isnan(result.mean)
        else:
            assert result.mean == pytest.approx(expected["mean"], abs=tolerance)

        if expected["median"] is None:
            assert math.isnan(result.median)
        else:
            assert result.median == pytest.approx(expected["median"], abs=tolerance)

        if expected["min"] is None:
            assert math.isnan(result.min)
        else:
            assert result.min == pytest.approx(expected["min"], abs=tolerance)

        if expected["max"] is None:
            assert math.isnan(result.max)
        else:
            assert result.max == pytest.approx(expected["max"], abs=tolerance)

        if expected["std"] is None:
            assert result.std is None
        else:
            assert result.std == pytest.approx(expected["std"], abs=tolerance)

        if expected["confidence95"] is None:
            assert result.confidence95 is None
        else:
            assert result.confidence95 is not None
            assert result.confidence95[0] == pytest.approx(
                expected["confidence95"][0], abs=tolerance
            )
            assert result.confidence95[1] == pytest.approx(
                expected["confidence95"][1], abs=tolerance
            )

        if expected["sum"] is None:
            assert result.sum is None
        else:
            assert result.sum == pytest.approx(expected["sum"], abs=tolerance)

        if expected["p25"] is None:
            assert result.p25 is None
        else:
            assert result.p25 == pytest.approx(expected["p25"], abs=tolerance)

        if expected["p75"] is None:
            assert result.p75 is None
        else:
            assert result.p75 == pytest.approx(expected["p75"], abs=tolerance)
