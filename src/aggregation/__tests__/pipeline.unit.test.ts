/**
 * Unit tests for aggregation pipeline
 *
 * Tests aggregateResults and createAggregationOutput functions.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { aggregateResults, createAggregationOutput } from "../pipeline.js";
import { createMockResults, createMockResultsWithMetrics } from "../../__tests__/test-helpers.js";
import type { AggregatedResult } from "../../types/aggregate.js";

describe("aggregateResults", () => {
	it("should return empty array when no results provided", () => {
		const result = aggregateResults([]);
		assert.deepStrictEqual(result, []);
	});

	it("should aggregate results without comparisons when computeComparisons is false", () => {
		const results = createMockResults(5, "test-sut", "primary");

		const aggregated = aggregateResults(results, { computeComparisons: false });

		// Should have aggregates but no comparisons
		assert.ok(aggregated.length > 0);
		assert.strictEqual(aggregated[0].comparisons, undefined);
	});

	it("should not add comparisons when no baseline SUTs exist", () => {
		const results = createMockResults(5, "primary-sut", "primary");

		const aggregated = aggregateResults(results);

		// Should not have comparisons since no baseline SUTs present
		assert.strictEqual(aggregated[0].comparisons, undefined);
	});

	it("should not add comparisons when no primary SUT can be determined", () => {
		const results = [
			...createMockResults(3, "baseline-1", "baseline"),
			...createMockResults(3, "baseline-2", "baseline"),
		];

		const aggregated = aggregateResults(results);

		// Should not have comparisons since no primary SUT
		for (const agg of aggregated) {
			assert.strictEqual(agg.comparisons, undefined);
		}
	});

	it("should use provided primary SUT from options", () => {
		const results = [
			...createMockResults(3, "custom-primary", "baseline"),
			...createMockResults(3, "baseline", "baseline"),
		];

		const aggregated = aggregateResults(results, { primarySut: "custom-primary" });

		// Should add comparisons using the specified primary
		const primaryAgg = aggregated.find((a) => a.sut === "custom-primary");
		assert.ok(primaryAgg);
		assert.ok(primaryAgg.comparisons);
	});

	it("should use provided baseline SUTs from options", () => {
		const results = [
			...createMockResults(3, "primary", "primary"),
			...createMockResults(3, "custom-baseline", "baseline"),
		];

		const aggregated = aggregateResults(results, { baselineSuts: ["custom-baseline"] });

		// Should add comparisons using the specified baseline
		const primaryAgg = aggregated.find((a) => a.sut === "primary");
		assert.ok(primaryAgg);
		assert.ok(primaryAgg.comparisons);
		assert.ok("custom-baseline" in primaryAgg.comparisons);
	});

	it("should add comparisons when primary and baseline SUTs exist", () => {
		const results = [
			...createMockResults(3, "primary-sut", "primary"),
			...createMockResults(3, "baseline-sut", "baseline"),
		];

		const aggregated = aggregateResults(results);

		// Should have comparisons
		const primaryAgg = aggregated.find((a) => a.sut === "primary-sut");
		assert.ok(primaryAgg);
		assert.ok(primaryAgg.comparisons);
		assert.ok("baseline-sut" in primaryAgg.comparisons);
	});

	it("should compute comparison deltas and ratios", () => {
		const results = [
			...createMockResultsWithMetrics([100, 110, 90], "primary", "primary"),
			...createMockResultsWithMetrics([80, 85, 75], "baseline", "baseline"),
		];

		const aggregated = aggregateResults(results);
		const primaryAgg = aggregated.find((a) => a.sut === "primary");

		assert.ok(primaryAgg);
		assert.ok(primaryAgg.comparisons);

		const comparison = primaryAgg.comparisons.baseline;
		assert.ok(comparison);

		// The metrics key includes the metric name
		assert.ok(Object.keys(comparison.deltas).length > 0);
		assert.ok(Object.keys(comparison.ratios).length > 0);
	});
});

describe("createAggregationOutput", () => {
	it("should create output with metadata", () => {
		const aggregates: AggregatedResult[] = [
			{
				sut: "test-sut",
				sutRole: "primary",
				group: { runCount: 1, caseCount: 1 },
				correctness: { validRate: 1, producedOutputRate: 1 },
				metrics: {},
			},
		];
		const results = createMockResults(1, "test-sut");

		const output = createAggregationOutput(aggregates, results);

		assert.strictEqual(output.version, "1.0.0");
		assert.ok(output.timestamp);
		assert.strictEqual(output.aggregates, aggregates);
		assert.ok(output.metadata);
		assert.strictEqual(output.metadata.totalRuns, 1);
		assert.strictEqual(output.metadata.totalCases, 1);
		assert.deepStrictEqual(output.metadata.sutsIncluded, ["test-sut"]);
	});

	it("should extract unique SUTs", () => {
		const aggregates: AggregatedResult[] = [
			{
				sut: "sut-1",
				sutRole: "primary",
				group: { runCount: 1, caseCount: 1 },
				correctness: { validRate: 1, producedOutputRate: 1 },
				metrics: {},
			},
			{
				sut: "sut-2",
				sutRole: "baseline",
				group: { runCount: 1, caseCount: 1 },
				correctness: { validRate: 1, producedOutputRate: 1 },
				metrics: {},
			},
			{
				sut: "sut-1",
				sutRole: "primary",
				group: { runCount: 1, caseCount: 1 },
				correctness: { validRate: 1, producedOutputRate: 1 },
				metrics: {},
			},
		];

		const output = createAggregationOutput(aggregates, []);

		assert.deepStrictEqual(output.metadata?.sutsIncluded, ["sut-1", "sut-2"]);
	});

	it("should extract unique case IDs from results", () => {
		const aggregates: AggregatedResult[] = [];
		const results = createMockResults(5, "sut", "primary");

		const output = createAggregationOutput(aggregates, results);

		// createMockResults creates unique case IDs for each result
		const totalCases = output.metadata?.totalCases;
		assert.ok(totalCases !== undefined);
		assert.ok(totalCases > 0);
	});

	it("should include case classes when present", () => {
		const aggregates: AggregatedResult[] = [
			{
				sut: "sut-1",
				sutRole: "primary",
				caseClass: "class-a",
				group: { runCount: 1, caseCount: 1 },
				correctness: { validRate: 1, producedOutputRate: 1 },
				metrics: {},
			},
			{
				sut: "sut-1",
				sutRole: "primary",
				caseClass: "class-b",
				group: { runCount: 1, caseCount: 1 },
				correctness: { validRate: 1, producedOutputRate: 1 },
				metrics: {},
			},
		];

		const output = createAggregationOutput(aggregates, []);

		assert.deepStrictEqual(output.metadata?.caseClassesIncluded, ["class-a", "class-b"]);
	});

	it("should exclude undefined case classes", () => {
		const aggregates: AggregatedResult[] = [
			{
				sut: "sut-1",
				sutRole: "primary",
				group: { runCount: 1, caseCount: 1 },
				correctness: { validRate: 1, producedOutputRate: 1 },
				metrics: {},
			},
			{
				sut: "sut-1",
				sutRole: "primary",
				caseClass: "class-b",
				group: { runCount: 1, caseCount: 1 },
				correctness: { validRate: 1, producedOutputRate: 1 },
				metrics: {},
			},
		];

		const output = createAggregationOutput(aggregates, []);

		assert.deepStrictEqual(output.metadata?.caseClassesIncluded, ["class-b"]);
	});

	it("should set caseClassesIncluded to undefined when none present", () => {
		const aggregates: AggregatedResult[] = [
			{
				sut: "sut-1",
				sutRole: "primary",
				group: { runCount: 1, caseCount: 1 },
				correctness: { validRate: 1, producedOutputRate: 1 },
				metrics: {},
			},
		];

		const output = createAggregationOutput(aggregates, []);

		assert.strictEqual(output.metadata?.caseClassesIncluded, undefined);
	});

	it("should handle empty aggregates and results", () => {
		const output = createAggregationOutput([], []);

		assert.strictEqual(output.version, "1.0.0");
		assert.strictEqual(output.aggregates.length, 0);
		assert.ok(output.metadata);
		assert.strictEqual(output.metadata.totalRuns, 0);
		assert.strictEqual(output.metadata.totalCases, 0);
		assert.deepStrictEqual(output.metadata.sutsIncluded, []);
	});
});
