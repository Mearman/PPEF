/**
 * Unit tests for Claims Evaluator
 *
 * Tests the evaluateClaim function and related functionality including:
 * - Satisfied claims with various directions
 * - Violated claims
 * - Inconclusive results from missing data
 * - Evidence computation (delta, ratio, pValue, effectSize)
 * - Scope filtering with caseClass constraints
 */

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import { createMockAggregate, createMockSummaryStats } from "../../__tests__/test-helpers.js";
import type { EvaluationClaim } from "../../types/claims.js";
import { evaluateClaim, evaluateClaims, createClaimSummary } from "../evaluator.js";

/**
 * Test helpers
 */

/**
 * Create a test claim with defaults.
 */
const createTestClaim = (overrides?: Partial<EvaluationClaim>): EvaluationClaim => ({
	claimId: "C001",
	description: "Test claim",
	sut: "primary-sut",
	baseline: "baseline-sut",
	metric: "execution-time",
	direction: "less",
	scope: "global",
	...overrides,
});

/**
 * Test suites
 */

describe("evaluateClaim", () => {
	describe("satisfied claims - direction 'less'", () => {
		it("should satisfy claim when primary < baseline", () => {
			const claim = createTestClaim({
				sut: "fast-sut",
				baseline: "slow-sut",
				direction: "less",
			});

			const aggregates = [
				createMockAggregate("fast-sut", "primary", undefined, {
					"execution-time": createMockSummaryStats([80, 85, 90]),
				}),
				createMockAggregate("slow-sut", "baseline", undefined, {
					"execution-time": createMockSummaryStats([120, 125, 130]),
				}),
			];

			const result = evaluateClaim(claim, aggregates);

			assert.equal(result.status, "satisfied");
			assert.equal(result.claim.claimId, "C001");
			assert.equal(result.evidence.primaryValue, 85);
			assert.equal(result.evidence.baselineValue, 125);
			assert.equal(result.evidence.delta, -40);
		});

		it("should satisfy claim with threshold when primary <= baseline - threshold", () => {
			const claim = createTestClaim({
				sut: "fast-sut",
				baseline: "slow-sut",
				direction: "less",
				threshold: 10,
			});

			const aggregates = [
				createMockAggregate("fast-sut", "primary", undefined, {
					"execution-time": createMockSummaryStats([80, 85, 90]),
				}),
				createMockAggregate("slow-sut", "baseline", undefined, {
					"execution-time": createMockSummaryStats([100, 105, 110]),
				}),
			];

			const result = evaluateClaim(claim, aggregates);

			assert.equal(result.status, "satisfied");
			assert.equal(result.evidence.delta, -20);
			assert.equal(result.evidence.delta, -20); // -20 <= -10 threshold
		});
	});

	describe("violated claims - direction 'less'", () => {
		it("should violate claim when primary > baseline", () => {
			const claim = createTestClaim({
				sut: "slow-sut",
				baseline: "fast-sut",
				direction: "less",
			});

			const aggregates = [
				createMockAggregate("slow-sut", "primary", undefined, {
					"execution-time": createMockSummaryStats([120, 125, 130]),
				}),
				createMockAggregate("fast-sut", "baseline", undefined, {
					"execution-time": createMockSummaryStats([80, 85, 90]),
				}),
			];

			const result = evaluateClaim(claim, aggregates);

			assert.equal(result.status, "violated");
			assert.equal(result.evidence.delta, 40);
		});

		it("should violate claim with threshold when delta not sufficient", () => {
			const claim = createTestClaim({
				sut: "fast-sut",
				baseline: "slow-sut",
				direction: "less",
				threshold: 50,
			});

			const aggregates = [
				createMockAggregate("fast-sut", "primary", undefined, {
					"execution-time": createMockSummaryStats([80, 85, 90]),
				}),
				createMockAggregate("slow-sut", "baseline", undefined, {
					"execution-time": createMockSummaryStats([120, 125, 130]),
				}),
			];

			const result = evaluateClaim(claim, aggregates);

			assert.equal(result.status, "violated");
			assert.equal(result.evidence.delta, -40); // -40 > -50 threshold
		});
	});

	describe("satisfied claims - direction 'greater'", () => {
		it("should satisfy claim when primary > baseline", () => {
			const claim = createTestClaim({
				sut: "high-quality",
				baseline: "low-quality",
				metric: "accuracy",
				direction: "greater",
			});

			const aggregates = [
				createMockAggregate("high-quality", "primary", undefined, {
					accuracy: createMockSummaryStats([0.9, 0.92, 0.95]),
				}),
				createMockAggregate("low-quality", "baseline", undefined, {
					accuracy: createMockSummaryStats([0.7, 0.75, 0.8]),
				}),
			];

			const result = evaluateClaim(claim, aggregates);

			assert.equal(result.status, "satisfied");
			assert.ok(Math.abs(result.evidence.delta - 0.17) < 0.01);
		});

		it("should satisfy claim with threshold", () => {
			const claim = createTestClaim({
				sut: "high-quality",
				baseline: "low-quality",
				metric: "accuracy",
				direction: "greater",
				threshold: 0.1,
			});

			const aggregates = [
				createMockAggregate("high-quality", "primary", undefined, {
					accuracy: createMockSummaryStats([0.9, 0.92, 0.95]),
				}),
				createMockAggregate("low-quality", "baseline", undefined, {
					accuracy: createMockSummaryStats([0.7, 0.75, 0.8]),
				}),
			];

			const result = evaluateClaim(claim, aggregates);

			assert.equal(result.status, "satisfied");
			assert.ok(Math.abs(result.evidence.delta - 0.17) < 0.01); // 0.17 >= 0.1
		});
	});

	describe("violated claims - direction 'greater'", () => {
		it("should violate claim when primary < baseline", () => {
			const claim = createTestClaim({
				sut: "low-quality",
				baseline: "high-quality",
				metric: "accuracy",
				direction: "greater",
			});

			const aggregates = [
				createMockAggregate("low-quality", "primary", undefined, {
					accuracy: createMockSummaryStats([0.7, 0.75, 0.8]),
				}),
				createMockAggregate("high-quality", "baseline", undefined, {
					accuracy: createMockSummaryStats([0.9, 0.92, 0.95]),
				}),
			];

			const result = evaluateClaim(claim, aggregates);

			assert.equal(result.status, "violated");
			assert.ok(Math.abs(result.evidence.delta - -0.17) < 0.01);
		});
	});

	describe("satisfied claims - direction 'equal'", () => {
		it("should satisfy claim when values are approximately equal", () => {
			const claim = createTestClaim({
				sut: "sut-a",
				baseline: "sut-b",
				metric: "output-size",
				direction: "equal",
			});

			const aggregates = [
				createMockAggregate("sut-a", "primary", undefined, {
					"output-size": createMockSummaryStats([100, 100.1, 99.9]),
				}),
				createMockAggregate("sut-b", "baseline", undefined, {
					"output-size": createMockSummaryStats([100, 100.05, 99.95]),
				}),
			];

			const result = evaluateClaim(claim, aggregates);

			assert.equal(result.status, "satisfied");
			assert.ok(Math.abs(result.evidence.delta) <= 0.001);
		});

		it("should satisfy claim with custom threshold", () => {
			const claim = createTestClaim({
				sut: "sut-a",
				baseline: "sut-b",
				metric: "output-size",
				direction: "equal",
				threshold: 5,
			});

			const aggregates = [
				createMockAggregate("sut-a", "primary", undefined, {
					"output-size": createMockSummaryStats([100, 102, 98]),
				}),
				createMockAggregate("sut-b", "baseline", undefined, {
					"output-size": createMockSummaryStats([103, 105, 97]),
				}),
			];

			const result = evaluateClaim(claim, aggregates);

			assert.equal(result.status, "satisfied");
			assert.ok(Math.abs(result.evidence.delta) <= 5);
		});
	});

	describe("violated claims - direction 'equal'", () => {
		it("should violate claim when values differ significantly", () => {
			const claim = createTestClaim({
				sut: "sut-a",
				baseline: "sut-b",
				metric: "output-size",
				direction: "equal",
			});

			const aggregates = [
				createMockAggregate("sut-a", "primary", undefined, {
					"output-size": createMockSummaryStats([100, 110, 90]),
				}),
				createMockAggregate("sut-b", "baseline", undefined, {
					"output-size": createMockSummaryStats([150, 160, 140]),
				}),
			];

			const result = evaluateClaim(claim, aggregates);

			assert.equal(result.status, "violated");
			assert.ok(Math.abs(result.evidence.delta) > 0.001);
		});
	});

	describe("inconclusive - missing primary or baseline", () => {
		it("should be inconclusive when primary SUT not found", () => {
			const claim = createTestClaim({
				sut: "missing-sut",
				baseline: "baseline-sut",
			});

			const aggregates = [
				createMockAggregate("baseline-sut", "baseline", undefined, {
					"execution-time": createMockSummaryStats([100, 110, 120]),
				}),
			];

			const result = evaluateClaim(claim, aggregates);

			assert.equal(result.status, "inconclusive");
			assert.ok(result.inconclusiveReason?.includes("Primary SUT not found"));
		});

		it("should be inconclusive when baseline SUT not found", () => {
			const claim = createTestClaim({
				sut: "primary-sut",
				baseline: "missing-sut",
			});

			const aggregates = [
				createMockAggregate("primary-sut", "primary", undefined, {
					"execution-time": createMockSummaryStats([80, 85, 90]),
				}),
			];

			const result = evaluateClaim(claim, aggregates);

			assert.equal(result.status, "inconclusive");
			assert.ok(result.inconclusiveReason?.includes("Baseline SUT not found"));
		});

		it("should be inconclusive when both SUTs not found", () => {
			const claim = createTestClaim({
				sut: "missing-primary",
				baseline: "missing-baseline",
			});

			const aggregates = [
				createMockAggregate("other-sut", "baseline", undefined, {
					"execution-time": createMockSummaryStats([100, 110, 120]),
				}),
			];

			const result = evaluateClaim(claim, aggregates);

			assert.equal(result.status, "inconclusive");
			assert.ok(result.inconclusiveReason?.includes("Primary SUT not found"));
			assert.ok(result.inconclusiveReason?.includes("Baseline SUT not found"));
		});
	});

	describe("inconclusive - missing metrics", () => {
		it("should be inconclusive when metric missing from primary", () => {
			const claim = createTestClaim({
				metric: "memory-usage",
			});

			const aggregates = [
				createMockAggregate("primary-sut", "primary", undefined, {
					"execution-time": createMockSummaryStats([80, 85, 90]),
				}),
				createMockAggregate("baseline-sut", "baseline", undefined, {
					"memory-usage": createMockSummaryStats([100, 110, 120]),
				}),
			];

			const result = evaluateClaim(claim, aggregates);

			assert.equal(result.status, "inconclusive");
			assert.ok(result.inconclusiveReason?.includes("Metric not found"));
		});

		it("should be inconclusive when metric missing from baseline", () => {
			const claim = createTestClaim({
				metric: "memory-usage",
			});

			const aggregates = [
				createMockAggregate("primary-sut", "primary", undefined, {
					"memory-usage": createMockSummaryStats([80, 85, 90]),
				}),
				createMockAggregate("baseline-sut", "baseline", undefined, {
					"execution-time": createMockSummaryStats([100, 110, 120]),
				}),
			];

			const result = evaluateClaim(claim, aggregates);

			assert.equal(result.status, "inconclusive");
			assert.ok(result.inconclusiveReason?.includes("Metric not found"));
		});

		it("should be inconclusive when metric missing from both", () => {
			const claim = createTestClaim({
				metric: "memory-usage",
			});

			const aggregates = [
				createMockAggregate("primary-sut", "primary", undefined, {}),
				createMockAggregate("baseline-sut", "baseline", undefined, {}),
			];

			const result = evaluateClaim(claim, aggregates);

			assert.equal(result.status, "inconclusive");
			assert.ok(result.inconclusiveReason?.includes("Metric not found"));
		});
	});

	describe("evidence computation", () => {
		it("should compute delta correctly", () => {
			const claim = createTestClaim({
				sut: "primary-sut",
				baseline: "baseline-sut",
				metric: "execution-time",
			});

			const aggregates = [
				createMockAggregate("primary-sut", "primary", undefined, {
					"execution-time": createMockSummaryStats([80, 90, 100]),
				}),
				createMockAggregate("baseline-sut", "baseline", undefined, {
					"execution-time": createMockSummaryStats([120, 130, 140]),
				}),
			];

			const result = evaluateClaim(claim, aggregates);

			assert.equal(result.evidence.primaryValue, 90);
			assert.equal(result.evidence.baselineValue, 130);
			assert.equal(result.evidence.delta, -40);
		});

		it("should compute ratio correctly", () => {
			const claim = createTestClaim({
				sut: "primary-sut",
				baseline: "baseline-sut",
			});

			const aggregates = [
				createMockAggregate("primary-sut", "primary", undefined, {
					"execution-time": createMockSummaryStats([100]),
				}),
				createMockAggregate("baseline-sut", "baseline", undefined, {
					"execution-time": createMockSummaryStats([200]),
				}),
			];

			const result = evaluateClaim(claim, aggregates);

			assert.equal(result.evidence.ratio, 0.5);
		});

		it("should handle zero baseline for ratio", () => {
			const claim = createTestClaim({
				sut: "primary-sut",
				baseline: "baseline-sut",
				metric: "errors",
			});

			const aggregates = [
				createMockAggregate("primary-sut", "primary", undefined, {
					errors: createMockSummaryStats([0]),
				}),
				createMockAggregate("baseline-sut", "baseline", undefined, {
					errors: createMockSummaryStats([0]),
				}),
			];

			const result = evaluateClaim(claim, aggregates);

			assert.equal(result.evidence.ratio, Infinity);
		});

		it("should compute n as sum of sample sizes", () => {
			const claim = createTestClaim();

			const aggregates = [
				createMockAggregate("primary-sut", "primary", undefined, {
					"execution-time": createMockSummaryStats([100, 110, 120]),
				}),
				createMockAggregate("baseline-sut", "baseline", undefined, {
					"execution-time": createMockSummaryStats([200, 210]),
				}),
			];

			const result = evaluateClaim(claim, aggregates);

			assert.equal(result.evidence.n, 5); // 3 + 2
		});

		it("should include pValue from comparisons", () => {
			const claim = createTestClaim();

			const primaryAgg = createMockAggregate("primary-sut", "primary", undefined, {
				"execution-time": createMockSummaryStats([80, 85, 90]),
			});

			const baselineAgg = createMockAggregate("baseline-sut", "baseline", undefined, {
				"execution-time": createMockSummaryStats([120, 125, 130]),
			});

			// Add comparison data
			primaryAgg.comparisons = {
				"baseline-sut": {
					deltas: { "execution-time": -40 },
					ratios: { "execution-time": 0.68 },
					pValue: 0.01,
					effectSize: 1.5,
				},
			};

			const aggregates = [primaryAgg, baselineAgg];

			const result = evaluateClaim(claim, aggregates);

			assert.equal(result.evidence.pValue, 0.01);
			assert.equal(result.evidence.effectSize, 1.5);
		});

		it("should handle missing pValue and effectSize", () => {
			const claim = createTestClaim();

			const aggregates = [
				createMockAggregate("primary-sut", "primary", undefined, {
					"execution-time": createMockSummaryStats([80, 85, 90]),
				}),
				createMockAggregate("baseline-sut", "baseline", undefined, {
					"execution-time": createMockSummaryStats([120, 125, 130]),
				}),
			];

			const result = evaluateClaim(claim, aggregates);

			assert.equal(result.evidence.pValue, undefined);
			assert.equal(result.evidence.effectSize, undefined);
		});
	});

	describe("statistical significance", () => {
		it("should be inconclusive when pValue exceeds significance level", () => {
			const claim = createTestClaim({
				significanceLevel: 0.05,
			});

			const primaryAgg = createMockAggregate("primary-sut", "primary", undefined, {
				"execution-time": createMockSummaryStats([80, 85, 90]),
			});

			const baselineAgg = createMockAggregate("baseline-sut", "baseline", undefined, {
				"execution-time": createMockSummaryStats([120, 125, 130]),
			});

			primaryAgg.comparisons = {
				"baseline-sut": {
					deltas: { "execution-time": -40 },
					ratios: { "execution-time": 0.68 },
					pValue: 0.1, // Not significant
					effectSize: 1.5,
				},
			};

			const result = evaluateClaim(claim, [primaryAgg, baselineAgg]);

			assert.equal(result.status, "inconclusive");
		});

		it("should be satisfied when pValue meets significance level", () => {
			const claim = createTestClaim({
				direction: "less",
				significanceLevel: 0.05,
			});

			const primaryAgg = createMockAggregate("primary-sut", "primary", undefined, {
				"execution-time": createMockSummaryStats([80, 85, 90]),
			});

			const baselineAgg = createMockAggregate("baseline-sut", "baseline", undefined, {
				"execution-time": createMockSummaryStats([120, 125, 130]),
			});

			primaryAgg.comparisons = {
				"baseline-sut": {
					deltas: { "execution-time": -40 },
					ratios: { "execution-time": 0.68 },
					pValue: 0.01, // Significant
					effectSize: 1.5,
				},
			};

			const result = evaluateClaim(claim, [primaryAgg, baselineAgg]);

			assert.equal(result.status, "satisfied");
		});

		it("should be inconclusive when effectSize below minimum", () => {
			const claim = createTestClaim({
				direction: "less",
				minEffectSize: 0.8,
			});

			const primaryAgg = createMockAggregate("primary-sut", "primary", undefined, {
				"execution-time": createMockSummaryStats([80, 85, 90]),
			});

			const baselineAgg = createMockAggregate("baseline-sut", "baseline", undefined, {
				"execution-time": createMockSummaryStats([120, 125, 130]),
			});

			primaryAgg.comparisons = {
				"baseline-sut": {
					deltas: { "execution-time": -40 },
					ratios: { "execution-time": 0.68 },
					pValue: 0.01,
					effectSize: 0.5, // Below minimum
				},
			};

			const result = evaluateClaim(claim, [primaryAgg, baselineAgg]);

			assert.equal(result.status, "inconclusive");
		});
	});

	describe("scope filtering - byClass with caseClass constraints", () => {
		it("should filter aggregates to matching caseClass", () => {
			const claim = createTestClaim({
				sut: "primary-sut",
				baseline: "baseline-sut",
				scope: "caseClass",
				scopeConstraints: {
					caseClass: "scale-free",
				},
			});

			const aggregates = [
				createMockAggregate("primary-sut", "primary", "scale-free", {
					"execution-time": createMockSummaryStats([80, 85, 90]),
				}),
				createMockAggregate("primary-sut", "primary", "small-world", {
					"execution-time": createMockSummaryStats([200, 210, 220]),
				}),
				createMockAggregate("baseline-sut", "baseline", "scale-free", {
					"execution-time": createMockSummaryStats([120, 125, 130]),
				}),
				createMockAggregate("baseline-sut", "baseline", "small-world", {
					"execution-time": createMockSummaryStats([250, 260, 270]),
				}),
			];

			const result = evaluateClaim(claim, aggregates);

			assert.equal(result.status, "satisfied");
			assert.equal(result.evidence.primaryValue, 85); // From scale-free aggregate
			assert.equal(result.evidence.baselineValue, 125); // From scale-free aggregate
		});

		it("should be inconclusive when caseClass not found for primary", () => {
			const claim = createTestClaim({
				sut: "primary-sut",
				baseline: "baseline-sut",
				scope: "caseClass",
				scopeConstraints: {
					caseClass: "missing-class",
				},
			});

			const aggregates = [
				createMockAggregate("primary-sut", "primary", "scale-free", {
					"execution-time": createMockSummaryStats([80, 85, 90]),
				}),
				createMockAggregate("baseline-sut", "baseline", "scale-free", {
					"execution-time": createMockSummaryStats([120, 125, 130]),
				}),
			];

			const result = evaluateClaim(claim, aggregates);

			assert.equal(result.status, "inconclusive");
			assert.ok(result.inconclusiveReason?.includes("Primary SUT not found"));
		});

		it("should handle multiple caseClass values", () => {
			const claim = createTestClaim({
				sut: "primary-sut",
				baseline: "baseline-sut",
				scope: "caseClass",
				scopeConstraints: {
					caseClass: ["scale-free", "random"],
				},
			});

			const aggregates = [
				createMockAggregate("primary-sut", "primary", "scale-free", {
					"execution-time": createMockSummaryStats([80, 85, 90]),
				}),
				createMockAggregate("primary-sut", "primary", "random", {
					"execution-time": createMockSummaryStats([70, 75, 80]),
				}),
				createMockAggregate("baseline-sut", "baseline", "scale-free", {
					"execution-time": createMockSummaryStats([120, 125, 130]),
				}),
				createMockAggregate("baseline-sut", "baseline", "random", {
					"execution-time": createMockSummaryStats([110, 115, 120]),
				}),
				createMockAggregate("primary-sut", "primary", "small-world", {
					"execution-time": createMockSummaryStats([200, 210, 220]),
				}),
			];

			const result = evaluateClaim(claim, aggregates);

			// Should find scale-free aggregates (first match)
			assert.equal(result.status, "satisfied");
			assert.equal(result.evidence.primaryValue, 85);
			assert.equal(result.evidence.baselineValue, 125);
		});

		it("should not filter when no scopeConstraints", () => {
			const claim = createTestClaim({
				sut: "primary-sut",
				baseline: "baseline-sut",
				scope: "global",
			});

			const aggregates = [
				createMockAggregate("primary-sut", "primary", "scale-free", {
					"execution-time": createMockSummaryStats([80, 85, 90]),
				}),
				createMockAggregate("baseline-sut", "baseline", "scale-free", {
					"execution-time": createMockSummaryStats([120, 125, 130]),
				}),
			];

			const result = evaluateClaim(claim, aggregates);

			assert.equal(result.status, "satisfied");
		});
	});

	describe("edge cases", () => {
		it("should handle NaN values in evidence", () => {
			const claim = createTestClaim();

			const primaryAgg = createMockAggregate("primary-sut", "primary", undefined, {});
			const baselineAgg = createMockAggregate("baseline-sut", "baseline", undefined, {});

			// Add metric with NaN mean
			primaryAgg.metrics["test-metric"] = createMockSummaryStats([]);
			baselineAgg.metrics["test-metric"] = createMockSummaryStats([]);

			claim.metric = "test-metric";

			const result = evaluateClaim(claim, [primaryAgg, baselineAgg]);

			assert.ok(Number.isNaN(result.evidence.primaryValue));
			assert.ok(Number.isNaN(result.evidence.baselineValue));
			assert.ok(Number.isNaN(result.evidence.delta));
			assert.ok(Number.isNaN(result.evidence.ratio));
		});

		it("should handle identical primary and baseline values", () => {
			const claim = createTestClaim({
				direction: "greater",
			});

			const aggregates = [
				createMockAggregate("primary-sut", "primary", undefined, {
					"execution-time": createMockSummaryStats([100, 100, 100]),
				}),
				createMockAggregate("baseline-sut", "baseline", undefined, {
					"execution-time": createMockSummaryStats([100, 100, 100]),
				}),
			];

			const result = evaluateClaim(claim, aggregates);

			assert.equal(result.status, "violated");
			assert.equal(result.evidence.delta, 0);
		});

		it("should handle boundary case for greater with exact threshold", () => {
			const claim = createTestClaim({
				sut: "primary-sut",
				baseline: "baseline-sut",
				metric: "accuracy",
				direction: "greater",
				threshold: 0.17,
			});

			const aggregates = [
				createMockAggregate("primary-sut", "primary", undefined, {
					accuracy: createMockSummaryStats([0.9, 0.92, 0.95]),
				}),
				createMockAggregate("baseline-sut", "baseline", undefined, {
					accuracy: createMockSummaryStats([0.7, 0.75, 0.8]),
				}),
			];

			const result = evaluateClaim(claim, aggregates);

			assert.equal(result.status, "satisfied");
			assert.ok(result.evidence.delta >= 0.17);
		});
	});

	describe("scope filtering - unknown constraint keys", () => {
		it("should ignore unknown constraint keys", () => {
			const claim = createTestClaim({
				sut: "primary-sut",
				baseline: "baseline-sut",
				scope: "caseClass",
				scopeConstraints: {
					unknownKey: "some-value",
				},
			});

			const aggregates = [
				createMockAggregate("primary-sut", "primary", "scale-free", {
					"execution-time": createMockSummaryStats([80, 85, 90]),
				}),
				createMockAggregate("baseline-sut", "baseline", "scale-free", {
					"execution-time": createMockSummaryStats([120, 125, 130]),
				}),
			];

			const result = evaluateClaim(claim, aggregates);

			assert.equal(result.status, "satisfied");
		});
	});
});

describe("evaluateClaims", () => {
	it("should evaluate multiple claims", () => {
		const claims = [
			createTestClaim({
				claimId: "C001",
				sut: "fast-sut",
				baseline: "slow-sut",
				direction: "less",
			}),
			createTestClaim({
				claimId: "C002",
				sut: "high-quality",
				baseline: "low-quality",
				metric: "accuracy",
				direction: "greater",
			}),
		];

		const aggregates = [
			createMockAggregate("fast-sut", "primary", undefined, {
				"execution-time": createMockSummaryStats([80, 85, 90]),
			}),
			createMockAggregate("slow-sut", "baseline", undefined, {
				"execution-time": createMockSummaryStats([120, 125, 130]),
			}),
			createMockAggregate("high-quality", "primary", undefined, {
				accuracy: createMockSummaryStats([0.9, 0.92, 0.95]),
			}),
			createMockAggregate("low-quality", "baseline", undefined, {
				accuracy: createMockSummaryStats([0.7, 0.75, 0.8]),
			}),
		];

		const results = evaluateClaims(claims, aggregates);

		assert.equal(results.length, 2);
		assert.equal(results[0].claim.claimId, "C001");
		assert.equal(results[0].status, "satisfied");
		assert.equal(results[1].claim.claimId, "C002");
		assert.equal(results[1].status, "satisfied");
	});
});

describe("createClaimSummary", () => {
	it("should create summary with correct counts", () => {
		const evaluations = [
			{
				claim: createTestClaim({ claimId: "C001" }),
				status: "satisfied" as const,
				evidence: {
					primaryValue: 100,
					baselineValue: 120,
					delta: -20,
					ratio: 0.83,
				},
			},
			{
				claim: createTestClaim({ claimId: "C002" }),
				status: "violated" as const,
				evidence: {
					primaryValue: 150,
					baselineValue: 100,
					delta: 50,
					ratio: 1.5,
				},
			},
			{
				claim: createTestClaim({ claimId: "C003" }),
				status: "inconclusive" as const,
				evidence: {
					primaryValue: Number.NaN,
					baselineValue: Number.NaN,
					delta: Number.NaN,
					ratio: Number.NaN,
				},
				inconclusiveReason: "Missing data",
			},
		];

		const summary = createClaimSummary(evaluations);

		assert.equal(summary.version, "1.0.0");
		assert.equal(summary.summary.total, 3);
		assert.equal(summary.summary.satisfied, 1);
		assert.equal(summary.summary.violated, 1);
		assert.equal(summary.summary.inconclusive, 1);
		assert.equal(summary.summary.satisfactionRate, 0.5); // 1 / (1 + 1)
		assert.ok(summary.timestamp);
	});

	it("should handle empty evaluations array", () => {
		const summary = createClaimSummary([]);

		assert.equal(summary.summary.total, 0);
		assert.equal(summary.summary.satisfied, 0);
		assert.equal(summary.summary.violated, 0);
		assert.equal(summary.summary.inconclusive, 0);
		assert.equal(summary.summary.satisfactionRate, 0);
	});

	it("should handle all inconclusive evaluations", () => {
		const evaluations = [
			{
				claim: createTestClaim({ claimId: "C001" }),
				status: "inconclusive" as const,
				evidence: {
					primaryValue: Number.NaN,
					baselineValue: Number.NaN,
					delta: Number.NaN,
					ratio: Number.NaN,
				},
				inconclusiveReason: "Missing data",
			},
			{
				claim: createTestClaim({ claimId: "C002" }),
				status: "inconclusive" as const,
				evidence: {
					primaryValue: Number.NaN,
					baselineValue: Number.NaN,
					delta: Number.NaN,
					ratio: Number.NaN,
				},
				inconclusiveReason: "Missing metric",
			},
		];

		const summary = createClaimSummary(evaluations);

		assert.equal(summary.summary.total, 2);
		assert.equal(summary.summary.satisfied, 0);
		assert.equal(summary.summary.violated, 0);
		assert.equal(summary.summary.inconclusive, 2);
		assert.equal(summary.summary.satisfactionRate, 0); // No definitive results
	});
});
