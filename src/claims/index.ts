/**
 * Claims Module
 *
 * Claim types and definitions.
 *
 * The claims evaluator has been moved to src/evaluators/claims-evaluator.ts.
 * Please import from the evaluators module for the new class-based API.
 */

export type {
	ClaimEvaluation,
	ClaimEvaluationSummary,
	ClaimEvidence,
	ClaimStatus,
	EvaluationClaim,
	ValidityScope,
	ComparisonDirection,
} from "../types/claims.js";
