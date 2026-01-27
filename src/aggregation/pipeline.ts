/**
 * Aggregation Pipeline
 *
 * Transforms raw evaluation results into aggregated summaries.
 * This is the core of the Execute -> Aggregate -> Render pipeline.
 */

import type {
	AggregatedResult,
	AggregationOutput,
	ComparisonMetrics,
	SummaryStats,
} from "../types/aggregate.js";
import type { EvaluationResult } from "../types/result.js";
import { computeComparison, computeSummaryStats } from "./aggregators.js";

/**
 * Options for the aggregation pipeline.
 */
export interface AggregationPipelineOptions {
	/** Group by case class (default: true) */
	groupByCaseClass?: boolean;

	/** Compute comparisons with baselines (default: true) */
	computeComparisons?: boolean;

	/** Primary SUT ID for comparison (auto-detected if not specified) */
	primarySut?: string;

	/** Baseline SUT IDs for comparison (auto-detected if not specified) */
	baselineSuts?: string[];

	/** Metrics to aggregate (all if not specified) */
	metrics?: string[];
}

/**
 * Default pipeline options.
 */
const DEFAULT_OPTIONS: AggregationPipelineOptions = {
	groupByCaseClass: true,
	computeComparisons: true,
};

/**
 * Aggregate evaluation results into summaries.
 *
 * @param results - Raw evaluation results
 * @param options - Aggregation options
 * @returns Aggregated results
 */
export const aggregateResults = (
	results: EvaluationResult[],
	options: AggregationPipelineOptions = {},
): AggregatedResult[] => {
	const options_ = { ...DEFAULT_OPTIONS, ...options };
	const aggregates: AggregatedResult[] = [];

	// Group results
	const groups = groupResults(results, options_.groupByCaseClass ?? true);

	// Aggregate each group
	for (const [key, groupResults] of groups) {
		const aggregate = aggregateGroup(key, groupResults, options_.metrics);
		aggregates.push(aggregate);
	}

	// Compute comparisons if enabled
	if (options_.computeComparisons) {
		computeAllComparisons(aggregates, results, options_);
	}

	return aggregates;
};

/**
 * Group results by SUT and optionally by case class.
 * @param results
 * @param groupByCaseClass
 */
const groupResults = (
	results: EvaluationResult[],
	groupByCaseClass: boolean,
): Map<string, EvaluationResult[]> => {
	const groups = new Map<string, EvaluationResult[]>();

	for (const result of results) {
		const key =
			groupByCaseClass && result.run.caseClass
				? `${result.run.sut}::${result.run.caseClass}`
				: result.run.sut;

		const existing = groups.get(key) ?? [];
		existing.push(result);
		groups.set(key, existing);
	}

	return groups;
};

/**
 * Aggregate a single group of results.
 * @param key
 * @param results
 * @param metricNames
 */
const aggregateGroup = (
	key: string,
	results: EvaluationResult[],
	metricNames?: string[],
): AggregatedResult => {
	const [sut, caseClass] = key.split("::");
	const firstResult = results[0];

	// Collect all unique cases
	const uniqueCases = new Set(results.map((r) => r.run.caseId));

	// Correctness aggregation
	const validCount = results.filter((r) => r.correctness.valid).length;
	const producedCount = results.filter((r) => r.correctness.producedOutput).length;
	const matchedCount = results.filter((r) => r.correctness.matchesExpected === true).length;
	const hasExpected = results.some((r) => r.correctness.expectedExists);

	// Metric aggregation
	const metricStats: Record<string, SummaryStats> = {};
	const allMetricNames = metricNames ?? getAllMetricNames(results);

	for (const metricName of allMetricNames) {
		const values = results
			.map((r) => getMetricValue(r, metricName))
			.filter((v): v is number => v !== undefined && !Number.isNaN(v));

		if (values.length > 0) {
			metricStats[metricName] = computeSummaryStats(values);
		}
	}

	// Coverage
	const metricCoverage: Record<string, number> = {};
	for (const metricName of allMetricNames) {
		const count = results.filter((r) => hasMetric(r, metricName)).length;
		metricCoverage[metricName] = count / results.length;
	}

	return {
		sut,
		sutRole: firstResult.run.sutRole,
		caseClass,
		group: {
			runCount: results.length,
			caseCount: uniqueCases.size,
		},
		correctness: {
			validRate: results.length > 0 ? validCount / results.length : 0,
			producedOutputRate: results.length > 0 ? producedCount / results.length : 0,
			matchesExpectedRate:
				hasExpected && results.length > 0 ? matchedCount / results.length : undefined,
		},
		metrics: metricStats,
		coverage: {
			caseCoverage: 1, // Would need total cases to compute properly
			metricCoverage,
		},
	};
};

/**
 * Get all unique metric names from results.
 * Checks both metrics.numeric and top-level metrics (e.g., salience-coverage).
 * @param results
 */
const getAllMetricNames = (results: EvaluationResult[]): string[] => {
	const names = new Set<string>();
	for (const result of results) {
		// Add numeric metrics
		for (const name of Object.keys(result.metrics.numeric)) {
			names.add(name);
		}
		// Add top-level metrics (e.g., salience-coverage, salience-recall, etc.)
		for (const name of Object.keys(result.metrics)) {
			if (name !== "numeric" && typeof result.metrics[name] === "number") {
				names.add(name);
			}
		}
	}
	return [...names];
};

/**
 * Get a metric value from a result.
 * Checks top-level metrics first, then falls back to metrics.numeric.
 * @param result
 * @param metricName
 */
const getMetricValue = (result: EvaluationResult, metricName: string): number | undefined => {
	// Check top-level metric first (e.g., salience-coverage)
	const topLevelValue = result.metrics[metricName];
	if (typeof topLevelValue === "number") {
		return topLevelValue;
	}
	// Fall back to numeric metrics
	return result.metrics.numeric[metricName];
};

/**
 * Check if a result has a specific metric.
 * Checks both top-level metrics and metrics.numeric.
 * @param result
 * @param metricName
 */
const hasMetric = (result: EvaluationResult, metricName: string): boolean => {
	// Check top-level metric first (e.g., salience-coverage)
	if (metricName in result.metrics && typeof result.metrics[metricName] === "number") {
		return true;
	}
	// Check numeric metrics
	return metricName in result.metrics.numeric;
};

/**
 * Compute comparisons between primary and baseline SUTs.
 * @param aggregates
 * @param results
 * @param options
 */
const computeAllComparisons = (
	aggregates: AggregatedResult[],
	results: EvaluationResult[],
	options: AggregationPipelineOptions,
): void => {
	// Find primary and baselines
	const primarySut = options.primarySut ?? aggregates.find((a) => a.sutRole === "primary")?.sut;

	const baselineSuts =
		options.baselineSuts ?? aggregates.filter((a) => a.sutRole === "baseline").map((a) => a.sut);

	if (!primarySut || baselineSuts.length === 0) {
		return;
	}

	// For each primary aggregate, compute comparisons
	const primaryAggregates = aggregates.filter((a) => a.sut === primarySut);

	for (const primaryAgg of primaryAggregates) {
		primaryAgg.comparisons = {};

		for (const baselineSut of baselineSuts) {
			// Find matching baseline aggregate (same case class)
			const baselineAgg = aggregates.find(
				(a) => a.sut === baselineSut && a.caseClass === primaryAgg.caseClass,
			);

			if (!baselineAgg) continue;

			// Compute comparison for each shared metric
			const comparisonDeltas: Record<string, number> = {};
			const comparisonRatios: Record<string, number> = {};

			for (const metricName of Object.keys(primaryAgg.metrics)) {
				const primaryStats = primaryAgg.metrics[metricName];
				const baselineStats = baselineAgg.metrics[metricName];

				comparisonDeltas[metricName] = primaryStats.mean - baselineStats.mean;
				comparisonRatios[metricName] =
					baselineStats.mean === 0 ? Infinity : primaryStats.mean / baselineStats.mean;
			}

			// Get raw results for detailed comparison (matched by case ID)
			const primaryResults = results.filter(
				(r) => r.run.sut === primarySut && r.run.caseClass === primaryAgg.caseClass,
			);
			const baselineResults = results.filter(
				(r) => r.run.sut === baselineSut && r.run.caseClass === primaryAgg.caseClass,
			);

			// Compute statistical comparison using first shared metric
			const sharedMetrics = Object.keys(primaryAgg.metrics).filter((m) => m in baselineAgg.metrics);

			let comparisonMetrics: ComparisonMetrics | undefined;
			if (sharedMetrics.length > 0) {
				const metricName = sharedMetrics[0];
				comparisonMetrics = computeComparison(primaryResults, baselineResults, metricName);
			}

			// Merge per-metric deltas with statistical metrics
			primaryAgg.comparisons[baselineSut] = {
				deltas: comparisonDeltas,
				ratios: comparisonRatios,
				betterRate: comparisonMetrics?.betterRate,
				uStatistic: comparisonMetrics?.uStatistic,
				pValue: comparisonMetrics?.pValue,
				effectSize: comparisonMetrics?.effectSize,
			};
		}
	}
};

/**
 * Create a full aggregation output document.
 * @param aggregates
 * @param results
 */
export const createAggregationOutput = (
	aggregates: AggregatedResult[],
	results: EvaluationResult[],
): AggregationOutput => {
	const uniqueSuts = [...new Set(aggregates.map((a) => a.sut))];
	const uniqueCaseClasses = [
		...new Set(aggregates.map((a) => a.caseClass).filter((c): c is string => c !== undefined)),
	];
	const uniqueCases = [...new Set(results.map((r) => r.run.caseId))];

	return {
		version: "1.0.0",
		timestamp: new Date().toISOString(),
		aggregates,
		metadata: {
			totalRuns: results.length,
			totalCases: uniqueCases.length,
			sutsIncluded: uniqueSuts,
			caseClassesIncluded: uniqueCaseClasses.length > 0 ? uniqueCaseClasses : undefined,
		},
	};
};
