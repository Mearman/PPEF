/**
 * Unit tests for Mann-Whitney U test and related statistical functions.
 *
 * Tests the non-parametric statistical test for comparing two independent samples.
 */

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import { normalCDF, mannWhitneyUTest, cohensD, confidenceInterval } from "../mann-whitney-u.js";

describe("normalCDF", () => {
	it("should return 0.5 for z = 0", () => {
		const result = normalCDF(0);
		assert.ok(Math.abs(result - 0.5) < 0.001);
	});

	it("should approach 1 for large positive z", () => {
		const result = normalCDF(5);
		assert.ok(result > 0.99);
	});

	it("should approach 0 for large negative z", () => {
		const result = normalCDF(-5);
		assert.ok(result < 0.01);
	});

	it("should be symmetric around 0", () => {
		const z = 1.5;
		const positive = normalCDF(z);
		const negative = normalCDF(-z);
		assert.ok(Math.abs(positive + negative - 1) < 0.001);
	});

	it("should handle negative z values", () => {
		const result = normalCDF(-1);
		assert.ok(result < 0.5);
		assert.ok(result > 0.1);
	});
});

describe("mannWhitneyUTest", () => {
	it("should calculate U statistic for distinct samples", () => {
		const sampleA = [1, 2, 3];
		const sampleB = [4, 5, 6];

		const result = mannWhitneyUTest(sampleA, sampleB);

		assert.ok(typeof result.u === "number");
		assert.ok(result.u >= 0);
		assert.ok(typeof result.pValue === "number");
		assert.ok(typeof result.significant === "boolean");
	});

	it("should detect significant difference between distinct samples", () => {
		const sampleA = [1, 1, 1, 1, 1];
		const sampleB = [100, 100, 100, 100, 100];

		const result = mannWhitneyUTest(sampleA, sampleB);

		assert.ok(result.pValue < 0.05);
		assert.strictEqual(result.significant, true);
	});

	it("should not detect difference in similar samples", () => {
		const sampleA = [5, 5, 5, 5, 5];
		const sampleB = [5, 5, 5, 5, 5];

		const result = mannWhitneyUTest(sampleA, sampleB);

		// When samples are identical, p-value should be 1
		assert.ok(result.pValue >= 0.95);
		assert.strictEqual(result.significant, false);
	});

	it("should handle overlapping samples", () => {
		const sampleA = [1, 2, 3, 4, 5];
		const sampleB = [3, 4, 5, 6, 7];

		const result = mannWhitneyUTest(sampleA, sampleB);

		assert.ok(result.pValue >= 0 && result.pValue <= 1);
		assert.ok(typeof result.significant === "boolean");
	});

	it("should handle samples with ties", () => {
		const sampleA = [1, 2, 2, 3];
		const sampleB = [2, 3, 4, 5];

		const result = mannWhitneyUTest(sampleA, sampleB);

		assert.ok(typeof result.u === "number");
		assert.ok(result.pValue >= 0 && result.pValue <= 1);
	});

	it("should handle single-element samples", () => {
		const sampleA = [5];
		const sampleB = [10];

		const result = mannWhitneyUTest(sampleA, sampleB);

		assert.ok(typeof result.u === "number");
		assert.ok(typeof result.pValue === "number");
	});

	it("should handle empty sample A", () => {
		const sampleA: number[] = [];
		const sampleB = [1, 2, 3];

		const result = mannWhitneyUTest(sampleA, sampleB);

		assert.strictEqual(result.u, 0);
	});

	it("should handle empty sample B", () => {
		const sampleA = [1, 2, 3];
		const sampleB: number[] = [];

		const result = mannWhitneyUTest(sampleA, sampleB);

		assert.strictEqual(result.u, 0);
	});
});

describe("cohensD", () => {
	it("should calculate effect size for distinct samples", () => {
		const sampleA = [1, 2, 3, 4, 5];
		const sampleB = [6, 7, 8, 9, 10];

		const result = cohensD(sampleA, sampleB);

		assert.ok(result > 0);
		assert.ok(typeof result === "number");
	});

	it("should be zero for identical samples", () => {
		const sampleA = [5, 5, 5, 5, 5];
		const sampleB = [5, 5, 5, 5, 5];

		const result = cohensD(sampleA, sampleB);

		assert.strictEqual(result, 0);
	});

	it("should be symmetric", () => {
		const sampleA = [1, 2, 3, 4, 5];
		const sampleB = [10, 20, 30, 40, 50];

		const d1 = cohensD(sampleA, sampleB);
		const d2 = cohensD(sampleB, sampleA);

		assert.ok(Math.abs(d1 - d2) < 0.001);
	});

	it("should handle large effect sizes", () => {
		const sampleA = [1, 2, 1, 2, 1]; // Mean ~1.4, small variance
		const sampleB = [100, 101, 100, 101, 100]; // Mean ~100.4, small variance

		const result = cohensD(sampleA, sampleB);

		assert.ok(result > 0.8); // Large effect due to separation of means
	});

	it("should handle small effect sizes", () => {
		const sampleA = [10, 11, 12, 13, 14];
		const sampleB = [12, 13, 14, 15, 16];

		const result = cohensD(sampleA, sampleB);

		assert.ok(result >= 0);
		assert.ok(result < 2); // Should be reasonable
	});

	it("should handle samples with variance", () => {
		const sampleA = [1, 2, 3, 4, 5];
		const sampleB = [3, 4, 5, 6, 7];

		const result = cohensD(sampleA, sampleB);

		assert.ok(result >= 0);
	});

	it("should handle samples with same mean but different variance", () => {
		const sampleA = [0, 10, 0, 10, 0, 10];
		const sampleB = [4, 6, 4, 6, 4, 6];

		// Both have mean 5
		const meanA = sampleA.reduce((a, b) => a + b, 0) / sampleA.length;
		const meanB = sampleB.reduce((a, b) => a + b, 0) / sampleB.length;

		const result = cohensD(sampleA, sampleB);

		assert.strictEqual(meanA, 5);
		assert.strictEqual(meanB, 5);
		assert.strictEqual(result, 0);
	});
});

describe("confidenceInterval", () => {
	it("should calculate interval for sample values", () => {
		const values = [1, 2, 3, 4, 5];

		const result = confidenceInterval(values);

		assert.ok(typeof result.lower === "number");
		assert.ok(typeof result.upper === "number");
		assert.ok(result.lower < result.upper);
	});

	it("should be centered around mean", () => {
		const values = [10, 20, 30, 40, 50];
		const mean = values.reduce((a, b) => a + b, 0) / values.length;

		const result = confidenceInterval(values);

		const midpoint = (result.lower + result.upper) / 2;
		assert.ok(Math.abs(midpoint - mean) < 0.1);
	});

	it("should handle identical values", () => {
		const values = [5, 5, 5, 5, 5];

		const result = confidenceInterval(values);

		// With no variance, lower and upper should be same
		assert.ok(Math.abs(result.lower - 5) < 0.01);
		assert.ok(Math.abs(result.upper - 5) < 0.01);
	});

	it("should handle two values", () => {
		const values = [0, 10];

		const result = confidenceInterval(values);

		assert.ok(result.lower < result.upper);
		assert.ok(result.lower < 5);
		assert.ok(result.upper > 5);
	});

	it("should have reasonable interval width for low variance", () => {
		const values = [50, 51, 50, 51, 50, 51];
		const mean = values.reduce((a, b) => a + b, 0) / values.length;

		const result = confidenceInterval(values);

		// Low variance should give narrow interval
		const width = result.upper - result.lower;
		assert.ok(width < 2); // Should be narrow
		assert.ok(result.lower <= mean);
		assert.ok(result.upper >= mean);
	});
});
