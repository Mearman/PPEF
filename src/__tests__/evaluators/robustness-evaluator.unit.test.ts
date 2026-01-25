/**
 * Unit tests for Robustness Evaluator
 *
 * Tests the robustness evaluator functionality including variance analysis
 * under perturbations.
 */

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import { RobustnessEvaluator } from "../../evaluators/robustness-evaluator.js";
import { createMockResult } from "../test-helpers.js";
import type { RobustnessEvaluatorConfig } from "../../types/evaluator.js";

/**
 * Test helpers
 */

function createMockResults(
	sut: string,
	metric: string,
	values: number[],
): ReturnType<typeof createMockResult>[] {
	return values.map((value) =>
		createMockResult({
			run: {
				runId: `run-${values.indexOf(value)}`,
				sut,
				sutRole: "primary",
				caseId: `case-${values.indexOf(value)}`,
				caseClass: undefined,
			},
			metrics: {
				numeric: { [metric]: value },
			},
		}),
	);
}

function createBaseConfig(
	overrides?: Partial<RobustnessEvaluatorConfig>,
): RobustnessEvaluatorConfig {
	return {
		metrics: ["accuracy"],
		perturbations: ["noise"],
		...overrides,
	};
}

describe("RobustnessEvaluator", () => {
	describe("validateConfig", () => {
		const evaluator = new RobustnessEvaluator();

		it("should validate config with required fields", () => {
			const config = createBaseConfig();
			const result = evaluator.validateConfig(config);

			assert.equal(result.valid, true);
		});

		it("should invalidate when metrics is not an array", () => {
			const config = {
				metrics: "not-an-array",
				perturbations: [],
			} as unknown as RobustnessEvaluatorConfig;
			const result = evaluator.validateConfig(config);

			assert.equal(result.valid, false);
			assert.ok(result.errors?.some((e) => e.includes("metrics")));
		});

		it("should invalidate when perturbations is not an array", () => {
			const config = {
				metrics: [],
				perturbations: "not-an-array",
			} as unknown as RobustnessEvaluatorConfig;
			const result = evaluator.validateConfig(config);

			assert.equal(result.valid, false);
			assert.ok(result.errors?.some((e) => e.includes("perturbations")));
		});

		it("should invalidate when metrics is empty", () => {
			const config = createBaseConfig({ metrics: [] });
			const result = evaluator.validateConfig(config);

			assert.equal(result.valid, false);
			assert.ok(result.errors?.some((e) => e.includes("metrics")));
		});

		it("should invalidate when perturbations is empty", () => {
			const config = createBaseConfig({ perturbations: [] });
			const result = evaluator.validateConfig(config);

			assert.equal(result.valid, false);
			assert.ok(result.errors?.some((e) => e.includes("perturbations")));
		});

		it("should validate config with intensity levels", () => {
			const config = createBaseConfig({
				intensityLevels: [0.1, 0.5, 1.0],
			});
			const result = evaluator.validateConfig(config);

			assert.equal(result.valid, true);
		});

		it("should validate config with runs per level", () => {
			const config = createBaseConfig({
				runsPerLevel: 10,
			});
			const result = evaluator.validateConfig(config);

			assert.equal(result.valid, true);
		});
	});

	describe("evaluate", () => {
		const evaluator = new RobustnessEvaluator();

		it("should evaluate variance across perturbations", () => {
			const config = createBaseConfig({
				metrics: ["accuracy"],
				perturbations: ["noise"],
			});

			// Create results for baseline and perturbed runs
			const results = [
				createMockResult({
					run: {
						runId: "run-0",
						sut: "test-sut",
						sutRole: "primary",
						caseId: "case-1",
						caseClass: undefined,
					},
					metrics: { numeric: { accuracy: 0.9 } },
				}),
				createMockResult({
					run: {
						runId: "run-1",
						sut: "test-sut",
						sutRole: "primary",
						caseId: "case-1-noise-0.1",
						caseClass: undefined,
					},
					metrics: { numeric: { accuracy: 0.85 } },
				}),
				createMockResult({
					run: {
						runId: "run-2",
						sut: "test-sut",
						sutRole: "primary",
						caseId: "case-1-noise-0.2",
						caseClass: undefined,
					},
					metrics: { numeric: { accuracy: 0.88 } },
				}),
			];

			const output = evaluator.evaluate(config, results);

			assert.equal(output.type, "robustness");
			assert.equal(output.data.version, "1.0.0");
			assert.ok(output.data.results.length > 0);
		});

		it("should handle multiple SUTs", () => {
			const config = createBaseConfig({
				metrics: ["accuracy"],
				perturbations: ["noise"],
			});

			const results = [
				...createMockResults("sut-1", "accuracy", [0.9, 0.85, 0.88]),
				...createMockResults("sut-2", "accuracy", [0.8, 0.78, 0.82]),
			];

			const output = evaluator.evaluate(config, results);

			assert.equal(output.type, "robustness");
			assert.ok(output.data.results.length >= 2);
		});

		it("should handle multiple metrics", () => {
			const config = createBaseConfig({
				metrics: ["accuracy", "precision"],
				perturbations: ["noise"],
			});

			const results = [
				...createMockResults("test-sut", "accuracy", [0.9, 0.85, 0.88]),
				...createMockResults("test-sut", "precision", [0.85, 0.8, 0.83]),
			];

			const output = evaluator.evaluate(config, results);

			assert.equal(output.type, "robustness");
			assert.ok(output.data.results.length > 0);
		});

		it("should compute statistics for each perturbation", () => {
			const config = createBaseConfig({
				metrics: ["accuracy"],
				perturbations: ["noise", "blur"],
			});

			const results = [
				// Baseline
				...createMockResults("test-sut", "accuracy", [0.9]),
				// Noise perturbation
				...createMockResults("test-sut", "accuracy", [0.85, 0.87, 0.86]),
				// Blur perturbation
				...createMockResults("test-sut", "accuracy", [0.82, 0.83, 0.84]),
			];

			const output = evaluator.evaluate(config, results);

			assert.equal(output.type, "robustness");
			const result = output.data.results[0];
			assert.ok(result);
			assert.ok(result.perturbation.length >= 2);
		});

		it("should use intensity levels when provided", () => {
			const config = createBaseConfig({
				intensityLevels: [0.1, 0.5, 1.0],
			});

			const results = [
				...createMockResults("test-sut", "accuracy", [0.9]),
				...createMockResults("test-sut", "accuracy", [0.88, 0.85, 0.82]),
			];

			const output = evaluator.evaluate(config, results);

			assert.equal(output.type, "robustness");
			assert.ok(output.data.config.intensityLevels);
			assert.deepEqual(output.data.config.intensityLevels, [0.1, 0.5, 1.0]);
		});

		it("should compute variance and coefficient of variation", () => {
			const config = createBaseConfig();

			// Create results with perturbation marked in config
			const results = [
				// Baseline (no perturbation)
				createMockResult({
					run: {
						runId: "run-0",
						sut: "test-sut",
						sutRole: "primary",
						caseId: "case-1",
						caseClass: undefined,
					},
					metrics: { numeric: { accuracy: 0.9 } },
				}),
				// Perturbed results
				...createMockResults("test-sut", "accuracy", [0.85, 0.88, 0.87, 0.86]).map((r) => ({
					...r,
					run: { ...r.run, config: { perturbation: "noise" } },
				})),
			];

			const output = evaluator.evaluate(config, results);
			const result = output.data.results[0];

			assert.ok(result);
			assert.equal(result.perturbation, "noise");
			assert.equal(result.metric, "accuracy");
			assert.equal(result.sut, "test-sut");

			// Check robustness metrics
			const { robustness } = result;
			assert.ok(typeof robustness.varianceUnderPerturbation === "number");
			assert.ok(typeof robustness.stdUnderPerturbation === "number");
			assert.ok(typeof robustness.coefficientOfVariation === "number");

			// Values should be valid (not NaN) since we have perturbed results
			assert.ok(!Number.isNaN(robustness.varianceUnderPerturbation));
			assert.ok(!Number.isNaN(robustness.stdUnderPerturbation));
			assert.ok(!Number.isNaN(robustness.coefficientOfVariation));
		});
	});

	describe("summarize", () => {
		const evaluator = new RobustnessEvaluator();

		it("should create summary from output", () => {
			const config = createBaseConfig();

			const results = createMockResults("test-sut", "accuracy", [0.9, 0.85, 0.88]).map((r) => ({
				...r,
				run: { ...r.run, config: { perturbation: "noise" } },
			}));

			const output = evaluator.evaluate(config, results);
			const summary = evaluator.summarize(output);

			assert.equal(summary.total, 1); // 1 combination of SUT and metric
		});

		it("should count multiple SUT-metric combinations", () => {
			const config = createBaseConfig({
				metrics: ["accuracy", "precision"],
			});

			const results = [
				...createMockResults("sut-1", "accuracy", [0.9, 0.85]),
				...createMockResults("sut-1", "precision", [0.85, 0.8]),
				...createMockResults("sut-2", "accuracy", [0.8, 0.78]),
			].map((r) => ({
				...r,
				run: { ...r.run, config: { perturbation: "noise" } },
			}));

			const output = evaluator.evaluate(config, results);
			const summary = evaluator.summarize(output);

			// Evaluator creates results for all combinations: 2 SUTs × 2 metrics = 4
			assert.equal(summary.total, 4);
		});
	});
});
