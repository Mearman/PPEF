/**
 * Metrics Evaluator
 *
 * Evaluates metrics against threshold, baseline, and target-range criteria.
 * This evaluator enables evaluation without claims by checking if metrics
 * meet specified criteria (thresholds, baselines, or target ranges).
 */

import type { AggregatedResult } from "../types/aggregate.js";
import type {
	IEvaluator,
	MetricsCriterion,
	MetricsCriterionResult,
	MetricsEvaluationSummary,
	MetricsEvaluatorConfig,
	MetricsEvaluatorData,
	EvaluationContext,
	Evaluator,
	EvaluationOutput,
	EvaluationSummary,
	ValidationResult,
} from "../types/evaluator.js";

/**
 * Metrics evaluator - evaluates metrics against criteria.
 */
export class MetricsEvaluator
	implements Evaluator<MetricsEvaluatorConfig, EvaluationContext, MetricsEvaluatorData>, IEvaluator
{
	/** Type identifier */
	readonly type = "metrics" as const;

	/** Schema version */
	private static readonly VERSION = "1.0.0";

	/**
	 * Validate metrics evaluator configuration.
	 *
	 * @param config - Configuration to validate
	 * @returns Validation result
	 */
	validateConfig(config: MetricsEvaluatorConfig): ValidationResult {
		const errors: string[] = [];
		const warnings: string[] = [];

		// Check criteria array
		if (!Array.isArray(config.criteria)) {
			errors.push("criteria must be an array");
		} else if (config.criteria.length === 0) {
			warnings.push("No criteria provided - evaluation will produce empty results");
		} else {
			// Validate each criterion
			for (let i = 0; i < config.criteria.length; i++) {
				const criterion = config.criteria[i];
				const criterionErrors = this.validateCriterion(criterion, i);
				errors.push(...criterionErrors);
			}
		}

		return {
			valid: errors.length === 0,
			errors: errors.length > 0 ? errors : undefined,
			warnings: warnings.length > 0 ? warnings : undefined,
		};
	}

	/**
	 * Validate a single criterion.
	 *
	 * @param criterion - Criterion to validate
	 * @param index - Index in criteria array (for error messages)
	 * @returns Array of error messages
	 */
	private validateCriterion(criterion: MetricsCriterion, index: number): string[] {
		const errors: string[] = [];
		const prefix = `Criterion[${index}]`;

		if (!criterion.criterionId || typeof criterion.criterionId !== "string") {
			errors.push(`${prefix}: criterionId is required`);
		}
		if (!criterion.description || typeof criterion.description !== "string") {
			errors.push(`${prefix}: description is required`);
		}
		if (!criterion.metric || typeof criterion.metric !== "string") {
			errors.push(`${prefix}: metric is required`);
		}
		if (!criterion.sut || typeof criterion.sut !== "string") {
			errors.push(`${prefix}: sut is required`);
		}

		// Validate type-specific fields
		switch (criterion.type) {
			case "threshold":
				if (!criterion.threshold) {
					errors.push(`${prefix}: threshold required for threshold type`);
				} else {
					if (!["gt", "gte", "lt", "lte", "eq"].includes(criterion.threshold.operator)) {
						errors.push(`${prefix}: threshold.operator must be valid`);
					}
					if (typeof criterion.threshold.value !== "number") {
						errors.push(`${prefix}: threshold.value must be a number`);
					}
				}
				break;

			case "baseline":
				if (!criterion.baseline) {
					errors.push(`${prefix}: baseline required for baseline type`);
				} else {
					if (!criterion.baseline.sut || typeof criterion.baseline.sut !== "string") {
						errors.push(`${prefix}: baseline.sut is required`);
					}
					if (!["gt", "gte", "lt", "lte", "eq"].includes(criterion.baseline.operator)) {
						errors.push(`${prefix}: baseline.operator must be valid`);
					}
				}
				break;

			case "target-range":
				if (!criterion.targetRange) {
					errors.push(`${prefix}: targetRange required for target-range type`);
				} else {
					if (criterion.targetRange.min === undefined && criterion.targetRange.max === undefined) {
						errors.push(`${prefix}: targetRange must have min or max`);
					}
					if (
						criterion.targetRange.min !== undefined &&
						criterion.targetRange.max !== undefined &&
						criterion.targetRange.min > criterion.targetRange.max
					) {
						errors.push(`${prefix}: targetRange.min must be <= targetRange.max`);
					}
				}
				break;
		}

		return errors;
	}

	/**
	 * Evaluate metrics against criteria.
	 *
	 * @param config - Metrics evaluator configuration
	 * @param input - Evaluation context with aggregates
	 * @returns Evaluation output
	 */
	evaluate(
		config: MetricsEvaluatorConfig,
		input: EvaluationContext,
	): EvaluationOutput<MetricsEvaluatorData> {
		const { aggregates } = input;

		// Evaluate all criteria
		const results: MetricsCriterionResult[] = config.criteria.map((criterion) =>
			this.evaluateCriterion(criterion, aggregates),
		);

		// Compute summary
		const summary = this.computeSummary(results);

		return {
			type: "metrics",
			version: MetricsEvaluator.VERSION,
			timestamp: new Date().toISOString(),
			data: {
				version: "1.0.0",
				timestamp: new Date().toISOString(),
				results,
				summary,
			},
			metadata: {
				inputSource: input.metadata?.source,
				config,
			},
		};
	}

	/**
	 * Evaluate a single criterion.
	 *
	 * @param criterion - Criterion to evaluate
	 * @param aggregates - Aggregated results
	 * @returns Criterion result
	 */
	private evaluateCriterion(
		criterion: MetricsCriterion,
		aggregates: AggregatedResult[],
	): MetricsCriterionResult {
		// Filter aggregates by SUT (or get all if "*")
		const relevantAggregates = this.filterBySut(aggregates, criterion.sut);

		if (relevantAggregates.length === 0) {
			return {
				criterion,
				status: "inconclusive",
				observed: [],
				expected: {
					type: criterion.type,
				},
				inconclusiveReason: `No aggregates found for SUT: ${criterion.sut}`,
			};
		}

		// Collect observed values
		const observed: { sut: string; value: number }[] = [];
		for (const agg of relevantAggregates) {
			if (criterion.metric in agg.metrics) {
				const stats = agg.metrics[criterion.metric];
				if (typeof stats.mean === "number") {
					observed.push({
						sut: agg.sut,
						value: stats.mean,
					});
				}
			}
		}

		if (observed.length === 0) {
			return {
				criterion,
				status: "inconclusive",
				observed: [],
				expected: {
					type: criterion.type,
				},
				inconclusiveReason: `Metric ${criterion.metric} not found in aggregates`,
			};
		}

		// Evaluate based on criterion type
		return this.evaluateByType(criterion, observed, relevantAggregates);
	}

	/**
	 * Filter aggregates by SUT.
	 *
	 * @param aggregates - All aggregates
	 * @param sut - SUT identifier or "*" for all
	 * @returns Filtered aggregates
	 */
	private filterBySut(aggregates: AggregatedResult[], sut: string): AggregatedResult[] {
		if (sut === "*") {
			return aggregates;
		}
		return aggregates.filter((agg) => agg.sut === sut);
	}

	/**
	 * Evaluate criterion by type.
	 *
	 * @param criterion - Criterion to evaluate
	 * @param observed - Observed values
	 * @param aggregates - Filtered aggregates (for baseline comparison)
	 * @returns Criterion result
	 */
	private evaluateByType(
		criterion: MetricsCriterion,
		observed: { sut: string; value: number }[],
		aggregates: AggregatedResult[],
	): MetricsCriterionResult {
		switch (criterion.type) {
			case "threshold":
				return this.evaluateThreshold(criterion, observed);

			case "baseline":
				return this.evaluateBaseline(criterion, observed, aggregates);

			case "target-range":
				return this.evaluateTargetRange(criterion, observed);
		}
	}

	/**
	 * Evaluate threshold criterion.
	 *
	 * @param criterion - Threshold criterion
	 * @param observed - Observed values
	 * @returns Criterion result
	 */
	private evaluateThreshold(
		criterion: MetricsCriterion,
		observed: { sut: string; value: number }[],
	): MetricsCriterionResult {
		if (!criterion.threshold) {
			throw new Error("Threshold criterion must have threshold property");
		}
		const { operator, value } = criterion.threshold;

		// For single SUT, use that result; for multiple, require all to pass
		const status =
			criterion.sut === "*"
				? observed.every((obs) => this.compareOperator(obs.value, operator, value))
					? "pass"
					: "fail"
				: observed.some((obs) => this.compareOperator(obs.value, operator, value))
					? "pass"
					: "fail";

		return {
			criterion,
			status,
			observed,
			expected: {
				type: "threshold",
				threshold: value,
			},
		};
	}

	/**
	 * Evaluate baseline criterion.
	 *
	 * @param criterion - Baseline criterion
	 * @param observed - Observed values
	 * @param aggregates - Filtered aggregates
	 * @returns Criterion result
	 */
	private evaluateBaseline(
		criterion: MetricsCriterion,
		observed: { sut: string; value: number }[],
		aggregates: AggregatedResult[],
	): MetricsCriterionResult {
		if (!criterion.baseline) {
			throw new Error("Baseline criterion must have baseline property");
		}
		const { sut: baselineSut, operator } = criterion.baseline;

		// Find baseline aggregate
		const baselineAgg = aggregates.find((agg) => agg.sut === baselineSut);
		if (!baselineAgg) {
			return {
				criterion,
				status: "inconclusive",
				observed,
				expected: {
					type: "baseline",
				},
				inconclusiveReason: `Baseline SUT not found: ${baselineSut}`,
			};
		}

		if (!(criterion.metric in baselineAgg.metrics)) {
			return {
				criterion,
				status: "inconclusive",
				observed,
				expected: {
					type: "baseline",
				},
				inconclusiveReason: `Baseline metric not found: ${criterion.metric}`,
			};
		}

		const baselineStats = baselineAgg.metrics[criterion.metric];
		if (typeof baselineStats.mean !== "number") {
			return {
				criterion,
				status: "inconclusive",
				observed,
				expected: {
					type: "baseline",
				},
				inconclusiveReason: `Baseline metric not found: ${criterion.metric}`,
			};
		}

		const baselineValue = baselineStats.mean;

		// Check primary observed values against baseline
		const primaryObserved = observed.filter((obs) => obs.sut !== baselineSut);
		const status = primaryObserved.some((obs) =>
			this.compareOperator(obs.value, operator, baselineValue),
		)
			? "pass"
			: "fail";

		return {
			criterion,
			status,
			observed,
			expected: {
				type: "baseline",
				baselineValue,
			},
		};
	}

	/**
	 * Evaluate target-range criterion.
	 *
	 * @param criterion - Target-range criterion
	 * @param observed - Observed values
	 * @returns Criterion result
	 */
	private evaluateTargetRange(
		criterion: MetricsCriterion,
		observed: { sut: string; value: number }[],
	): MetricsCriterionResult {
		if (!criterion.targetRange) {
			throw new Error("Target-range criterion must have targetRange property");
		}
		const { min, max, minInclusive = true, maxInclusive = true } = criterion.targetRange;

		// Check each observed value
		const inRange = (value: number): boolean => {
			const aboveMin = min === undefined || (minInclusive ? value >= min : value > min);
			const belowMax = max === undefined || (maxInclusive ? value <= max : value < max);
			return aboveMin && belowMax;
		};

		// For single SUT, use that result; for multiple, require all to pass
		const status =
			criterion.sut === "*"
				? observed.every((obs) => inRange(obs.value))
					? "pass"
					: "fail"
				: observed.some((obs) => inRange(obs.value))
					? "pass"
					: "fail";

		return {
			criterion,
			status,
			observed,
			expected: {
				type: "target-range",
				targetRange: { min, max },
			},
		};
	}

	/**
	 * Compare value against threshold using operator.
	 *
	 * @param value - Value to check
	 * @param operator - Comparison operator
	 * @param threshold - Threshold value
	 * @returns Whether the comparison passes
	 */
	private compareOperator(value: number, operator: string, threshold: number): boolean {
		switch (operator) {
			case "gt":
				return value > threshold;
			case "gte":
				return value >= threshold;
			case "lt":
				return value < threshold;
			case "lte":
				return value <= threshold;
			case "eq":
				return Math.abs(value - threshold) < 0.0001; // Epsilon for floating point
			default:
				return false;
		}
	}

	/**
	 * Compute summary statistics.
	 *
	 * @param results - All criterion results
	 * @returns Summary statistics
	 */
	private computeSummary(results: MetricsCriterionResult[]): MetricsEvaluationSummary["summary"] {
		const total = results.length;
		const passed = results.filter((r) => r.status === "pass").length;
		const failed = results.filter((r) => r.status === "fail").length;
		const inconclusive = results.filter((r) => r.status === "inconclusive").length;
		const passRate = total > 0 ? passed / total : 0;

		// Compute pass rate by SUT
		const passRateBySut: Record<string, number> = {};
		const sutResults = new Map<string, MetricsCriterionResult[]>();

		for (const result of results) {
			for (const obs of result.observed) {
				const existing = sutResults.get(obs.sut) ?? [];
				existing.push(result);
				sutResults.set(obs.sut, existing);
			}
		}

		for (const [sut, sutResultList] of sutResults) {
			const sutPassed = sutResultList.filter((r) => r.status === "pass").length;
			passRateBySut[sut] = sutPassed / sutResultList.length;
		}

		return {
			total,
			passed,
			failed,
			inconclusive,
			passRate,
			passRateBySut,
		};
	}

	/**
	 * Summarize evaluation output.
	 *
	 * @param output - Evaluation output to summarize
	 * @returns Summary statistics
	 */
	summarize(output: EvaluationOutput<MetricsEvaluatorData>): EvaluationSummary {
		const { summary } = output.data;

		return {
			total: summary.total,
			passed: summary.passed,
			failed: summary.failed,
			inconclusive: summary.inconclusive,
			passRate: summary.passRate,
			additional: {
				passRateBySut: JSON.stringify(summary.passRateBySut),
			},
		};
	}
}
