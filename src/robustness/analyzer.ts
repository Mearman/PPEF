/**
 * Robustness Analyzer
 *
 * Analyzes algorithm robustness under perturbations.
 * Computes variance, stability, and degradation metrics.
 */

import { computeSummaryStats } from "../aggregation/aggregators.js";
import type {
	RobustnessAnalysisOutput,
	RobustnessAnalysisResult,
	RobustnessMetrics,
} from "../types/perturbation.js";
import type { EvaluationResult } from "../types/result.js";

/**
 * Options for robustness analysis.
 */
export interface RobustnessAnalysisOptions {
	/** Metrics to analyze */
	metrics: string[];

	/** Perturbations applied */
	perturbations: string[];

	/** Intensity levels tested (if applicable) */
	intensityLevels?: number[];

	/** Number of runs per perturbation level */
	runsPerLevel?: number;
}

/**
 * Analyze robustness of a SUT under perturbation.
 *
 * @param baseResults - Results without perturbation
 * @param perturbedResults - Results with perturbation, keyed by perturbation name
 * @param metric - Metric to analyze
 * @returns Robustness metrics
 */
export const analyzeRobustnessForMetric = (
	baseResults: EvaluationResult[],
	perturbedResults: EvaluationResult[],
	metric: string,
): RobustnessMetrics => {
	// Extract metric values
	const baseValues = baseResults
		.map((r) => r.metrics.numeric[metric])
		.filter((v) => !Number.isNaN(v));

	const perturbedValues = perturbedResults
		.map((r) => r.metrics.numeric[metric])
		.filter((v) => !Number.isNaN(v));

	if (baseValues.length === 0 || perturbedValues.length === 0) {
		return {
			varianceUnderPerturbation: Number.NaN,
			stdUnderPerturbation: Number.NaN,
			coefficientOfVariation: Number.NaN,
		};
	}

	// Compute statistics for perturbed results
	// Note: baseStats could be used for relative comparison in future
	const perturbedStats = computeSummaryStats(perturbedValues);

	// Variance under perturbation
	const varianceUnderPerturbation =
		perturbedStats.std === undefined ? Number.NaN : perturbedStats.std ** 2;

	// Standard deviation
	const stdUnderPerturbation = perturbedStats.std ?? Number.NaN;

	// Coefficient of variation (relative variance)
	const coefficientOfVariation =
		perturbedStats.mean !== 0 && perturbedStats.std !== undefined
			? perturbedStats.std / Math.abs(perturbedStats.mean)
			: Number.NaN;

	return {
		varianceUnderPerturbation,
		stdUnderPerturbation,
		coefficientOfVariation,
	};
};

/**
 * Analyze robustness across multiple perturbation levels.
 *
 * @param results - All results including perturbed ones
 * @param metric - Metric to analyze
 * @param intensityLevels - Perturbation intensity levels
 * @returns Robustness metrics with degradation curve
 */
export const analyzeRobustnessWithCurve = (
	results: EvaluationResult[],
	metric: string,
	intensityLevels: number[],
): RobustnessMetrics => {
	// Group results by perturbation intensity
	const byIntensity = new Map<number, EvaluationResult[]>();

	// Base results (no perturbation)
	const baseResults = results.filter((r) => r.run.config?.perturbationIntensity === undefined);
	byIntensity.set(0, baseResults);

	// Perturbed results
	for (const level of intensityLevels) {
		const levelResults = results.filter((r) => r.run.config?.perturbationIntensity === level);
		if (levelResults.length > 0) {
			byIntensity.set(level, levelResults);
		}
	}

	// Build degradation curve
	const degradationCurve: {
		perturbationLevel: number;
		metricValue: number;
		stdDev?: number;
	}[] = [];

	for (const [level, levelResults] of byIntensity) {
		const values = levelResults
			.map((r) => r.metrics.numeric[metric])
			.filter((v) => !Number.isNaN(v));

		if (values.length > 0) {
			const stats = computeSummaryStats(values);
			degradationCurve.push({
				perturbationLevel: level,
				metricValue: stats.mean,
				stdDev: stats.std,
			});
		}
	}

	// Sort by level
	degradationCurve.sort((a, b) => a.perturbationLevel - b.perturbationLevel);

	// Find breakpoint (significant degradation)
	let breakpoint: number | undefined;
	if (degradationCurve.length >= 2) {
		const baseValue = degradationCurve[0].metricValue;
		for (let index = 1; index < degradationCurve.length; index++) {
			const relativeChange = Math.abs(
				(degradationCurve[index].metricValue - baseValue) / baseValue,
			);
			if (relativeChange > 0.1) {
				// 10% degradation threshold
				breakpoint = degradationCurve[index].perturbationLevel;
				break;
			}
		}
	}

	// Compute overall variance from all perturbed results
	const allPerturbedValues = results
		.filter((r) => r.run.config?.perturbationIntensity !== undefined)
		.map((r) => r.metrics.numeric[metric])
		.filter((v) => !Number.isNaN(v));

	const overallStats = computeSummaryStats(allPerturbedValues);

	return {
		varianceUnderPerturbation: overallStats.std === undefined ? Number.NaN : overallStats.std ** 2,
		stdUnderPerturbation: overallStats.std ?? Number.NaN,
		coefficientOfVariation:
			overallStats.mean !== 0 && overallStats.std !== undefined
				? overallStats.std / Math.abs(overallStats.mean)
				: Number.NaN,
		degradationCurve,
		breakpoint,
	};
};

/**
 * Compare robustness between two SUTs.
 *
 * @param sutAResults - Results for SUT A (including perturbed)
 * @param sutBResults - Results for SUT B (including perturbed)
 * @param metric - Metric to compare
 * @returns Object with comparison metrics
 */
export const compareRobustness = (
	sutAResults: EvaluationResult[],
	sutBResults: EvaluationResult[],
	metric: string,
): {
	sutAVariance: number;
	sutBVariance: number;
	relativeRobustness: number; // A's variance / B's variance (< 1 means A is more robust)
} => {
	const sutAPerturbed = sutAResults.filter(
		(r) => r.run.config?.perturbationIntensity !== undefined,
	);
	const sutBPerturbed = sutBResults.filter(
		(r) => r.run.config?.perturbationIntensity !== undefined,
	);

	const sutABase = sutAResults.filter((r) => r.run.config?.perturbationIntensity === undefined);
	const sutBBase = sutBResults.filter((r) => r.run.config?.perturbationIntensity === undefined);

	const sutARobustness = analyzeRobustnessForMetric(sutABase, sutAPerturbed, metric);
	const sutBRobustness = analyzeRobustnessForMetric(sutBBase, sutBPerturbed, metric);

	const relativeRobustness =
		sutBRobustness.varianceUnderPerturbation === 0
			? Infinity
			: sutARobustness.varianceUnderPerturbation / sutBRobustness.varianceUnderPerturbation;

	return {
		sutAVariance: sutARobustness.varianceUnderPerturbation,
		sutBVariance: sutBRobustness.varianceUnderPerturbation,
		relativeRobustness,
	};
};

/**
 * Create a full robustness analysis output.
 *
 * @param results - All evaluation results (base and perturbed)
 * @param options - Analysis options
 * @returns Complete robustness analysis output
 */
export const createRobustnessAnalysis = (
	results: EvaluationResult[],
	options: RobustnessAnalysisOptions,
): RobustnessAnalysisOutput => {
	const analysisResults: RobustnessAnalysisResult[] = [];

	// Group results by SUT
	const bySut = new Map<string, EvaluationResult[]>();
	for (const result of results) {
		const existing = bySut.get(result.run.sut) ?? [];
		existing.push(result);
		bySut.set(result.run.sut, existing);
	}

	// Analyze each SUT for each metric and perturbation
	for (const [sut, sutResults] of bySut) {
		for (const metric of options.metrics) {
			for (const perturbation of options.perturbations) {
				// Filter to this perturbation
				const baseResults = sutResults.filter((r) => !r.run.config?.perturbation);
				const perturbedResults = sutResults.filter(
					(r) => r.run.config?.perturbation === perturbation,
				);

				const robustness = analyzeRobustnessForMetric(baseResults, perturbedResults, metric);

				// Get baseline value
				const baseValues = baseResults.map((r) => r.metrics.numeric[metric]);
				const baselineValue =
					baseValues.length > 0
						? baseValues.reduce((a, b) => a + b, 0) / baseValues.length
						: Number.NaN;

				analysisResults.push({
					sut,
					perturbation,
					metric,
					robustness,
					baselineValue,
					runCount: perturbedResults.length,
				});
			}
		}
	}

	return {
		version: "1.0.0",
		timestamp: new Date().toISOString(),
		results: analysisResults,
		config: {
			perturbations: options.perturbations,
			metrics: options.metrics,
			intensityLevels: options.intensityLevels,
			runsPerLevel: options.runsPerLevel ?? 1,
		},
	};
};
