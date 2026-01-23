/**
 * Claims Evaluator
 *
 * Evaluates explicit hypotheses (claims) against aggregated results.
 * This enables claim-driven evaluation where experiments test specific
 * hypotheses rather than collect arbitrary metrics.
 */

import type { AggregatedResult } from "../types/aggregate.js";
import type { Primitive } from "../types/case.js";
import type {
	ClaimEvaluation,
	ClaimEvaluationSummary,
	ClaimEvidence,
	ClaimStatus,
	EvaluationClaim,
} from "../types/claims.js";

/**
 * Evaluate a single claim against aggregated results.
 *
 * @param claim - The claim to evaluate
 * @param aggregates - Aggregated results from the pipeline
 * @returns Claim evaluation with status and evidence
 */
export const evaluateClaim = (
	claim: EvaluationClaim,
	aggregates: AggregatedResult[],
): ClaimEvaluation => {
	// Filter aggregates by scope constraints
	const filteredAggregates = filterByScope(aggregates, claim);

	// Find primary and baseline aggregates
	const primaryAgg = filteredAggregates.find((a) => a.sut === claim.sut);
	const baselineAgg = filteredAggregates.find((a) => a.sut === claim.baseline);

	// Handle missing data
	if (!primaryAgg || !baselineAgg) {
		return createInconclusiveResult(
			claim,
			primaryAgg ? undefined : "Primary SUT not found",
			baselineAgg ? undefined : "Baseline SUT not found",
		);
	}

	// Get metric values
	const primaryMetric = claim.metric;
	const baselineMetric = claim.metric;
	const primaryStats = primaryAgg.metrics[primaryMetric];
	const baselineStats = baselineAgg.metrics[baselineMetric];

	if (!(primaryMetric in primaryAgg.metrics) || !(baselineMetric in baselineAgg.metrics)) {
		return createInconclusiveResult(
			claim,
			"Metric not found in primary results",
			"Metric not found in baseline results",
		);
	}

	// Compute evidence
	const primaryValue = primaryStats.mean;
	const baselineValue = baselineStats.mean;
	const delta = primaryValue - baselineValue;
	const ratio = baselineValue === 0 ? Infinity : primaryValue / baselineValue;

	// Get statistical significance if available
	const comparison = primaryAgg.comparisons?.[claim.baseline];
	const pValue = comparison?.pValue;
	const effectSize = comparison?.effectSize;

	const evidence: ClaimEvidence = {
		primaryValue,
		baselineValue,
		delta,
		ratio,
		pValue,
		effectSize,
		n: primaryStats.n + baselineStats.n,
	};

	// Determine claim status
	const status = determineClaimStatus(claim, evidence);

	return {
		claim,
		status,
		evidence,
	};
};

/**
 * Filter aggregates by claim scope constraints.
 * @param aggregates
 * @param claim
 */
const filterByScope = (
	aggregates: AggregatedResult[],
	claim: EvaluationClaim,
): AggregatedResult[] => {
	if (!claim.scopeConstraints) {
		return aggregates;
	}

	return aggregates.filter((agg) => {
		for (const [key, value] of Object.entries(claim.scopeConstraints ?? {})) {
			if (key === "caseClass") {
				const allowedClasses = Array.isArray(value) ? value : [value];
				if (!allowedClasses.includes(agg.caseClass as Primitive)) {
					return false;
				}
			}
			// Add more scope constraint checks as needed
		}
		return true;
	});
};

/**
 * Create an inconclusive result with reasons.
 * @param claim
 * @param reasons
 */
const createInconclusiveResult = (
	claim: EvaluationClaim,
	...reasons: (string | undefined)[]
): ClaimEvaluation => {
	const validReasons = reasons.filter((r): r is string => r !== undefined);

	return {
		claim,
		status: "inconclusive",
		evidence: {
			primaryValue: Number.NaN,
			baselineValue: Number.NaN,
			delta: Number.NaN,
			ratio: Number.NaN,
		},
		inconclusiveReason: validReasons.join("; "),
	};
};

/**
 * Determine claim status based on evidence.
 * @param claim
 * @param evidence
 */
const determineClaimStatus = (claim: EvaluationClaim, evidence: ClaimEvidence): ClaimStatus => {
	// Check for missing data
	if (Number.isNaN(evidence.primaryValue) || Number.isNaN(evidence.baselineValue)) {
		return "inconclusive";
	}

	// Check statistical significance if required
	const significanceLevel = claim.significanceLevel ?? 0.05;
	if (evidence.pValue !== undefined && evidence.pValue > significanceLevel) {
		return "inconclusive";
	}

	// Check minimum effect size if required
	if (
		claim.minEffectSize !== undefined &&
		evidence.effectSize !== undefined &&
		Math.abs(evidence.effectSize) < claim.minEffectSize
	) {
		return "inconclusive";
	}

	// Evaluate direction
	switch (claim.direction) {
		case "greater": {
			if (claim.threshold !== undefined) {
				return evidence.delta >= claim.threshold ? "satisfied" : "violated";
			}
			return evidence.delta > 0 ? "satisfied" : "violated";
		}

		case "less": {
			if (claim.threshold !== undefined) {
				return evidence.delta <= -claim.threshold ? "satisfied" : "violated";
			}
			return evidence.delta < 0 ? "satisfied" : "violated";
		}

		case "equal": {
			const epsilon = claim.threshold ?? 0.001;
			return Math.abs(evidence.delta) <= epsilon ? "satisfied" : "violated";
		}
	}
};

/**
 * Evaluate multiple claims against aggregated results.
 *
 * @param claims - Claims to evaluate
 * @param aggregates - Aggregated results
 * @returns Array of claim evaluations
 */
export const evaluateClaims = (
	claims: EvaluationClaim[],
	aggregates: AggregatedResult[],
): ClaimEvaluation[] => claims.map((claim) => evaluateClaim(claim, aggregates));

/**
 * Create a claim evaluation summary.
 *
 * @param evaluations - Completed claim evaluations
 * @returns Summary with counts and rates
 */
export const createClaimSummary = (evaluations: ClaimEvaluation[]): ClaimEvaluationSummary => {
	const satisfied = evaluations.filter((e) => e.status === "satisfied").length;
	const violated = evaluations.filter((e) => e.status === "violated").length;
	const inconclusive = evaluations.filter((e) => e.status === "inconclusive").length;

	const definitive = satisfied + violated;
	const satisfactionRate = definitive > 0 ? satisfied / definitive : 0;

	return {
		version: "1.0.0",
		timestamp: new Date().toISOString(),
		evaluations,
		summary: {
			total: evaluations.length,
			satisfied,
			violated,
			inconclusive,
			satisfactionRate,
		},
	};
};
