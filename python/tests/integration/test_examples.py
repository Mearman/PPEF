"""Integration tests for example experiments.

Runs all three example experiments (string-length, sorting-algorithms,
search-algorithms) end-to-end using the Python CLI functions directly,
then evaluates results using shared JSON eval configs.
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent.parent.parent
EXAMPLES_DIR = REPO_ROOT / "examples"


def _setup_example(
    example_name: str,
    config_name: str,
    tmp_path: Path,
    extensions: tuple[str, ...] = (".py", ".json"),
) -> Path:
    """Copy example files to tmp_path and return path to the modified config."""
    src_dir = EXAMPLES_DIR / example_name

    # Copy files with matching extensions
    for f in src_dir.iterdir():
        if f.is_file() and any(f.name.endswith(ext) for ext in extensions):
            shutil.copy2(f, tmp_path / f.name)

    # Override output path in config
    config_path = tmp_path / config_name
    config = json.loads(config_path.read_text())
    config["output"] = {"path": str(tmp_path / "results")}
    config_path.write_text(json.dumps(config))

    return config_path


def _find_aggregates(results_dir: Path) -> Path:
    """Find the aggregates JSON file in a results directory."""
    aggregates_files = [
        f for f in results_dir.iterdir() if "aggregates" in f.name and f.suffix == ".json"
    ]
    assert len(aggregates_files) > 0, f"Expected aggregates file in {results_dir}"
    return aggregates_files[0]


def _run_experiment(config_path: Path) -> None:
    """Run an experiment by directly calling the run command function."""
    from ppef.cli.run_cmd import run

    run(config_file=str(config_path), unsafe_in_process=True, quiet=True)


def _run_evaluator(
    aggregates_path: Path,
    eval_type: str,
    eval_config_path: Path,
    output_path: Path,
) -> dict:
    """Run an evaluator and return the parsed output."""
    from ppef.cli.evaluate_cmd import evaluate

    evaluate(
        aggregates_file=str(aggregates_path),
        eval_type=eval_type,
        config=str(eval_config_path),
        output=str(output_path),
    )
    return json.loads(output_path.read_text())


@pytest.mark.integration
class TestStringLengthExample:
    """Tests for the string-length example with Python modules."""

    def test_single_sut_run(self, tmp_path: Path) -> None:
        config_path = _setup_example("string-length", "experiment-python.json", tmp_path)

        _run_experiment(config_path)

        results_dir = tmp_path / "results"
        assert results_dir.exists(), "Expected results directory"

        json_files = list(results_dir.glob("*.json"))
        assert len(json_files) > 0, "Expected at least one JSON result file"

        content = json.loads(json_files[0].read_text())
        assert "results" in content or "aggregates" in content

    def test_two_sut_run_and_evaluate(self, tmp_path: Path) -> None:
        config_path = _setup_example("string-length", "experiment-two-suts-python.json", tmp_path)

        # Run the experiment
        _run_experiment(config_path)

        results_dir = tmp_path / "results"
        aggregates_path = _find_aggregates(results_dir)

        agg_content = json.loads(aggregates_path.read_text())
        assert isinstance(agg_content.get("aggregates"), list)
        assert len(agg_content["aggregates"]) >= 2

        # Evaluate claims (reuse shared JSON config)
        claims_output = _run_evaluator(
            aggregates_path,
            "claims",
            EXAMPLES_DIR / "string-length" / "eval-claims.json",
            tmp_path / "claims-output.json",
        )
        assert claims_output["type"] == "claims"

        # Evaluate exploratory
        exploratory_output = _run_evaluator(
            aggregates_path,
            "exploratory",
            EXAMPLES_DIR / "string-length" / "eval-exploratory.json",
            tmp_path / "exploratory-output.json",
        )
        assert exploratory_output["type"] == "exploratory"
        assert "rankings" in exploratory_output["data"]

        # Evaluate metrics
        metrics_output = _run_evaluator(
            aggregates_path,
            "metrics",
            EXAMPLES_DIR / "metrics-only" / "eval-config.json",
            tmp_path / "metrics-output.json",
        )
        assert metrics_output["type"] == "metrics"


@pytest.mark.integration
class TestSortingAlgorithmsExample:
    """Tests for the sorting-algorithms example with Python modules."""

    def test_run_and_evaluate(self, tmp_path: Path) -> None:
        config_path = _setup_example("sorting-algorithms", "experiment-python.json", tmp_path)

        # Run 4 SUTs x 6 cases x 10 reps
        _run_experiment(config_path)

        results_dir = tmp_path / "results"
        assert results_dir.exists()

        aggregates_path = _find_aggregates(results_dir)
        agg_content = json.loads(aggregates_path.read_text())
        assert isinstance(agg_content.get("aggregates"), list)
        assert len(agg_content["aggregates"]) >= 4

        # Evaluate claims
        claims_output = _run_evaluator(
            aggregates_path,
            "claims",
            EXAMPLES_DIR / "sorting-algorithms" / "eval-claims.json",
            tmp_path / "claims-output.json",
        )
        assert claims_output["type"] == "claims"

        # Evaluate metrics
        metrics_output = _run_evaluator(
            aggregates_path,
            "metrics",
            EXAMPLES_DIR / "sorting-algorithms" / "eval-metrics.json",
            tmp_path / "metrics-output.json",
        )
        assert metrics_output["type"] == "metrics"

        # Evaluate exploratory
        exploratory_output = _run_evaluator(
            aggregates_path,
            "exploratory",
            EXAMPLES_DIR / "sorting-algorithms" / "eval-exploratory.json",
            tmp_path / "exploratory-output.json",
        )
        assert exploratory_output["type"] == "exploratory"
        assert "rankings" in exploratory_output["data"]
        assert isinstance(exploratory_output["data"]["pairwiseComparisons"], list)


@pytest.mark.integration
class TestSearchAlgorithmsExample:
    """Tests for the search-algorithms example with Python modules."""

    def test_run_and_evaluate(self, tmp_path: Path) -> None:
        config_path = _setup_example("search-algorithms", "experiment-python.json", tmp_path)

        # Run 4 SUTs x 6 cases x 10 reps
        _run_experiment(config_path)

        results_dir = tmp_path / "results"
        assert results_dir.exists()

        aggregates_path = _find_aggregates(results_dir)
        agg_content = json.loads(aggregates_path.read_text())
        assert isinstance(agg_content.get("aggregates"), list)
        assert len(agg_content["aggregates"]) >= 4

        # Evaluate claims
        claims_output = _run_evaluator(
            aggregates_path,
            "claims",
            EXAMPLES_DIR / "search-algorithms" / "eval-claims.json",
            tmp_path / "claims-output.json",
        )
        assert claims_output["type"] == "claims"

        # Evaluate metrics
        metrics_output = _run_evaluator(
            aggregates_path,
            "metrics",
            EXAMPLES_DIR / "search-algorithms" / "eval-metrics.json",
            tmp_path / "metrics-output.json",
        )
        assert metrics_output["type"] == "metrics"

        # Evaluate exploratory
        exploratory_output = _run_evaluator(
            aggregates_path,
            "exploratory",
            EXAMPLES_DIR / "search-algorithms" / "eval-exploratory.json",
            tmp_path / "exploratory-output.json",
        )
        assert exploratory_output["type"] == "exploratory"
        assert "rankings" in exploratory_output["data"]
        assert isinstance(exploratory_output["data"]["pairwiseComparisons"], list)
