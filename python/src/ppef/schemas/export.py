"""Schema Export.

Export Pydantic models as JSON Schema using model_json_schema().
Collects all output type models and generates a combined schema with $defs.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from pydantic import BaseModel


def get_all_models() -> list[type[BaseModel]]:
    """Collect all Pydantic models from the types module.

    Returns:
        List of all Pydantic model classes in ppef.types.
    """
    from ppef.types.aggregate import (
        AggregatedResult,
        AggregationOutput,
        ComparisonMetrics,
        CoverageMetrics,
        SummaryStats,
    )
    from ppef.types.case import ArtefactReference, CaseInputs, EvaluationCase
    from ppef.types.claims import (
        ClaimEvaluation,
        ClaimEvaluationSummary,
        ClaimEvidence,
        EvaluationClaim,
    )
    from ppef.types.evaluator import (
        CaseClassEffect,
        ClaimsEvaluatorConfig,
        EvaluationSummary,
        EvaluatorConfig,
        ExploratoryEvaluationSummary,
        ExploratoryEvaluatorConfig,
        MetricCorrelation,
        MetricsCriterion,
        MetricsCriterionResult,
        MetricsEvaluationSummary,
        MetricsEvaluatorConfig,
        PairwiseComparison,
        RobustnessEvaluatorConfig,
        SutMetricRanking,
        ValidationResult,
    )
    from ppef.types.perturbation import (
        DegradationPoint,
        PerturbationConfig,
        RobustnessAnalysisOutput,
        RobustnessAnalysisResult,
        RobustnessMetrics,
    )
    from ppef.types.result import (
        CorrectnessResult,
        EvaluationResult,
        Provenance,
        RankedItem,
        ResultBatch,
        ResultMetrics,
        ResultOutputs,
        RunContext,
    )
    from ppef.types.sut import SutRegistration

    return [
        # Result types
        RunContext,
        CorrectnessResult,
        RankedItem,
        ArtefactReference,
        ResultOutputs,
        ResultMetrics,
        Provenance,
        EvaluationResult,
        ResultBatch,
        # Case types
        CaseInputs,
        EvaluationCase,
        # SUT types
        SutRegistration,
        # Aggregate types
        SummaryStats,
        ComparisonMetrics,
        CoverageMetrics,
        AggregatedResult,
        AggregationOutput,
        # Claim types
        EvaluationClaim,
        ClaimEvidence,
        ClaimEvaluation,
        ClaimEvaluationSummary,
        # Evaluator types
        EvaluatorConfig,
        ValidationResult,
        EvaluationSummary,
        ClaimsEvaluatorConfig,
        RobustnessEvaluatorConfig,
        MetricsCriterion,
        MetricsCriterionResult,
        MetricsEvaluationSummary,
        MetricsEvaluatorConfig,
        SutMetricRanking,
        PairwiseComparison,
        CaseClassEffect,
        MetricCorrelation,
        ExploratoryEvaluatorConfig,
        ExploratoryEvaluationSummary,
        # Perturbation types
        PerturbationConfig,
        DegradationPoint,
        RobustnessMetrics,
        RobustnessAnalysisResult,
        RobustnessAnalysisOutput,
    ]


def export_json_schema(
    output_path: str | Path | None = None,
) -> dict[str, Any]:
    """Export all Pydantic models as a combined JSON Schema.

    Generates a schema with all models available under $defs.
    The root schema references EvaluationResult as the primary type,
    with all other models accessible via $defs.

    Args:
        output_path: Optional path to write the schema JSON file.

    Returns:
        The generated JSON Schema as a dict.
    """
    models = get_all_models()

    # Collect all $defs from all models
    all_defs: dict[str, Any] = {}
    for model in models:
        schema = model.model_json_schema(mode="serialization")
        # Extract $defs
        if "$defs" in schema:
            all_defs.update(schema["$defs"])
        # Add the model itself as a def
        model_name = model.__name__
        model_schema = {k: v for k, v in schema.items() if k != "$defs"}
        all_defs[model_name] = model_schema

    # Build combined schema
    combined_schema: dict[str, Any] = {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "title": "PPEF Schema",
        "description": "Portable Programmatic Evaluation Framework - Combined JSON Schema",
        "$defs": all_defs,
        # Root references EvaluationResult
        "$ref": "#/$defs/EvaluationResult",
    }

    if output_path is not None:
        path = Path(output_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            json.dumps(combined_schema, indent=2, default=str) + "\n",
            encoding="utf-8",
        )

    return combined_schema
