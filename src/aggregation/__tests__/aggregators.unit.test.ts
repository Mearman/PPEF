/**
 * Unit tests for Aggregation Functions
 *
 * Tests the pure functions for computing aggregated statistics.
 */

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import {
	computeSummaryStats,
	computeSpeedup,
	computeMaxSpeedup,
	computeComparison,
	computeRankings,
	getTValue,
} from "../aggregators.js";
import { createMockResult, createMockResults } from "../../__tests__/test-helpers.js";

describe("computeSummaryStats", () => {
	it("should return NaN values for empty array", () => {
		const result = computeSummaryStats([]);

		assert.strictEqual(result.n, 0);
		assert.ok(Number.isNaN(result.mean));
		assert.ok(Number.isNaN(result.median));
		assert.ok(Number.isNaN(result.min));
		assert.ok(Number.isNaN(result.max));
	});

	it("should compute basic statistics for single value", () => {
		const result = computeSummaryStats([42]);

		assert.strictEqual(result.n, 1);
		assert.strictEqual(result.mean, 42);
		assert.strictEqual(result.median, 42);
		assert.strictEqual(result.min, 42);
		assert.strictEqual(result.max, 42);
		assert.strictEqual(result.std, undefined);
		assert.strictEqual(result.confidence95, undefined);
	});

	it("should compute statistics for multiple values", () => {
		const result = computeSummaryStats([1, 2, 3, 4, 5]);

		assert.strictEqual(result.n, 5);
		assert.strictEqual(result.mean, 3);
		assert.strictEqual(result.median, 3);
		assert.strictEqual(result.min, 1);
		assert.strictEqual(result.max, 5);
		assert.ok(result.std !== undefined);
		assert.ok(result.std > 0);
	});

	it("should compute median for even-length arrays", () => {
		const result = computeSummaryStats([1, 2, 3, 4]);

		assert.strictEqual(result.median, 2.5); // (2 + 3) / 2
	});

	it("should compute 95% confidence interval", () => {
		const result = computeSummaryStats([10, 12, 14, 16, 18]);

		assert.ok(result.confidence95 !== undefined);
		assert.ok(result.confidence95[0] < result.mean);
		assert.ok(result.confidence95[1] > result.mean);
	});

	it("should compute percentiles", () => {
		const result = computeSummaryStats([1, 2, 3, 4, 5, 6, 7, 8]);

		assert.strictEqual(result.p25, 3); // Floor of 8 * 0.25 = 2, sorted[2] = 3
		assert.strictEqual(result.p75, 7); // Floor of 8 * 0.75 = 6, sorted[6] = 7
	});
});

describe("computeSpeedup", () => {
	it("should compute speedup ratio", () => {
		const result = computeSpeedup(100, 50);
		assert.strictEqual(result, 2); // 100 / 50 = 2x speedup
	});

	it("should return Infinity for zero treatment time", () => {
		const result = computeSpeedup(100, 0);
		assert.strictEqual(result, Infinity);
	});

	it("should handle slower treatment", () => {
		const result = computeSpeedup(50, 100);
		assert.strictEqual(result, 0.5); // 50 / 100 = 0.5x (slower)
	});
});

describe("computeMaxSpeedup", () => {
	it("should return 0 for empty pairs", () => {
		const result = computeMaxSpeedup([]);
		assert.strictEqual(result, 0);
	});

	it("should compute maximum speedup from pairs", () => {
		const pairs: [number, number][] = [
			[100, 50], // 2x
			[100, 25], // 4x
			[100, 100], // 1x
		];
		const result = computeMaxSpeedup(pairs);
		assert.strictEqual(result, 4); // Maximum is 4x
	});

	it("should handle pairs with zero treatment time", () => {
		const pairs: [number, number][] = [
			[100, 50],
			[100, 0], // Infinity
			[100, 25],
		];
		const result = computeMaxSpeedup(pairs);
		assert.strictEqual(result, Infinity);
	});

	it("should handle single pair", () => {
		const pairs: [number, number][] = [[100, 25]];
		const result = computeMaxSpeedup(pairs);
		assert.strictEqual(result, 4);
	});
});

describe("computeComparison", () => {
	it("should return default values when no common case IDs", () => {
		const primaryResults = [
			createMockResult({
				run: { runId: "p1", sut: "primary", sutRole: "primary", caseId: "primary-case-1" },
			}),
			createMockResult({
				run: { runId: "p2", sut: "primary", sutRole: "primary", caseId: "primary-case-2" },
			}),
		];

		const baselineResults = [
			createMockResult({
				run: { runId: "b1", sut: "baseline", sutRole: "baseline", caseId: "baseline-case-1" },
			}),
			createMockResult({
				run: { runId: "b2", sut: "baseline", sutRole: "baseline", caseId: "baseline-case-2" },
			}),
		];

		const result = computeComparison(primaryResults, baselineResults, "execution-time");

		assert.deepStrictEqual(result.deltas, { default: 0 });
		assert.deepStrictEqual(result.ratios, { default: 1 });
	});

	it("should compute delta and ratio for matching cases", () => {
		const primaryResults = [
			createMockResult({
				run: { runId: "p1", sut: "primary", sutRole: "primary", caseId: "case-1" },
				metrics: { numeric: { "execution-time": 80 } },
			}),
			createMockResult({
				run: { runId: "p2", sut: "primary", sutRole: "primary", caseId: "case-2" },
				metrics: { numeric: { "execution-time": 120 } },
			}),
		];

		const baselineResults = [
			createMockResult({
				run: { runId: "b1", sut: "baseline", sutRole: "baseline", caseId: "case-1" },
				metrics: { numeric: { "execution-time": 100 } },
			}),
			createMockResult({
				run: { runId: "b2", sut: "baseline", sutRole: "baseline", caseId: "case-2" },
				metrics: { numeric: { "execution-time": 100 } },
			}),
		];

		const result = computeComparison(primaryResults, baselineResults, "execution-time");

		// Primary mean = 100, baseline mean = 100
		assert.strictEqual(result.deltas.default, 0);
		assert.strictEqual(result.ratios.default, 1);
	});

	it("should compute better rate (wins)", () => {
		const primaryResults = [
			createMockResult({
				run: { runId: "p1", sut: "primary", sutRole: "primary", caseId: "case-1" },
				metrics: { numeric: { accuracy: 0.9 } },
			}),
			createMockResult({
				run: { runId: "p2", sut: "primary", sutRole: "primary", caseId: "case-2" },
				metrics: { numeric: { accuracy: 0.7 } },
			}),
			createMockResult({
				run: { runId: "p3", sut: "primary", sutRole: "primary", caseId: "case-3" },
				metrics: { numeric: { accuracy: 0.85 } },
			}),
		];

		const baselineResults = [
			createMockResult({
				run: { runId: "b1", sut: "baseline", sutRole: "baseline", caseId: "case-1" },
				metrics: { numeric: { accuracy: 0.8 } },
			}),
			createMockResult({
				run: { runId: "b2", sut: "baseline", sutRole: "baseline", caseId: "case-2" },
				metrics: { numeric: { accuracy: 0.8 } },
			}),
			createMockResult({
				run: { runId: "b3", sut: "baseline", sutRole: "baseline", caseId: "case-3" },
				metrics: { numeric: { accuracy: 0.8 } },
			}),
		];

		const result = computeComparison(primaryResults, baselineResults, "accuracy");

		// Primary wins: case-1 (0.9 > 0.8), loses case-2 (0.7 < 0.8), wins case-3 (0.85 > 0.8)
		// Win rate = 2/3 ≈ 0.667
		assert.ok(result.betterRate! > 0.6);
		assert.ok(result.betterRate! < 0.7);
	});

	it("should return infinite ratio when baseline mean is zero", () => {
		const primaryResults = [
			createMockResult({
				run: { runId: "p1", sut: "primary", sutRole: "primary", caseId: "case-1" },
				metrics: { numeric: { errors: 0 } },
			}),
		];

		const baselineResults = [
			createMockResult({
				run: { runId: "b1", sut: "baseline", sutRole: "baseline", caseId: "case-1" },
				metrics: { numeric: { errors: 0 } },
			}),
		];

		const result = computeComparison(primaryResults, baselineResults, "errors");

		// When both means are 0, ratio should be 0/0 which is handled specially
		// Actually looking at the code, if baselineStats.mean === 0, ratio = Infinity
		assert.strictEqual(result.ratios.default, Infinity);
	});

	it("should compute pValue using Mann-Whitney U test", () => {
		const primaryResults = [
			createMockResult({
				run: { runId: "p1", sut: "primary", sutRole: "primary", caseId: "case-1" },
				metrics: { numeric: { "execution-time": 100 } },
			}),
		];

		const baselineResults = [
			createMockResult({
				run: { runId: "b1", sut: "baseline", sutRole: "baseline", caseId: "case-1" },
				metrics: { numeric: { "execution-time": 100 } },
			}),
		];

		const result = computeComparison(primaryResults, baselineResults, "execution-time");

		assert.ok(typeof result.pValue === "number");
		assert.ok(typeof result.uStatistic === "number");
	});

	it("should compute effect size when both samples have variance", () => {
		const primaryResults = [
			createMockResult({
				run: { runId: "p1", sut: "primary", sutRole: "primary", caseId: "case-1" },
				metrics: { numeric: { "execution-time": 80 } },
			}),
			createMockResult({
				run: { runId: "p2", sut: "primary", sutRole: "primary", caseId: "case-2" },
				metrics: { numeric: { "execution-time": 120 } },
			}),
		];

		const baselineResults = [
			createMockResult({
				run: { runId: "b1", sut: "baseline", sutRole: "baseline", caseId: "case-1" },
				metrics: { numeric: { "execution-time": 95 } },
			}),
			createMockResult({
				run: { runId: "b2", sut: "baseline", sutRole: "baseline", caseId: "case-2" },
				metrics: { numeric: { "execution-time": 105 } },
			}),
		];

		const result = computeComparison(primaryResults, baselineResults, "execution-time");

		assert.ok(result.effectSize !== undefined);
		assert.ok(result.effectSize >= 0);
	});
});

describe("computeRankings", () => {
	it("should rank results by metric in descending order (default)", () => {
		const results = [
			createMockResult({
				run: { runId: "r1", sut: "sut-1", sutRole: "primary", caseId: "case-1" },
				metrics: { numeric: { score: 0.8 } },
			}),
			createMockResult({
				run: { runId: "r2", sut: "sut-2", sutRole: "primary", caseId: "case-1" },
				metrics: { numeric: { score: 0.95 } },
			}),
			createMockResult({
				run: { runId: "r3", sut: "sut-3", sutRole: "primary", caseId: "case-1" },
				metrics: { numeric: { score: 0.7 } },
			}),
		];

		const rankings = computeRankings(results, "score");

		assert.strictEqual(rankings.length, 3);
		assert.strictEqual(rankings[0].rank, 1);
		assert.strictEqual(rankings[0].result.run.runId, "r2"); // Highest score gets rank 1
		assert.strictEqual(rankings[2].rank, 3);
		assert.strictEqual(rankings[2].result.run.runId, "r3"); // Lowest score gets rank 3
	});

	it("should rank results in ascending order when specified", () => {
		const results = [
			createMockResult({
				run: { runId: "r1", sut: "sut-1", sutRole: "primary", caseId: "case-1" },
				metrics: { numeric: { "execution-time": 100 } },
			}),
			createMockResult({
				run: { runId: "r2", sut: "sut-2", sutRole: "primary", caseId: "case-1" },
				metrics: { numeric: { "execution-time": 50 } },
			}),
			createMockResult({
				run: { runId: "r3", sut: "sut-3", sutRole: "primary", caseId: "case-1" },
				metrics: { numeric: { "execution-time": 75 } },
			}),
		];

		const rankings = computeRankings(results, "execution-time", true);

		assert.strictEqual(rankings[0].rank, 1);
		assert.strictEqual(rankings[0].result.run.runId, "r2"); // Fastest (lowest time) gets rank 1
		assert.strictEqual(rankings[2].rank, 3);
		assert.strictEqual(rankings[2].result.run.runId, "r1"); // Slowest (highest time) gets rank 3
	});

	it("should filter out results with missing or NaN metric values", () => {
		const results = [
			createMockResult({
				run: { runId: "r1", sut: "sut-1", sutRole: "primary", caseId: "case-1" },
				metrics: { numeric: { score: 0.8 } },
			}),
			createMockResult({
				run: { runId: "r2", sut: "sut-2", sutRole: "primary", caseId: "case-1" },
				metrics: { numeric: {} }, // Missing metric
			}),
		];

		const rankings = computeRankings(results, "score");

		assert.strictEqual(rankings.length, 1); // Only r1 has the metric
		assert.strictEqual(rankings[0].result.run.runId, "r1");
	});

	it("should return empty array when no results have the metric", () => {
		const results = [
			createMockResult({
				run: { runId: "r1", sut: "sut-1", sutRole: "primary", caseId: "case-1" },
				metrics: { numeric: {} },
			}),
		];

		const rankings = computeRankings(results, "nonexistent");

		assert.deepStrictEqual(rankings, []);
	});

	it("should handle ties in metric values", () => {
		const results = [
			createMockResult({
				run: { runId: "r1", sut: "sut-1", sutRole: "primary", caseId: "case-1" },
				metrics: { numeric: { score: 0.9 } },
			}),
			createMockResult({
				run: { runId: "r2", sut: "sut-2", sutRole: "primary", caseId: "case-1" },
				metrics: { numeric: { score: 0.9 } },
			}),
		];

		const rankings = computeRankings(results, "score");

		assert.strictEqual(rankings.length, 2);
		// Both have rank 1 and 2 due to sort stability
		assert.ok(rankings.every((r) => r.value === 0.9));
	});
});

describe("getTValue", () => {
	it("should return t-value from lookup table for 95% CI", () => {
		const t10 = getTValue(10, 0.975);
		assert.strictEqual(t10, 2.228);

		const t30 = getTValue(30, 0.975);
		assert.strictEqual(t30, 2.042);

		const t100 = getTValue(100, 0.975);
		assert.strictEqual(t100, 1.984);
	});

	it("should return z-value fallback for non-standard probability", () => {
		const result = getTValue(50, 0.99);
		assert.strictEqual(result, 1.96); // z-value for large samples
	});

	it("should return z-value fallback for 90% CI", () => {
		const result = getTValue(50, 0.95); // 90% two-tailed = 0.95
		assert.strictEqual(result, 1.96);
	});

	it("should return z-value fallback for 99% CI", () => {
		const result = getTValue(50, 0.995); // 99% two-tailed = 0.995
		assert.strictEqual(result, 1.96);
	});
});
