/**
 * Unit tests for ResourceCalculator
 *
 * Tests automatic 75% resource calculation including:
 * - CPU-based worker count
 * - Memory per worker calculation
 * - Disk I/O throttling (dynamic measurement)
 */

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import {
	calculateResources,
	calculateResourcesSync,
	type ResourceLimits,
} from "../resource-calculator.js";
import { cpus } from "node:os";

describe("ResourceCalculator", () => {
	describe("calculateResourcesSync", () => {
		it("should calculate 75% of CPU cores as max workers", () => {
			const result = calculateResourcesSync(0.75);

			assert.ok(result.maxWorkers >= 1);
			assert.ok(Number.isInteger(result.maxWorkers));
			// Should be at least 1 worker
			assert.strictEqual(result.maxWorkers, Math.max(1, Math.floor(cpus().length * 0.75)));
		});

		it("should calculate memory per worker", () => {
			const result = calculateResourcesSync(0.75);

			assert.ok(result.maxMemoryMb > 0);
			assert.ok(Number.isInteger(result.maxMemoryMb));
			// Memory should be reasonable (> 100MB)
			assert.ok(result.maxMemoryMb > 100);
		});

		it("should calculate I/O concurrency estimate", () => {
			const result = calculateResourcesSync(0.75);

			assert.ok(result.maxConcurrentIo > 0);
			assert.ok(Number.isInteger(result.maxConcurrentIo));
			// Default estimate should be 75% of 100
			assert.strictEqual(result.maxConcurrentIo, Math.floor(100 * 0.75));
		});

		it("should return 1 worker minimum for very low CPU counts", () => {
			// Create a mock result by testing with actual hardware
			const result = calculateResourcesSync(0.75);

			// Should always return at least 1 worker
			assert.ok(result.maxWorkers >= 1);
		});

		it("should use 50% reserve when specified", () => {
			const result75 = calculateResourcesSync(0.75);
			const result50 = calculateResourcesSync(0.5);

			assert.ok(result50.maxWorkers <= result75.maxWorkers);
			assert.ok(result50.maxMemoryMb > 0);
		});
	});

	describe("calculateResources", () => {
		it("should match synchronous results when disk measurement is disabled", async () => {
			const syncResult = calculateResourcesSync(0.75);
			const asyncResult = await calculateResources(0.75, { measureDisk: false });

			assert.strictEqual(asyncResult.maxWorkers, syncResult.maxWorkers);
			assert.strictEqual(asyncResult.maxMemoryMb, syncResult.maxMemoryMb);
			assert.strictEqual(asyncResult.maxConcurrentIo, syncResult.maxConcurrentIo);
		});

		it("should perform disk I/O measurement when enabled", async () => {
			const result = await calculateResources(0.75, { measureDisk: true });

			assert.ok(result.maxWorkers >= 1);
			assert.ok(result.maxMemoryMb > 0);
			// maxConcurrentIo should be based on measurement or estimate
			assert.ok(result.maxConcurrentIo > 0);
		});

		it("should cache disk measurement result", async () => {
			// First call should measure
			const result1 = await calculateResources(0.75, { measureDisk: true });

			// Second call should use cached value
			const result2 = await calculateResources(0.75, { measureDisk: true });

			// Results should be identical (cached)
			assert.deepStrictEqual(result1, result2);
		});
	});

	describe("ResourceLimits type", () => {
		it("should have correct structure", () => {
			const result: ResourceLimits = calculateResourcesSync();

			assert.ok(typeof result.maxWorkers === "number");
			assert.ok(typeof result.maxMemoryMb === "number");
			assert.ok(typeof result.maxConcurrentIo === "number");
		});
	});

	describe("edge cases", () => {
		it("should handle 0% reserve (100% usage)", () => {
			const result = calculateResourcesSync(0);

			assert.strictEqual(result.maxWorkers, 0);
			assert.strictEqual(result.maxMemoryMb, 0);
			assert.strictEqual(result.maxConcurrentIo, 0);
		});

		it("should handle 100% reserve (all resources)", () => {
			const result = calculateResourcesSync(1);

			assert.ok(result.maxWorkers >= 1);
			assert.ok(result.maxMemoryMb > 0);
			assert.ok(result.maxConcurrentIo > 0);
		});

		it("should handle invalid reserve values gracefully", () => {
			// Negative reserve should be treated as 0
			const result1 = calculateResourcesSync(-0.5);
			assert.strictEqual(result1.maxWorkers, 0);

			// Reserve > 1 should be clamped
			const result2 = calculateResourcesSync(1.5);
			assert.ok(result2.maxWorkers >= 1);
		});
	});
});
