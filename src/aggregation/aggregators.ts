/**
 * Aggregation Functions
 *
 * Pure functions for computing aggregated statistics from evaluation results.
 * These functions are extracted from inline table generation code to ensure
 * separation of concerns.
 */

import { mannWhitneyUTest } from "../statistical/mann-whitney-u.js";
import type { ComparisonMetrics, SummaryStats } from "../types/aggregate.js";
import type { EvaluationResult } from "../types/result.js";

/**
 * Compute summary statistics for an array of numbers.
 *
 * @param values - Array of numeric values
 * @returns Summary statistics
 */
export const computeSummaryStats = (values: number[]): SummaryStats => {
	if (values.length === 0) {
		return {
			n: 0,
			mean: Number.NaN,
			median: Number.NaN,
			min: Number.NaN,
			max: Number.NaN,
		};
	}

	const n = values.length;
	const sorted = [...values].sort((a, b) => a - b);
	const sum = values.reduce((accumulator, v) => accumulator + v, 0);
	const mean = sum / n;
	const min = sorted[0];
	const max = sorted[n - 1];

	// Median
	const midIndex = Math.floor(n / 2);
	const median = n % 2 === 0 ? (sorted[midIndex - 1] + sorted[midIndex]) / 2 : sorted[midIndex];

	// Standard deviation (sample)
	let std: number | undefined;
	if (n > 1) {
		const squaredDiffs = values.map((v) => (v - mean) ** 2);
		const variance = squaredDiffs.reduce((accumulator, v) => accumulator + v, 0) / (n - 1);
		std = Math.sqrt(variance);
	}

	// 95% confidence interval (assumes normal distribution)
	let confidence95: [number, number] | undefined;
	if (std !== undefined && n > 1) {
		const standardError = std / Math.sqrt(n);
		const tValue = getTValue(n - 1, 0.975); // Two-tailed 95% CI
		const margin = tValue * standardError;
		confidence95 = [mean - margin, mean + margin];
	}

	// Percentiles
	const p25 = sorted[Math.floor(n * 0.25)];
	const p75 = sorted[Math.floor(n * 0.75)];

	return {
		n,
		mean,
		median,
		min,
		max,
		std,
		confidence95,
		sum,
		p25,
		p75,
	};
};

/**
 * Compute speedup ratio (baseline / treatment).
 *
 * @param baselineTime - Baseline execution time
 * @param treatmentTime - Treatment execution time
 * @returns Speedup ratio
 */
export const computeSpeedup = (baselineTime: number, treatmentTime: number): number => {
	if (treatmentTime === 0) return Infinity;
	return baselineTime / treatmentTime;
};

/**
 * Compute maximum speedup from multiple pairs.
 *
 * @param pairs - Array of [baseline, treatment] time pairs
 * @returns Maximum speedup ratio
 */
export const computeMaxSpeedup = (pairs: [number, number][]): number => {
	if (pairs.length === 0) return 0;
	return Math.max(...pairs.map(([b, t]) => computeSpeedup(b, t)));
};

/**
 * Compute comparison metrics between primary and baseline results.
 *
 * @param primaryResults - Full result objects from primary SUT
 * @param baselineResults - Full result objects from baseline SUT
 * @param metricName - Metric to compare
 * @returns Comparison metrics
 */
export const computeComparison = (
	primaryResults: EvaluationResult[],
	baselineResults: EvaluationResult[],
	metricName: string,
): ComparisonMetrics => {
	// Extract values and match by case ID
	const primaryByCase = new Map<string, number | undefined>();
	const baselineByCase = new Map<string, number | undefined>();

	for (const result of primaryResults) {
		const value = result.metrics.numeric[metricName];
		primaryByCase.set(result.run.caseId, value);
	}

	for (const result of baselineResults) {
		const value = result.metrics.numeric[metricName];
		baselineByCase.set(result.run.caseId, value);
	}

	// Get matching case IDs
	const commonCaseIds = [...primaryByCase.keys()].filter((id) => baselineByCase.has(id));

	if (commonCaseIds.length === 0) {
		return {
			deltas: { default: 0 },
			ratios: { default: 1 },
		};
	}

	// Extract paired values
	const primaryValues: number[] = [];
	const baselineValues: number[] = [];
	for (const caseId of commonCaseIds) {
		const primaryValue = primaryByCase.get(caseId);
		const baselineValue = baselineByCase.get(caseId);
		if (primaryValue !== undefined && baselineValue !== undefined) {
			primaryValues.push(primaryValue);
			baselineValues.push(baselineValue);
		}
	}

	const primaryStats = computeSummaryStats(primaryValues);
	const baselineStats = computeSummaryStats(baselineValues);

	const delta = primaryStats.mean - baselineStats.mean;
	const ratio = baselineStats.mean === 0 ? Infinity : primaryStats.mean / baselineStats.mean;

	// Win rate: percentage of cases where primary > baseline (paired by case ID)
	let wins = 0;
	for (const [index, primaryValue] of primaryValues.entries()) {
		if (primaryValue > baselineValues[index]) {
			wins++;
		}
	}
	const betterRate = wins / primaryValues.length;

	// Mann-Whitney U test for statistical significance
	const mwuResult = mannWhitneyUTest(primaryValues, baselineValues);

	// Effect size (Cohen's d)
	let effectSize: number | undefined;
	if (
		primaryStats.std !== undefined &&
		baselineStats.std !== undefined &&
		primaryStats.n > 1 &&
		baselineStats.n > 1
	) {
		const pooledStd = Math.sqrt(
			((primaryStats.n - 1) * primaryStats.std ** 2 +
				(baselineStats.n - 1) * baselineStats.std ** 2) /
				(primaryStats.n + baselineStats.n - 2),
		);
		effectSize = pooledStd === 0 ? 0 : Math.abs(delta) / pooledStd;
	}

	return {
		deltas: { default: delta },
		ratios: { default: ratio },
		betterRate,
		uStatistic: mwuResult.u,
		pValue: mwuResult.pValue,
		effectSize,
	};
};

/**
 * Compute rankings from results.
 *
 * @param results - Results to rank
 * @param metricName - Metric to rank by
 * @param ascending - Sort ascending (lower is better)
 * @returns Ranked results with positions
 */
export const computeRankings = (
	results: EvaluationResult[],
	metricName: string,
	ascending = false,
): { result: EvaluationResult; rank: number; value: number }[] => {
	const withValues = results
		.map((result) => ({
			result,
			value: result.metrics.numeric[metricName] ?? Number.NaN,
		}))
		.filter(({ value }) => !Number.isNaN(value));

	// Sort
	withValues.sort((a, b) => (ascending ? a.value - b.value : b.value - a.value));

	// Assign ranks
	return withValues.map((item, index) => ({
		...item,
		rank: index + 1,
	}));
};

/**
 * Get t-value for confidence interval calculation.
 * This is a simplified lookup table for common degrees of freedom.
 *
 * @param df - Degrees of freedom
 * @param probability - Probability (e.g., 0.975 for 95% two-tailed)
 * @returns t-value
 */
const getTValue = (df: number, probability: number): number => {
	// Simplified t-table for 95% CI (probability = 0.975)
	if (probability !== 0.975) {
		return 1.96; // Fall back to z-value for large samples
	}

	const tTable: Record<number, number> = {
		1: 12.706,
		2: 4.303,
		3: 3.182,
		4: 2.776,
		5: 2.571,
		6: 2.447,
		7: 2.365,
		8: 2.306,
		9: 2.262,
		10: 2.228,
		15: 2.131,
		20: 2.086,
		25: 2.06,
		30: 2.042,
		40: 2.021,
		50: 2.009,
		100: 1.984,
	};

	// Find closest df
	const dfs = Object.keys(tTable)
		.map(Number)
		.sort((a, b) => a - b);
	for (const key of dfs) {
		if (df <= key) {
			return tTable[key];
		}
	}

	// Large sample: use z-value
	return 1.96;
};
