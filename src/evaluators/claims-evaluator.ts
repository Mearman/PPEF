/**
 * Claims Evaluator
 *
 * Evaluates explicit hypotheses (claims) against aggregated results.
 * Refactored from src/claims/evaluator.ts into a class-based design
 * that implements the Evaluator interface.
 */

import type { AggregatedResult } from "../types/aggregate.js";
import type {
	ClaimEvaluation,
	ClaimEvaluationSummary,
	ClaimEvidence,
	ClaimStatus,
	EvaluationClaim,
} from "../types/claims.js";
import type {
	IEvaluator,
	ClaimsEvaluatorConfig,
	ClaimsEvaluatorData,
	EvaluationContext,
	Evaluator,
	EvaluationOutput,
	EvaluationSummary,
	ValidationResult,
} from "../types/evaluator.js";

/**
 * Claims evaluator - evaluates hypotheses against aggregated results.
 */
export class ClaimsEvaluator
	implements Evaluator<ClaimsEvaluatorConfig, EvaluationContext, ClaimsEvaluatorData>, IEvaluator
{
	/** Type identifier */
	readonly type = "claims" as const;

	/** Schema version */
	private static readonly VERSION = "1.0.0";

	/**
	 * Validate claims evaluator configuration.
	 *
	 * @param config - Configuration to validate
	 * @returns Validation result
	 */
	validateConfig(config: ClaimsEvaluatorConfig): ValidationResult {
		const errors: string[] = [];
		const warnings: string[] = [];

		// Check claims array
		if (!Array.isArray(config.claims)) {
			errors.push("claims must be an array");
			return { valid: false, errors, warnings };
		}

		if (config.claims.length === 0) {
			warnings.push("No claims provided - evaluation will produce empty results");
		}

		// Validate each claim
		for (let i = 0; i < config.claims.length; i++) {
			const claim = config.claims[i];
			const claimErrors = this.validateClaim(claim, i);
			errors.push(...claimErrors);
		}

		return {
			valid: errors.length === 0,
			errors: errors.length > 0 ? errors : undefined,
			warnings: warnings.length > 0 ? warnings : undefined,
		};
	}

	/**
	 * Validate a single claim.
	 *
	 * @param claim - Claim to validate
	 * @param index - Index in claims array (for error messages)
	 * @returns Array of error messages
	 */
	private validateClaim(claim: EvaluationClaim, index: number): string[] {
		const errors: string[] = [];
		const prefix = `Claim[${index}]`;

		if (!claim.claimId || typeof claim.claimId !== "string") {
			errors.push(`${prefix}: claimId is required`);
		}
		if (!claim.description || typeof claim.description !== "string") {
			errors.push(`${prefix}: description is required`);
		}
		if (!claim.sut || typeof claim.sut !== "string") {
			errors.push(`${prefix}: sut is required`);
		}
		if (!claim.baseline || typeof claim.baseline !== "string") {
			errors.push(`${prefix}: baseline is required`);
		}
		if (!claim.metric || typeof claim.metric !== "string") {
			errors.push(`${prefix}: metric is required`);
		}
		if (!["greater", "less", "equal"].includes(claim.direction)) {
			errors.push(`${prefix}: direction must be 'greater', 'less', or 'equal'`);
		}
		if (claim.threshold !== undefined && typeof claim.threshold !== "number") {
			errors.push(`${prefix}: threshold must be a number`);
		}
		if (!["global", "caseClass", "parameterRange", "localStructure"].includes(claim.scope)) {
			errors.push(`${prefix}: scope must be a valid ValidityScope`);
		}

		return errors;
	}

	/**
	 * Evaluate claims against aggregated results.
	 *
	 * @param config - Claims evaluator configuration
	 * @param input - Evaluation context with aggregates
	 * @returns Evaluation output
	 */
	evaluate(
		config: ClaimsEvaluatorConfig,
		input: EvaluationContext,
	): EvaluationOutput<ClaimsEvaluatorData> {
		const { aggregates } = input;

		// Evaluate all claims
		const evaluations: ClaimEvaluation[] = config.claims.map((claim) =>
			this.evaluateClaim(claim, aggregates),
		);

		// Create summary
		const summary = this.createClaimSummary(evaluations);

		return {
			type: "claims",
			version: ClaimsEvaluator.VERSION,
			timestamp: new Date().toISOString(),
			data: summary,
			metadata: {
				inputSource: input.metadata?.source,
				config,
			},
		};
	}

	/**
	 * Evaluate a single claim against aggregated results.
	 *
	 * @param claim - The claim to evaluate
	 * @param aggregates - Aggregated results from the pipeline
	 * @returns Claim evaluation with status and evidence
	 */
	private evaluateClaim(claim: EvaluationClaim, aggregates: AggregatedResult[]): ClaimEvaluation {
		// Filter aggregates by scope constraints
		const filteredAggregates = this.filterByScope(aggregates, claim);

		// Find primary and baseline aggregates
		const primaryAgg = filteredAggregates.find((a) => a.sut === claim.sut);
		const baselineAgg = filteredAggregates.find((a) => a.sut === claim.baseline);

		// Handle missing data
		if (!primaryAgg || !baselineAgg) {
			return this.createInconclusiveResult(
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
			return this.createInconclusiveResult(
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
		const status = this.determineClaimStatus(claim, evidence);

		return {
			claim,
			status,
			evidence,
		};
	}

	/**
	 * Filter aggregates by claim scope constraints.
	 *
	 * @param aggregates - All aggregates
	 * @param claim - Claim with scope constraints
	 * @returns Filtered aggregates
	 */
	private filterByScope(
		aggregates: AggregatedResult[],
		claim: EvaluationClaim,
	): AggregatedResult[] {
		if (!claim.scopeConstraints) {
			return aggregates;
		}

		return aggregates.filter((agg) => {
			for (const [key, value] of Object.entries(claim.scopeConstraints ?? {})) {
				if (key === "caseClass") {
					const allowedClasses = Array.isArray(value) ? value : [value];
					if (agg.caseClass === undefined || !allowedClasses.includes(agg.caseClass)) {
						return false;
					}
				}
				// Add more scope constraint checks as needed
			}
			return true;
		});
	}

	/**
	 * Create an inconclusive result with reasons.
	 *
	 * @param claim - The claim being evaluated
	 * @param reasons - Reasons for inconclusive status
	 * @returns Inconclusive claim evaluation
	 */
	private createInconclusiveResult(
		claim: EvaluationClaim,
		...reasons: (string | undefined)[]
	): ClaimEvaluation {
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
	}

	/**
	 * Determine claim status based on evidence.
	 *
	 * @param claim - The claim being evaluated
	 * @param evidence - Computed evidence
	 * @returns Claim status
	 */
	private determineClaimStatus(claim: EvaluationClaim, evidence: ClaimEvidence): ClaimStatus {
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
	}

	/**
	 * Create a claim evaluation summary.
	 *
	 * @param evaluations - Completed claim evaluations
	 * @returns Summary with counts and rates
	 */
	private createClaimSummary(evaluations: ClaimEvaluation[]): ClaimEvaluationSummary {
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
	}

	/**
	 * Summarize evaluation output.
	 *
	 * @param output - Evaluation output to summarize
	 * @returns Summary statistics
	 */
	summarize(output: EvaluationOutput<ClaimsEvaluatorData>): EvaluationSummary {
		const { summary } = output.data;

		return {
			total: summary.total,
			passed: summary.satisfied,
			failed: summary.violated,
			inconclusive: summary.inconclusive,
			passRate: summary.satisfactionRate,
			additional: {
				satisfactionRate: summary.satisfactionRate,
			},
		};
	}
}
