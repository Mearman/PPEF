/**
 * Evaluation Claims Type Definitions
 *
 * Claims represent explicit hypotheses to be tested. Each claim specifies:
 * - Which SUTs are being compared
 * - Which metric is being evaluated
 * - The expected relationship (greater, less, equal)
 * - The scope of validity
 *
 * This enables claim-driven evaluation where experiments are designed
 * to test specific hypotheses rather than collect arbitrary metrics.
 */

import type { Primitive } from "./case.js";

/**
 * Scope of claim validity.
 *
 * - `global`: Claim should hold across all cases
 * - `caseClass`: Claim holds within specific case classes
 * - `parameterRange`: Claim holds for specific parameter ranges
 * - `localStructure`: Claim depends on local graph structure
 */
export type ValidityScope = "global" | "caseClass" | "parameterRange" | "localStructure";

/**
 * Direction of comparison.
 */
export type ComparisonDirection = "greater" | "less" | "equal";

/**
 * An evaluation claim (hypothesis).
 */
export interface EvaluationClaim {
	/** Unique identifier for this claim */
	claimId: string;

	/** Human-readable description */
	description: string;

	/** Primary SUT being evaluated */
	sut: string;

	/** Baseline SUT for comparison */
	baseline: string;

	/** Metric being compared */
	metric: string;

	/** Expected direction of difference */
	direction: ComparisonDirection;

	/** Optional threshold for the difference */
	threshold?: number;

	/** Scope of validity */
	scope: ValidityScope;

	/** Scope constraints (e.g., { caseClass: "scale-free" }) */
	scopeConstraints?: Record<string, Primitive | Primitive[]>;

	/** Required significance level (default: 0.05) */
	significanceLevel?: number;

	/** Minimum effect size (Cohen's d) */
	minEffectSize?: number;

	/** Tags for filtering */
	tags?: readonly string[];

	/** Citation/reference for the claim */
	citation?: string;
}

/**
 * Status of a claim evaluation.
 */
export type ClaimStatus = "satisfied" | "violated" | "inconclusive";

/**
 * Evidence supporting a claim evaluation.
 */
export interface ClaimEvidence {
	/** Primary SUT metric value */
	primaryValue: number;

	/** Baseline SUT metric value */
	baselineValue: number;

	/** Absolute delta (primary - baseline) */
	delta: number;

	/** Ratio (primary / baseline) */
	ratio: number;

	/** P-value from statistical test */
	pValue?: number;

	/** Effect size (Cohen's d) */
	effectSize?: number;

	/** Number of observations */
	n?: number;

	/** 95% confidence interval for delta */
	deltaCI95?: [number, number];
}

/**
 * Result of evaluating a single claim.
 */
export interface ClaimEvaluation {
	/** The claim being evaluated */
	claim: EvaluationClaim;

	/** Evaluation status */
	status: ClaimStatus;

	/** Supporting evidence */
	evidence: ClaimEvidence;

	/** Reason for inconclusive status (if applicable) */
	inconclusiveReason?: string;

	/** Additional notes */
	notes?: string[];
}

/**
 * Summary of all claim evaluations.
 */
export interface ClaimEvaluationSummary {
	/** Schema version */
	version: string;

	/** Generation timestamp */
	timestamp: string;

	/** Individual claim evaluations */
	evaluations: ClaimEvaluation[];

	/** Summary statistics */
	summary: {
		/** Total claims evaluated */
		total: number;

		/** Claims satisfied */
		satisfied: number;

		/** Claims violated */
		violated: number;

		/** Claims inconclusive */
		inconclusive: number;

		/** Satisfaction rate (satisfied / (satisfied + violated)) */
		satisfactionRate: number;
	};
}
