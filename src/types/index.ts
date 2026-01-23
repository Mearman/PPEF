/**
 * Framework Type Definitions
 *
 * Re-exports all canonical types for the evaluation framework.
 */

// SUT types
export type { SutDefinition, SutFactory, SutRegistration, SutRole } from "./sut.js";

// Case types
export type {
	ArtefactReference,
	CaseDefinition,
	CaseInputs,
	EvaluationCase,
	Primitive,
} from "./case.js";

// Result types
export type {
	CorrectnessResult,
	EvaluationResult,
	FailureType,
	Provenance,
	RankedItem,
	ResultBatch,
	ResultMetrics,
	ResultOutputs,
	RunContext,
} from "./result.js";

// Aggregate types
export type {
	AggregatedResult,
	AggregationOutput,
	ComparisonMetrics,
	CoverageMetrics,
	SummaryStats,
} from "./aggregate.js";

// Claims types
export type {
	ClaimEvaluation,
	ClaimEvaluationSummary,
	ClaimEvidence,
	ClaimStatus,
	ComparisonDirection,
	EvaluationClaim,
	ValidityScope,
} from "./claims.js";

// Perturbation types
export type {
	Perturbation,
	PerturbationConfig,
	PerturbationType,
	RobustnessAnalysisOutput,
	RobustnessAnalysisResult,
	RobustnessMetrics,
} from "./perturbation.js";
