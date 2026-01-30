/**
 * Evaluator Schema Validation Tests
 *
 * Tests Zod schemas for all evaluator config types:
 * valid configs parse, invalid configs produce expected errors,
 * and cross-field validation works correctly.
 */

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import {
	ClaimsEvaluatorConfigSchema,
	MetricsEvaluatorConfigSchema,
	RobustnessEvaluatorConfigSchema,
	ExploratoryEvaluatorConfigSchema,
	CustomEvaluatorConfigSchema,
	EvaluatorEntrySchema,
} from "../evaluator-schemas.js";

// ============================================================================
// Claims Evaluator Config
// ============================================================================

describe("ClaimsEvaluatorConfigSchema", () => {
	it("parses a valid claims config", () => {
		const input = {
			name: "Test Claims",
			claims: [
				{
					claimId: "C001",
					description: "Primary is better than baseline",
					sut: "primary-sut",
					baseline: "baseline-sut",
					metric: "accuracy",
					direction: "greater",
					scope: "global",
				},
			],
			significanceLevel: 0.05,
		};

		const result = ClaimsEvaluatorConfigSchema.safeParse(input);
		assert.ok(result.success, `Expected success, got: ${JSON.stringify(result.error?.issues)}`);
		assert.equal(result.data.claims.length, 1);
		assert.equal(result.data.claims[0].claimId, "C001");
		assert.equal(result.data.significanceLevel, 0.05);
	});

	it("rejects config without claims array", () => {
		const input = { name: "No claims" };
		const result = ClaimsEvaluatorConfigSchema.safeParse(input);
		assert.ok(!result.success);
	});

	it("rejects config with empty claims array", () => {
		const input = { claims: [] };
		const result = ClaimsEvaluatorConfigSchema.safeParse(input);
		assert.ok(!result.success);
	});

	it("rejects claim with missing required fields", () => {
		const input = {
			claims: [
				{
					claimId: "C001",
					// missing description, sut, baseline, metric, direction, scope
				},
			],
		};
		const result = ClaimsEvaluatorConfigSchema.safeParse(input);
		assert.ok(!result.success);
	});

	it("rejects invalid direction value", () => {
		const input = {
			claims: [
				{
					claimId: "C001",
					description: "test",
					sut: "a",
					baseline: "b",
					metric: "m",
					direction: "invalid",
					scope: "global",
				},
			],
		};
		const result = ClaimsEvaluatorConfigSchema.safeParse(input);
		assert.ok(!result.success);
	});

	it("accepts claim with optional fields", () => {
		const input = {
			claims: [
				{
					claimId: "C001",
					description: "test",
					sut: "a",
					baseline: "b",
					metric: "m",
					direction: "greater",
					scope: "caseClass",
					threshold: 0.1,
					scopeConstraints: { caseClass: "scale-free" },
					significanceLevel: 0.01,
					minEffectSize: 0.5,
					tags: ["performance"],
					citation: "Author et al. 2024",
				},
			],
		};
		const result = ClaimsEvaluatorConfigSchema.safeParse(input);
		assert.ok(result.success, `Expected success, got: ${JSON.stringify(result.error?.issues)}`);
	});
});

// ============================================================================
// Metrics Evaluator Config
// ============================================================================

describe("MetricsEvaluatorConfigSchema", () => {
	it("parses a valid metrics config with threshold criterion", () => {
		const input = {
			criteria: [
				{
					criterionId: "exec-time",
					description: "Execution time under 1000ms",
					type: "threshold",
					metric: "executionTime",
					sut: "*",
					threshold: { operator: "lt", value: 1000 },
				},
			],
		};

		const result = MetricsEvaluatorConfigSchema.safeParse(input);
		assert.ok(result.success, `Expected success, got: ${JSON.stringify(result.error?.issues)}`);
		assert.equal(result.data.criteria.length, 1);
	});

	it("parses a valid metrics config with baseline criterion", () => {
		const input = {
			criteria: [
				{
					criterionId: "accuracy-baseline",
					description: "Better accuracy than baseline",
					type: "baseline",
					metric: "accuracy",
					sut: "new-algo",
					baseline: { sut: "baseline-algo", operator: "gte" },
				},
			],
		};

		const result = MetricsEvaluatorConfigSchema.safeParse(input);
		assert.ok(result.success, `Expected success, got: ${JSON.stringify(result.error?.issues)}`);
	});

	it("parses a valid metrics config with target-range criterion", () => {
		const input = {
			criteria: [
				{
					criterionId: "f1-range",
					description: "F1 in [0.8, 1.0]",
					type: "target-range",
					metric: "f1Score",
					sut: "*",
					targetRange: { min: 0.8, max: 1.0, minInclusive: true, maxInclusive: true },
				},
			],
		};

		const result = MetricsEvaluatorConfigSchema.safeParse(input);
		assert.ok(result.success, `Expected success, got: ${JSON.stringify(result.error?.issues)}`);
	});

	it("rejects threshold type without threshold field", () => {
		const input = {
			criteria: [
				{
					criterionId: "bad",
					description: "Missing threshold",
					type: "threshold",
					metric: "m",
					sut: "*",
					// no threshold field
				},
			],
		};

		const result = MetricsEvaluatorConfigSchema.safeParse(input);
		assert.ok(!result.success);
		const messages = result.error.issues.map((i) => i.message);
		assert.ok(
			messages.some((m) => m.includes("threshold")),
			`Expected threshold error, got: ${messages.join(", ")}`,
		);
	});

	it("rejects baseline type without baseline field", () => {
		const input = {
			criteria: [
				{
					criterionId: "bad",
					description: "Missing baseline",
					type: "baseline",
					metric: "m",
					sut: "s",
					// no baseline field
				},
			],
		};

		const result = MetricsEvaluatorConfigSchema.safeParse(input);
		assert.ok(!result.success);
		const messages = result.error.issues.map((i) => i.message);
		assert.ok(
			messages.some((m) => m.includes("baseline")),
			`Expected baseline error, got: ${messages.join(", ")}`,
		);
	});

	it("rejects target-range type without targetRange field", () => {
		const input = {
			criteria: [
				{
					criterionId: "bad",
					description: "Missing targetRange",
					type: "target-range",
					metric: "m",
					sut: "*",
					// no targetRange field
				},
			],
		};

		const result = MetricsEvaluatorConfigSchema.safeParse(input);
		assert.ok(!result.success);
		const messages = result.error.issues.map((i) => i.message);
		assert.ok(
			messages.some((m) => m.includes("targetRange") || m.includes("target-range")),
			`Expected targetRange error, got: ${messages.join(", ")}`,
		);
	});

	it("rejects config without criteria", () => {
		const result = MetricsEvaluatorConfigSchema.safeParse({ name: "no criteria" });
		assert.ok(!result.success);
	});

	it("rejects config with empty criteria array", () => {
		const result = MetricsEvaluatorConfigSchema.safeParse({ criteria: [] });
		assert.ok(!result.success);
	});
});

// ============================================================================
// Robustness Evaluator Config
// ============================================================================

describe("RobustnessEvaluatorConfigSchema", () => {
	it("parses a valid robustness config", () => {
		const input = {
			name: "Robustness Analysis",
			metrics: ["executionTime", "accuracy"],
			perturbations: ["edge-removal", "noise"],
			intensityLevels: [0.1, 0.2, 0.3],
			runsPerLevel: 10,
		};

		const result = RobustnessEvaluatorConfigSchema.safeParse(input);
		assert.ok(result.success, `Expected success, got: ${JSON.stringify(result.error?.issues)}`);
		assert.equal(result.data.metrics.length, 2);
		assert.equal(result.data.perturbations.length, 2);
	});

	it("rejects config without metrics", () => {
		const input = { perturbations: ["edge-removal"] };
		const result = RobustnessEvaluatorConfigSchema.safeParse(input);
		assert.ok(!result.success);
	});

	it("rejects config without perturbations", () => {
		const input = { metrics: ["accuracy"] };
		const result = RobustnessEvaluatorConfigSchema.safeParse(input);
		assert.ok(!result.success);
	});

	it("rejects empty metrics array", () => {
		const input = { metrics: [], perturbations: ["noise"] };
		const result = RobustnessEvaluatorConfigSchema.safeParse(input);
		assert.ok(!result.success);
	});
});

// ============================================================================
// Exploratory Evaluator Config
// ============================================================================

describe("ExploratoryEvaluatorConfigSchema", () => {
	it("parses a minimal exploratory config (all optional)", () => {
		const result = ExploratoryEvaluatorConfigSchema.safeParse({});
		assert.ok(result.success, `Expected success, got: ${JSON.stringify(result.error?.issues)}`);
	});

	it("parses a full exploratory config", () => {
		const input = {
			name: "Exploratory Analysis",
			metrics: ["accuracy", "f1Score"],
			suts: ["sut-a", "sut-b"],
			metricDirections: {
				accuracy: "higher-better",
				executionTime: "lower-better",
			},
			significanceLevel: 0.01,
			minEffectSize: 0.3,
			computeCorrelations: true,
			analyzeCaseClassEffects: false,
		};

		const result = ExploratoryEvaluatorConfigSchema.safeParse(input);
		assert.ok(result.success, `Expected success, got: ${JSON.stringify(result.error?.issues)}`);
		assert.equal(result.data.computeCorrelations, true);
	});

	it("rejects invalid metric direction", () => {
		const input = {
			metricDirections: { accuracy: "invalid-direction" },
		};
		const result = ExploratoryEvaluatorConfigSchema.safeParse(input);
		assert.ok(!result.success);
	});
});

// ============================================================================
// Custom Evaluator Config
// ============================================================================

describe("CustomEvaluatorConfigSchema", () => {
	it("parses a valid custom config", () => {
		const input = {
			customType: "my-evaluator",
			myParam: 42,
			nested: { key: "value" },
		};

		const result = CustomEvaluatorConfigSchema.safeParse(input);
		assert.ok(result.success, `Expected success, got: ${JSON.stringify(result.error?.issues)}`);
		assert.equal(result.data.customType, "my-evaluator");
	});

	it("rejects config without customType", () => {
		const result = CustomEvaluatorConfigSchema.safeParse({ foo: "bar" });
		assert.ok(!result.success);
	});
});

// ============================================================================
// EvaluatorEntry (for ExperimentConfig.evaluators array)
// ============================================================================

describe("EvaluatorEntrySchema", () => {
	it("parses a claims evaluator entry", () => {
		const input = {
			type: "claims",
			config: {
				claims: [
					{
						claimId: "C001",
						description: "test",
						sut: "a",
						baseline: "b",
						metric: "m",
						direction: "greater",
						scope: "global",
					},
				],
			},
		};

		const result = EvaluatorEntrySchema.safeParse(input);
		assert.ok(result.success, `Expected success, got: ${JSON.stringify(result.error?.issues)}`);
	});

	it("rejects entry with invalid type", () => {
		const result = EvaluatorEntrySchema.safeParse({
			type: "nonexistent",
			config: {},
		});
		assert.ok(!result.success);
	});
});
