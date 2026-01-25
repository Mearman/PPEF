/**
 * Robustness Evaluator
 *
 * Analyzes algorithm robustness under perturbations.
 * Refactored from src/robustness/analyzer.ts into a class-based design
 * that implements the Evaluator interface.
 */

import type {
	RobustnessAnalysisOutput,
	RobustnessAnalysisResult,
	RobustnessMetrics,
} from "../types/perturbation.js";
import type { EvaluationResult } from "../types/result.js";
import type {
	IEvaluator,
	RobustnessEvaluatorConfig,
	RobustnessEvaluatorData,
	Evaluator,
	EvaluationOutput,
	EvaluationSummary,
	ValidationResult,
} from "../types/evaluator.js";

/**
 * Options for robustness analysis (internal to this evaluator).
 */
interface RobustnessAnalysisOptions {
	metrics: string[];
	perturbations: string[];
	intensityLevels?: number[];
	runsPerLevel?: number;
}

/**
 * Robustness evaluator - analyzes variance under perturbations.
 */
export class RobustnessEvaluator
	implements
		Evaluator<RobustnessEvaluatorConfig, EvaluationResult[], RobustnessEvaluatorData>,
		IEvaluator
{
	/** Type identifier */
	readonly type = "robustness" as const;

	/** Schema version */
	private static readonly VERSION = "1.0.0";

	/**
	 * Validate robustness evaluator configuration.
	 *
	 * @param config - Configuration to validate
	 * @returns Validation result
	 */
	validateConfig(config: RobustnessEvaluatorConfig): ValidationResult {
		const errors: string[] = [];
		const warnings: string[] = [];

		// Check metrics array
		if (!Array.isArray(config.metrics)) {
			errors.push("metrics must be an array");
		} else if (config.metrics.length === 0) {
			warnings.push("No metrics provided - evaluation will produce empty results");
		}

		// Check perturbations array
		if (!Array.isArray(config.perturbations)) {
			errors.push("perturbations must be an array");
		} else if (config.perturbations.length === 0) {
			warnings.push("No perturbations provided - evaluation will produce empty results");
		}

		// Validate intensity levels if provided
		if (config.intensityLevels !== undefined) {
			if (!Array.isArray(config.intensityLevels)) {
				errors.push("intensityLevels must be an array");
			} else if (!config.intensityLevels.every((level) => typeof level === "number")) {
				errors.push("intensityLevels must contain only numbers");
			}
		}

		// Validate runsPerLevel if provided
		if (config.runsPerLevel !== undefined && typeof config.runsPerLevel !== "number") {
			errors.push("runsPerLevel must be a number");
		}

		return {
			valid: errors.length === 0,
			errors: errors.length > 0 ? errors : undefined,
			warnings: warnings.length > 0 ? warnings : undefined,
		};
	}

	/**
	 * Evaluate robustness from raw results.
	 *
	 * @param config - Robustness evaluator configuration
	 * @param input - Raw evaluation results
	 * @returns Evaluation output
	 */
	evaluate(
		config: RobustnessEvaluatorConfig,
		input: EvaluationResult[],
	): EvaluationOutput<RobustnessEvaluatorData> {
		// Convert config to options format
		const options: RobustnessAnalysisOptions = {
			metrics: config.metrics,
			perturbations: config.perturbations,
			intensityLevels: config.intensityLevels,
			runsPerLevel: config.runsPerLevel,
		};

		// Create robustness analysis
		const analysis = this.createRobustnessAnalysis(input, options);

		return {
			type: "robustness",
			version: RobustnessEvaluator.VERSION,
			timestamp: new Date().toISOString(),
			data: analysis,
			metadata: {
				config,
			},
		};
	}

	/**
	 * Create a full robustness analysis output.
	 *
	 * @param results - All evaluation results (base and perturbed)
	 * @param options - Analysis options
	 * @returns Complete robustness analysis output
	 */
	private createRobustnessAnalysis(
		results: EvaluationResult[],
		options: RobustnessAnalysisOptions,
	): RobustnessAnalysisOutput {
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
					const perturbedResults = sutResults.filter(
						(r) => r.run.config?.perturbation === perturbation,
					);

					const robustness = this.analyzeRobustnessForMetric(perturbedResults, metric);

					// Get baseline value
					const baseValues = sutResults
						.filter((r) => !r.run.config?.perturbation)
						.map((r) => r.metrics.numeric[metric]);
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
	}

	/**
	 * Analyze robustness of a SUT under perturbation.
	 *
	 * @param perturbedResults - Results with perturbation
	 * @param metric - Metric to analyze
	 * @returns Robustness metrics
	 */
	private analyzeRobustnessForMetric(
		perturbedResults: EvaluationResult[],
		metric: string,
	): RobustnessMetrics {
		const extractValues = (results: EvaluationResult[], metricName: string) =>
			results.map((r) => r.metrics.numeric[metricName]).filter((v) => !Number.isNaN(v));

		const perturbedValues = extractValues(perturbedResults, metric);

		if (perturbedValues.length === 0) {
			return {
				varianceUnderPerturbation: Number.NaN,
				stdUnderPerturbation: Number.NaN,
				coefficientOfVariation: Number.NaN,
			};
		}

		// Compute statistics for perturbed results
		const n = perturbedValues.length;
		const mean = perturbedValues.reduce((a, b) => a + b, 0) / n;
		const variance = perturbedValues.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (n - 1);
		const std = Math.sqrt(variance);

		// Coefficient of variation (relative variance)
		const coefficientOfVariation = mean !== 0 ? std / Math.abs(mean) : Number.NaN;

		return {
			varianceUnderPerturbation: variance,
			stdUnderPerturbation: std,
			coefficientOfVariation,
		};
	}

	/**
	 * Summarize evaluation output.
	 *
	 * @param output - Evaluation output to summarize
	 * @returns Summary statistics
	 */
	summarize(output: EvaluationOutput<RobustnessEvaluatorData>): EvaluationSummary {
		const { results } = output.data;

		return {
			total: results.length,
			additional: {
				sutsAnalyzed: new Set(results.map((r) => r.sut)).size,
				metricsAnalyzed: output.data.config.metrics.length,
				perturbationsTested: output.data.config.perturbations.length,
			},
		};
	}
}
