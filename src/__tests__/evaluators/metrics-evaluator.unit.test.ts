/**
 * Unit tests for Metrics Evaluator
 *
 * Tests the metrics evaluator functionality including threshold,
 * baseline, and target-range criteria.
 */

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import { MetricsEvaluator } from "../../evaluators/metrics-evaluator.js";
import { createMockAggregate, createMockSummaryStats } from "../test-helpers.js";
import type { MetricsCriterion, MetricsEvaluatorConfig } from "../../types/evaluator.js";
import type { EvaluationContext } from "../../types/evaluator.js";

/**
 * Test helpers
 */

function createTestCriterion(overrides?: Partial<MetricsCriterion>): MetricsCriterion {
	return {
		criterionId: "C001",
		description: "Test criterion",
		type: "threshold",
		metric: "accuracy",
		sut: "primary-sut",
		threshold: { operator: "gte", value: 0.8 },
		...overrides,
	};
}

function createTestContext(
	aggregates: ReturnType<typeof createMockAggregate>[],
): EvaluationContext {
	return {
		aggregates,
		metadata: { source: "test" },
	};
}

describe("MetricsEvaluator", () => {
	describe("validateConfig", () => {
		const evaluator = new MetricsEvaluator();

		it("should validate empty criteria array with warning", () => {
			const config: MetricsEvaluatorConfig = { criteria: [] };
			const result = evaluator.validateConfig(config);

			assert.equal(result.valid, true);
			assert.ok(result.warnings?.some((w) => w.includes("No criteria")));
		});

		it("should invalidate when criteria is not an array", () => {
			const config = { criteria: "not-an-array" } as unknown as MetricsEvaluatorConfig;
			const result = evaluator.validateConfig(config);

			assert.equal(result.valid, false);
			assert.ok(result.errors?.includes("criteria must be an array"));
		});

		it("should invalidate when criteria is missing", () => {
			const config = {} as unknown as MetricsEvaluatorConfig;
			const result = evaluator.validateConfig(config);

			assert.equal(result.valid, false);
			assert.ok(result.errors?.includes("criteria must be an array"));
		});

		it("should validate threshold criterion", () => {
			const config: MetricsEvaluatorConfig = {
				criteria: [
					createTestCriterion({
						type: "threshold",
						threshold: { operator: "gt", value: 100 },
					}),
				],
			};
			const result = evaluator.validateConfig(config);

			assert.equal(result.valid, true);
		});

		it("should validate baseline criterion", () => {
			const config: MetricsEvaluatorConfig = {
				criteria: [
					createTestCriterion({
						type: "baseline",
						baseline: { sut: "baseline-sut", operator: "gt" },
					}),
				],
			};
			const result = evaluator.validateConfig(config);

			assert.equal(result.valid, true);
		});

		it("should validate target-range criterion", () => {
			const config: MetricsEvaluatorConfig = {
				criteria: [
					createTestCriterion({
						type: "target-range",
						targetRange: { min: 50, max: 100 },
					}),
				],
			};
			const result = evaluator.validateConfig(config);

			assert.equal(result.valid, true);
		});

		it("should invalidate threshold criterion with missing threshold", () => {
			const criterion = createTestCriterion({ type: "threshold" });
			delete (criterion as Partial<MetricsCriterion>).threshold;
			const config: MetricsEvaluatorConfig = { criteria: [criterion] };

			const result = evaluator.validateConfig(config);

			assert.equal(result.valid, false);
		});

		it("should invalidate baseline criterion with missing baseline", () => {
			const criterion = createTestCriterion({ type: "baseline" });
			delete (criterion as Partial<MetricsCriterion>).baseline;
			const config: MetricsEvaluatorConfig = { criteria: [criterion] };

			const result = evaluator.validateConfig(config);

			assert.equal(result.valid, false);
		});

		it("should invalidate target-range criterion with missing targetRange", () => {
			const criterion = createTestCriterion({ type: "target-range" });
			delete (criterion as Partial<MetricsCriterion>).targetRange;
			const config: MetricsEvaluatorConfig = { criteria: [criterion] };

			const result = evaluator.validateConfig(config);

			assert.equal(result.valid, false);
		});

		it("should invalidate criterion with missing required fields", () => {
			const config: MetricsEvaluatorConfig = {
				criteria: [
					{
						criterionId: "",
						description: "",
						type: "threshold",
						metric: "",
						sut: "",
						threshold: { operator: "gt", value: 0 },
					},
				],
			};

			const result = evaluator.validateConfig(config);

			assert.equal(result.valid, false);
			assert.ok(result.errors !== undefined && result.errors.length > 0);
		});
	});

	describe("evaluate - threshold criteria", () => {
		const evaluator = new MetricsEvaluator();

		it("should pass gt threshold when value exceeds threshold", () => {
			const config: MetricsEvaluatorConfig = {
				criteria: [
					createTestCriterion({
						type: "threshold",
						metric: "accuracy",
						threshold: { operator: "gt", value: 0.8 },
					}),
				],
			};

			const aggregates = [
				createMockAggregate("primary-sut", "primary", undefined, {
					accuracy: createMockSummaryStats([0.85]),
				}),
			];

			const context = createTestContext(aggregates);
			const result = evaluator.evaluate(config, context);

			assert.equal(result.type, "metrics");
			assert.equal(result.data.summary.total, 1);
			assert.equal(result.data.summary.passed, 1);
			assert.equal(result.data.summary.failed, 0);
		});

		it("should fail gte threshold when value equals threshold", () => {
			const config: MetricsEvaluatorConfig = {
				criteria: [
					createTestCriterion({
						type: "threshold",
						metric: "accuracy",
						threshold: { operator: "gt", value: 0.8 },
					}),
				],
			};

			const aggregates = [
				createMockAggregate("primary-sut", "primary", undefined, {
					accuracy: createMockSummaryStats([0.8]),
				}),
			];

			const context = createTestContext(aggregates);
			const result = evaluator.evaluate(config, context);

			assert.equal(result.data.summary.failed, 1);
			assert.equal(result.data.summary.passed, 0);
		});

		it("should pass gte threshold when value equals threshold", () => {
			const config: MetricsEvaluatorConfig = {
				criteria: [
					createTestCriterion({
						type: "threshold",
						metric: "accuracy",
						threshold: { operator: "gte", value: 0.8 },
					}),
				],
			};

			const aggregates = [
				createMockAggregate("primary-sut", "primary", undefined, {
					accuracy: createMockSummaryStats([0.8]),
				}),
			];

			const context = createTestContext(aggregates);
			const result = evaluator.evaluate(config, context);

			assert.equal(result.data.summary.passed, 1);
		});

		it("should be inconclusive when metric not found", () => {
			const config: MetricsEvaluatorConfig = {
				criteria: [
					createTestCriterion({
						type: "threshold",
						metric: "missing-metric",
						threshold: { operator: "gt", value: 0.8 },
					}),
				],
			};

			const aggregates = [
				createMockAggregate("primary-sut", "primary", undefined, {
					accuracy: createMockSummaryStats([0.85]),
				}),
			];

			const context = createTestContext(aggregates);
			const result = evaluator.evaluate(config, context);

			assert.equal(result.data.summary.inconclusive, 1);
		});

		it("should handle multiple SUTs with wildcard", () => {
			const config: MetricsEvaluatorConfig = {
				criteria: [
					createTestCriterion({
						criterionId: "C001",
						sut: "*",
						type: "threshold",
						metric: "accuracy",
						threshold: { operator: "gte", value: 0.8 },
					}),
				],
			};

			const aggregates = [
				createMockAggregate("sut-1", "primary", undefined, {
					accuracy: createMockSummaryStats([0.85]),
				}),
				createMockAggregate("sut-2", "primary", undefined, {
					accuracy: createMockSummaryStats([0.75]),
				}),
			];

			const context = createTestContext(aggregates);
			const result = evaluator.evaluate(config, context);

			assert.equal(result.data.summary.total, 1); // 1 criterion
			assert.equal(result.data.summary.failed, 1); // sut-2 fails
		});
	});

	describe("evaluate - baseline criteria", () => {
		const evaluator = new MetricsEvaluator();

		it("should pass baseline comparison", () => {
			const config: MetricsEvaluatorConfig = {
				criteria: [
					createTestCriterion({
						type: "baseline",
						baseline: { sut: "baseline-sut", operator: "gt" },
					}),
				],
			};

			const aggregates = [
				createMockAggregate("primary-sut", "primary", undefined, {
					accuracy: createMockSummaryStats([0.85]),
				}),
				createMockAggregate("baseline-sut", "baseline", undefined, {
					accuracy: createMockSummaryStats([0.75]),
				}),
			];

			const context = createTestContext(aggregates);
			const result = evaluator.evaluate(config, context);

			assert.equal(result.data.summary.passed, 1);
		});

		it("should fail when below baseline", () => {
			const config: MetricsEvaluatorConfig = {
				criteria: [
					createTestCriterion({
						type: "baseline",
						baseline: { sut: "baseline-sut", operator: "gt" },
					}),
				],
			};

			const aggregates = [
				createMockAggregate("primary-sut", "primary", undefined, {
					accuracy: createMockSummaryStats([0.7]),
				}),
				createMockAggregate("baseline-sut", "baseline", undefined, {
					accuracy: createMockSummaryStats([0.8]),
				}),
			];

			const context = createTestContext(aggregates);
			const result = evaluator.evaluate(config, context);

			assert.equal(result.data.summary.failed, 1);
		});

		it("should be inconclusive when baseline SUT not found", () => {
			const config: MetricsEvaluatorConfig = {
				criteria: [
					createTestCriterion({
						type: "baseline",
						baseline: { sut: "missing-baseline", operator: "gt" },
					}),
				],
			};

			const aggregates = [
				createMockAggregate("primary-sut", "primary", undefined, {
					accuracy: createMockSummaryStats([0.85]),
				}),
			];

			const context = createTestContext(aggregates);
			const result = evaluator.evaluate(config, context);

			assert.equal(result.data.summary.inconclusive, 1);
		});
	});

	describe("evaluate - target-range criteria", () => {
		const evaluator = new MetricsEvaluator();

		it("should pass when value in range", () => {
			const config: MetricsEvaluatorConfig = {
				criteria: [
					createTestCriterion({
						type: "target-range",
						targetRange: { min: 50, max: 100 },
					}),
				],
			};

			const aggregates = [
				createMockAggregate("primary-sut", "primary", undefined, {
					accuracy: createMockSummaryStats([75]),
				}),
			];

			const context = createTestContext(aggregates);
			const result = evaluator.evaluate(config, context);

			assert.equal(result.data.summary.passed, 1);
		});

		it("should fail when value below min", () => {
			const config: MetricsEvaluatorConfig = {
				criteria: [
					createTestCriterion({
						type: "target-range",
						targetRange: { min: 50, max: 100 },
					}),
				],
			};

			const aggregates = [
				createMockAggregate("primary-sut", "primary", undefined, {
					accuracy: createMockSummaryStats([40]),
				}),
			];

			const context = createTestContext(aggregates);
			const result = evaluator.evaluate(config, context);

			assert.equal(result.data.summary.failed, 1);
		});

		it("should fail when value above max", () => {
			const config: MetricsEvaluatorConfig = {
				criteria: [
					createTestCriterion({
						type: "target-range",
						targetRange: { min: 50, max: 100 },
					}),
				],
			};

			const aggregates = [
				createMockAggregate("primary-sut", "primary", undefined, {
					accuracy: createMockSummaryStats([120]),
				}),
			];

			const context = createTestContext(aggregates);
			const result = evaluator.evaluate(config, context);

			assert.equal(result.data.summary.failed, 1);
		});

		it("should handle open-ended range (max only)", () => {
			const config: MetricsEvaluatorConfig = {
				criteria: [
					createTestCriterion({
						type: "target-range",
						targetRange: { max: 100 },
					}),
				],
			};

			const aggregates = [
				createMockAggregate("primary-sut", "primary", undefined, {
					accuracy: createMockSummaryStats([50]),
				}),
			];

			const context = createTestContext(aggregates);
			const result = evaluator.evaluate(config, context);

			assert.equal(result.data.summary.passed, 1);
		});
	});

	describe("evaluate - scope constraints", () => {
		const evaluator = new MetricsEvaluator();

		it("should filter by caseClass", () => {
			const config: MetricsEvaluatorConfig = {
				criteria: [
					createTestCriterion({
						type: "threshold",
						scopeConstraints: { caseClass: "scale-free" },
					}),
				],
			};

			const aggregates = [
				createMockAggregate("primary-sut", "primary", "scale-free", {
					accuracy: createMockSummaryStats([0.85]),
				}),
				createMockAggregate("primary-sut", "primary", "small-world", {
					accuracy: createMockSummaryStats([0.65]),
				}),
			];

			const context = createTestContext(aggregates);
			const result = evaluator.evaluate(config, context);

			// Should only evaluate scale-free aggregate
			assert.equal(result.data.results[0].observed[0].value, 0.85);
		});
	});

	describe("summarize", () => {
		const evaluator = new MetricsEvaluator();

		it("should create summary from output", () => {
			const config: MetricsEvaluatorConfig = {
				criteria: [
					createTestCriterion({
						type: "threshold",
						threshold: { operator: "gte", value: 0.8 },
					}),
				],
			};

			const aggregates = [
				createMockAggregate("primary-sut", "primary", undefined, {
					accuracy: createMockSummaryStats([0.85]),
				}),
			];

			const context = createTestContext(aggregates);
			const output = evaluator.evaluate(config, context);
			const summary = evaluator.summarize(output);

			assert.equal(summary.total, 1);
			assert.equal(summary.passed, 1);
			assert.equal(summary.failed, 0);
			assert.equal(summary.passRate, 1);
		});
	});
});
