/**
 * Unit tests for Robustness Analyzer
 *
 * Tests robustness analysis functions including:
 * - analyzeRobustnessForMetric
 * - analyzeRobustnessWithCurve
 * - compareRobustness
 * - createRobustnessAnalysis
 */

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import type { EvaluationResult } from "../../types/result.js";
import {
	analyzeRobustnessForMetric,
	analyzeRobustnessWithCurve,
	compareRobustness,
	createRobustnessAnalysis,
	type RobustnessAnalysisOptions,
} from "../analyzer.js";

/**
 * Create a mock evaluation result.
 */
function createMockResult(
	metricValue: number,
	perturbationIntensity?: number,
	perturbation?: string,
): EvaluationResult {
	const config: Record<string, string | number> = {};
	if (perturbation !== undefined) config.perturbation = perturbation;
	if (perturbationIntensity !== undefined) config.perturbationIntensity = perturbationIntensity;

	return {
		run: {
			runId: `run-${Math.random()}`,
			sut: "test-sut",
			sutRole: "primary",
			caseId: "test-case",
			repetition: 0,
			config: Object.keys(config).length > 0 ? config : undefined,
		},
		metrics: {
			numeric: {
				accuracy: metricValue,
				precision: metricValue * 0.9,
				recall: metricValue * 0.95,
			},
		},
		correctness: {
			expectedExists: true,
			producedOutput: true,
			valid: true,
			matchesExpected: true,
		},
		outputs: {},
		provenance: {
			runtime: {
				platform: "test",
				arch: "test",
				nodeVersion: "test",
			},
		},
	};
}

/**
 * Create mock base results.
 */
function createBaseResults(): EvaluationResult[] {
	return [createMockResult(0.85), createMockResult(0.87), createMockResult(0.86)];
}

/**
 * Create mock perturbed results.
 */
function createPerturbedResults(values: number[]): EvaluationResult[] {
	return values.map((v) => createMockResult(v, 1, "noise"));
}

describe("analyzeRobustnessForMetric", () => {
	describe("with valid base and perturbed results", () => {
		it("should compute variance under perturbation", () => {
			const baseResults = createBaseResults();
			const perturbedResults = createPerturbedResults([0.82, 0.84, 0.86, 0.88, 0.9]);

			const result = analyzeRobustnessForMetric(baseResults, perturbedResults, "accuracy");

			// Variance should be a finite number
			assert.ok(Number.isFinite(result.varianceUnderPerturbation));
			assert.ok(result.varianceUnderPerturbation >= 0);
		});

		it("should compute standard deviation under perturbation", () => {
			const baseResults = createBaseResults();
			const perturbedResults = createPerturbedResults([0.8, 0.85, 0.9]);

			const result = analyzeRobustnessForMetric(baseResults, perturbedResults, "accuracy");

			// Std should be finite and non-negative
			assert.ok(Number.isFinite(result.stdUnderPerturbation));
			assert.ok(result.stdUnderPerturbation >= 0);
		});

		it("should compute coefficient of variation for non-zero mean", () => {
			const baseResults = createBaseResults();
			const perturbedResults = createPerturbedResults([0.82, 0.84, 0.86, 0.88, 0.9]);

			const result = analyzeRobustnessForMetric(baseResults, perturbedResults, "accuracy");

			// Coefficient of variation should be finite
			assert.ok(Number.isFinite(result.coefficientOfVariation));
			assert.ok(result.coefficientOfVariation >= 0);
		});

		it("should handle stable results with low variance", () => {
			const baseResults = createBaseResults();
			const perturbedResults = createPerturbedResults([0.85, 0.85, 0.85, 0.85, 0.85]);

			const result = analyzeRobustnessForMetric(baseResults, perturbedResults, "accuracy");

			// Very stable results should have near-zero variance
			assert.ok(result.varianceUnderPerturbation < 0.01);
			assert.ok(result.stdUnderPerturbation < 0.1);
		});

		it("should handle high variance results", () => {
			const baseResults = createBaseResults();
			const perturbedResults = createPerturbedResults([0.5, 0.6, 0.7, 0.8, 0.9]);

			const result = analyzeRobustnessForMetric(baseResults, perturbedResults, "accuracy");

			// High variance should be detected
			assert.ok(result.varianceUnderPerturbation > 0.01);
			assert.ok(result.stdUnderPerturbation > 0.1);
		});

		it("should filter out NaN values from results", () => {
			const baseResults = [createMockResult(0.85), createMockResult(NaN), createMockResult(0.87)];
			const perturbedResults = [
				createMockResult(0.82),
				createMockResult(NaN),
				createMockResult(0.84),
			];

			const result = analyzeRobustnessForMetric(baseResults, perturbedResults, "accuracy");

			// Should compute stats from non-NaN values only
			assert.ok(Number.isFinite(result.varianceUnderPerturbation));
			assert.ok(Number.isFinite(result.stdUnderPerturbation));
		});
	});

	describe("with empty results", () => {
		it("should return NaN for all metrics when base results are empty", () => {
			const baseResults: EvaluationResult[] = [];
			const perturbedResults = createPerturbedResults([0.82, 0.84, 0.86]);

			const result = analyzeRobustnessForMetric(baseResults, perturbedResults, "accuracy");

			assert.ok(Number.isNaN(result.varianceUnderPerturbation));
			assert.ok(Number.isNaN(result.stdUnderPerturbation));
			assert.ok(Number.isNaN(result.coefficientOfVariation));
		});

		it("should return NaN for all metrics when perturbed results are empty", () => {
			const baseResults = createBaseResults();
			const perturbedResults: EvaluationResult[] = [];

			const result = analyzeRobustnessForMetric(baseResults, perturbedResults, "accuracy");

			assert.ok(Number.isNaN(result.varianceUnderPerturbation));
			assert.ok(Number.isNaN(result.stdUnderPerturbation));
			assert.ok(Number.isNaN(result.coefficientOfVariation));
		});

		it("should return NaN when both are empty", () => {
			const baseResults: EvaluationResult[] = [];
			const perturbedResults: EvaluationResult[] = [];

			const result = analyzeRobustnessForMetric(baseResults, perturbedResults, "accuracy");

			assert.ok(Number.isNaN(result.varianceUnderPerturbation));
			assert.ok(Number.isNaN(result.stdUnderPerturbation));
			assert.ok(Number.isNaN(result.coefficientOfVariation));
		});

		it("should return NaN when all values are NaN", () => {
			const baseResults = [createMockResult(NaN), createMockResult(NaN)];
			const perturbedResults = [createMockResult(NaN), createMockResult(NaN)];

			const result = analyzeRobustnessForMetric(baseResults, perturbedResults, "accuracy");

			assert.ok(Number.isNaN(result.varianceUnderPerturbation));
			assert.ok(Number.isNaN(result.stdUnderPerturbation));
			assert.ok(Number.isNaN(result.coefficientOfVariation));
		});
	});

	describe("edge cases", () => {
		it("should return NaN for coefficient of variation when mean is zero", () => {
			const baseResults = createBaseResults();
			const perturbedResults = [createMockResult(0), createMockResult(0), createMockResult(0)];

			const result = analyzeRobustnessForMetric(baseResults, perturbedResults, "accuracy");

			// Std should be 0 (no variance)
			assert.strictEqual(result.stdUnderPerturbation, 0);
			// Coefficient of variation should be NaN (mean is zero)
			assert.ok(Number.isNaN(result.coefficientOfVariation));
		});

		it("should return NaN for std and coefficient of variation with single perturbed result", () => {
			const baseResults = createBaseResults();
			const perturbedResults = createPerturbedResults([0.85]);

			const result = analyzeRobustnessForMetric(baseResults, perturbedResults, "accuracy");

			// Single value: std is undefined (needs n > 1), so variance and cv are NaN
			assert.ok(Number.isNaN(result.varianceUnderPerturbation));
			assert.ok(Number.isNaN(result.stdUnderPerturbation));
			assert.ok(Number.isNaN(result.coefficientOfVariation));
		});
	});
});

describe("analyzeRobustnessWithCurve", () => {
	it("should group results by perturbation intensity", () => {
		const results = [
			createMockResult(0.85), // Base
			createMockResult(0.86), // Base
			createMockResult(0.82, 1), // Level 1
			createMockResult(0.83, 1), // Level 1
			createMockResult(0.78, 2), // Level 2
			createMockResult(0.79, 2), // Level 2
		];

		const result = analyzeRobustnessWithCurve(results, "accuracy", [1, 2]);

		// Should have degradation curve points
		assert.ok(result.degradationCurve!.length >= 2);
	});

	it("should include level 0 (base) in degradation curve", () => {
		const results = [
			createMockResult(0.85), // Base
			createMockResult(0.82, 1), // Level 1
		];

		const result = analyzeRobustnessWithCurve(results, "accuracy", [1]);

		// Should have base level
		const baseLevel = result.degradationCurve!.find((d) => d.perturbationLevel === 0);
		assert.ok(baseLevel);
		assert.strictEqual(baseLevel.metricValue, 0.85);
	});

	it("should sort degradation curve by perturbation level", () => {
		const results = [
			createMockResult(0.78, 2),
			createMockResult(0.85), // Base
			createMockResult(0.82, 1),
		];

		const result = analyzeRobustnessWithCurve(results, "accuracy", [1, 2]);

		// Check sorted order
		for (let i = 1; i < result.degradationCurve!.length; i++) {
			assert.ok(
				result.degradationCurve![i].perturbationLevel >=
					result.degradationCurve![i - 1].perturbationLevel,
			);
		}
	});

	it("should include stdDev in degradation curve", () => {
		const results = [createMockResult(0.85), createMockResult(0.82, 1), createMockResult(0.84, 1)];

		const result = analyzeRobustnessWithCurve(results, "accuracy", [1]);

		const level1 = result.degradationCurve!.find((d) => d.perturbationLevel === 1);
		assert.ok(level1);
		assert.ok(level1.stdDev !== undefined);
	});

	it("should detect breakpoint when degradation exceeds 10%", () => {
		const results = [
			createMockResult(0.9), // Base
			createMockResult(0.89, 1), // 1.1% change - no breakpoint
			createMockResult(0.8, 2), // 11% change - breakpoint!
		];

		const result = analyzeRobustnessWithCurve(results, "accuracy", [1, 2]);

		// Should detect breakpoint at level 2
		assert.strictEqual(result.breakpoint, 2);
	});

	it("should not detect breakpoint when degradation is under 10%", () => {
		const results = [
			createMockResult(0.9), // Base
			createMockResult(0.89, 1), // 1.1% change
			createMockResult(0.88, 2), // 2.2% change
		];

		const result = analyzeRobustnessWithCurve(results, "accuracy", [1, 2]);

		// No breakpoint
		assert.strictEqual(result.breakpoint, undefined);
	});

	it("should compute overall variance from all perturbed results", () => {
		const results = [
			createMockResult(0.85),
			createMockResult(0.82, 1),
			createMockResult(0.84, 1),
			createMockResult(0.78, 2),
			createMockResult(0.8, 2),
		];

		const result = analyzeRobustnessWithCurve(results, "accuracy", [1, 2]);

		// Should have finite overall variance
		assert.ok(Number.isFinite(result.varianceUnderPerturbation));
		assert.ok(result.varianceUnderPerturbation > 0);
	});

	it("should handle missing intensity levels gracefully", () => {
		const results = [
			createMockResult(0.85),
			createMockResult(0.82, 1), // Only level 1 present
		];

		const result = analyzeRobustnessWithCurve(results, "accuracy", [1, 2, 3]);

		// Should only have levels with data
		assert.ok(result.degradationCurve!.length >= 1);
		assert.ok(result.degradationCurve!.length <= 2); // Base + level 1
	});

	it("should filter NaN values from curve computation", () => {
		const results = [createMockResult(0.85), createMockResult(NaN, 1), createMockResult(0.82, 1)];

		const result = analyzeRobustnessWithCurve(results, "accuracy", [1]);

		const level1 = result.degradationCurve!.find((d) => d.perturbationLevel === 1);
		assert.ok(level1);
		// Should compute from non-NaN values
		assert.strictEqual(level1.metricValue, 0.82);
	});
});

describe("compareRobustness", () => {
	it("should compute variance for both SUTs", () => {
		const sutAResults = [
			createMockResult(0.85),
			createMockResult(0.82, 1),
			createMockResult(0.83, 1),
		];
		const sutBResults = [
			createMockResult(0.8),
			createMockResult(0.78, 1),
			createMockResult(0.82, 1),
		];

		const result = compareRobustness(sutAResults, sutBResults, "accuracy");

		assert.ok(Number.isFinite(result.sutAVariance));
		assert.ok(Number.isFinite(result.sutBVariance));
	});

	it("should compute relative robustness correctly", () => {
		const sutAResults = [
			createMockResult(0.85),
			createMockResult(0.82, 1), // Low variance
			createMockResult(0.83, 1),
		];
		const sutBResults = [
			createMockResult(0.8),
			createMockResult(0.7, 1), // High variance
			createMockResult(0.9, 1),
		];

		const result = compareRobustness(sutAResults, sutBResults, "accuracy");

		// Lower relative robustness means A is more robust
		assert.ok(result.relativeRobustness < 1);
	});

	it("should return Infinity when SUT B has zero variance", () => {
		const sutAResults = [
			createMockResult(0.85),
			createMockResult(0.82, 1),
			createMockResult(0.83, 1),
		];
		const sutBResults = [
			createMockResult(0.85),
			createMockResult(0.85, 1),
			createMockResult(0.85, 1), // Perfect stability
		];

		const result = compareRobustness(sutAResults, sutBResults, "accuracy");

		assert.strictEqual(result.relativeRobustness, Infinity);
	});

	it("should handle equal variance", () => {
		const sutAResults = [
			createMockResult(0.85),
			createMockResult(0.82, 1),
			createMockResult(0.83, 1),
		];
		const sutBResults = [
			createMockResult(0.8),
			createMockResult(0.77, 1),
			createMockResult(0.78, 1),
		];

		const result = compareRobustness(sutAResults, sutBResults, "accuracy");

		// Same variance pattern
		assert.strictEqual(result.relativeRobustness, 1);
	});

	it("should filter results by perturbation intensity", () => {
		const sutAResults = [
			createMockResult(0.85), // Base
			createMockResult(0.82, 1), // Perturbed
			createMockResult(0.83, 1), // Perturbed
		];

		const result = compareRobustness(sutAResults, sutAResults, "accuracy");

		// Should only use perturbed results
		assert.ok(Number.isFinite(result.sutAVariance));
	});
});

describe("createRobustnessAnalysis", () => {
	it("should create analysis output with correct structure", () => {
		const results = [
			createMockResult(0.85, undefined, undefined),
			createMockResult(0.82, 1, "noise"),
			createMockResult(0.83, 1, "noise"),
		];

		const options: RobustnessAnalysisOptions = {
			metrics: ["accuracy"],
			perturbations: ["noise"],
			intensityLevels: [1],
			runsPerLevel: 2,
		};

		const output = createRobustnessAnalysis(results, options);

		assert.strictEqual(output.version, "1.0.0");
		assert.ok(output.timestamp);
		assert.ok(Array.isArray(output.results));
		assert.ok(output.config);
	});

	it("should include config in output", () => {
		const results = [createMockResult(0.85), createMockResult(0.82, 1, "noise")];

		const options: RobustnessAnalysisOptions = {
			metrics: ["accuracy", "precision"],
			perturbations: ["noise", "blur"],
			intensityLevels: [1, 2],
			runsPerLevel: 3,
		};

		const output = createRobustnessAnalysis(results, options);

		assert.deepStrictEqual(output.config.perturbations, ["noise", "blur"]);
		assert.deepStrictEqual(output.config.metrics, ["accuracy", "precision"]);
		assert.deepStrictEqual(output.config.intensityLevels, [1, 2]);
		assert.strictEqual(output.config.runsPerLevel, 3);
	});

	it("should analyze each metric-perturbation combination", () => {
		const results = [
			createMockResult(0.85),
			createMockResult(0.82, 1, "noise"),
			createMockResult(0.8, 1, "blur"),
		];

		const options: RobustnessAnalysisOptions = {
			metrics: ["accuracy", "precision"],
			perturbations: ["noise", "blur"],
		};

		const output = createRobustnessAnalysis(results, options);

		// Should have 4 results: 2 metrics x 2 perturbations
		assert.strictEqual(output.results.length, 4);
	});

	it("should compute baseline value from base results", () => {
		const results = [
			createMockResult(0.85),
			createMockResult(0.87),
			createMockResult(0.82, 1, "noise"),
		];

		const options: RobustnessAnalysisOptions = {
			metrics: ["accuracy"],
			perturbations: ["noise"],
		};

		const output = createRobustnessAnalysis(results, options);

		// Baseline should be average of base results
		const baseline = output.results[0].baselineValue;
		assert.ok(Number.isFinite(baseline));
		assert.ok(baseline > 0);
	});

	it("should include run count in results", () => {
		const results = [
			createMockResult(0.85),
			createMockResult(0.82, 1, "noise"),
			createMockResult(0.83, 1, "noise"),
			createMockResult(0.84, 1, "noise"),
		];

		const options: RobustnessAnalysisOptions = {
			metrics: ["accuracy"],
			perturbations: ["noise"],
		};

		const output = createRobustnessAnalysis(results, options);

		assert.strictEqual(output.results[0].runCount, 3);
	});

	it("should group results by SUT", () => {
		const results = [
			createMockResult(0.85, undefined, undefined),
			createMockResult(0.82, 1, "noise"),
		];
		// Modify SUT name
		results[0].run.sut = "sut-a";
		results[1].run.sut = "sut-a";

		const options: RobustnessAnalysisOptions = {
			metrics: ["accuracy"],
			perturbations: ["noise"],
		};

		const output = createRobustnessAnalysis(results, options);

		assert.strictEqual(output.results[0].sut, "sut-a");
	});

	it("should handle empty results gracefully", () => {
		const results: EvaluationResult[] = [];

		const options: RobustnessAnalysisOptions = {
			metrics: ["accuracy"],
			perturbations: ["noise"],
		};

		const output = createRobustnessAnalysis(results, options);

		assert.strictEqual(output.results.length, 0);
	});

	it("should default runsPerLevel to 1 when not specified", () => {
		const results = [createMockResult(0.85), createMockResult(0.82, 1, "noise")];

		const options: RobustnessAnalysisOptions = {
			metrics: ["accuracy"],
			perturbations: ["noise"],
		};

		const output = createRobustnessAnalysis(results, options);

		assert.strictEqual(output.config.runsPerLevel, 1);
	});
});
