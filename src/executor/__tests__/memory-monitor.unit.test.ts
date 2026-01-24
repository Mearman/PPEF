/**
 * Unit tests for MemoryMonitor
 *
 * Tests memory tracking, warning levels, and global helpers.
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
	MemoryMonitor,
	MemoryWarningLevel,
	type MemoryStats,
	DEFAULT_MEMORY_CONFIG,
	getGlobalMemoryMonitor,
	checkMemoryUsage,
	getMemoryStats,
} from "../memory-monitor.js";

describe("MemoryMonitor", () => {
	let monitor: MemoryMonitor;

	beforeEach(() => {
		monitor = new MemoryMonitor();
	});

	describe("constructor", () => {
		it("should use default config when none provided", () => {
			assert.ok(monitor instanceof MemoryMonitor);
		});

		it("should merge partial config with defaults", () => {
			const customMonitor = new MemoryMonitor({
				warningThresholdMb: 500,
			});

			assert.ok(customMonitor instanceof MemoryMonitor);
		});
	});

	describe("check", () => {
		it("should return a warning level", () => {
			const level = monitor.check();

			assert.ok(Object.values(MemoryWarningLevel).includes(level));
		});

		it("should return NORMAL when memory is low", () => {
			// Use very high thresholds to ensure NORMAL
			const lowMemMonitor = new MemoryMonitor({
				warningThresholdMb: 1_000_000,
				criticalThresholdMb: 2_000_000,
				emergencyThresholdMb: 3_000_000,
			});

			assert.strictEqual(lowMemMonitor.check(), MemoryWarningLevel.NORMAL);
		});
	});

	describe("getStats", () => {
		it("should return memory stats", () => {
			const stats = monitor.getStats();

			assert.ok(typeof stats.rssBytes === "number");
			assert.ok(typeof stats.heapTotalBytes === "number");
			assert.ok(typeof stats.heapUsedBytes === "number");
			assert.ok(typeof stats.externalBytes === "number");
			assert.ok(typeof stats.arrayBuffersBytes === "number");
			assert.ok(typeof stats.rssMb === "number");
			assert.ok(typeof stats.heapUsagePercent === "number");
			assert.ok(typeof stats.timestamp === "number");
		});

		it("should have positive values", () => {
			const stats = monitor.getStats();

			assert.ok(stats.rssBytes > 0);
			assert.ok(stats.heapTotalBytes > 0);
			assert.ok(stats.heapUsedBytes >= 0);
			assert.ok(stats.rssMb > 0);
		});

		it("should have heap usage percent between 0 and 100", () => {
			const stats = monitor.getStats();

			assert.ok(stats.heapUsagePercent >= 0);
			assert.ok(stats.heapUsagePercent <= 100);
		});
	});

	describe("getWarningLevel", () => {
		it("should return current warning level", () => {
			const level = monitor.getWarningLevel();

			assert.ok(Object.values(MemoryWarningLevel).includes(level));
		});

		it("should return WARNING when stats exceed warning threshold", () => {
			const testMonitor = new MemoryMonitor({
				warningThresholdMb: 10,
				criticalThresholdMb: 100,
				emergencyThresholdMb: 1000,
			});
			const stats: MemoryStats = {
				rssBytes: 15 * 1024 * 1024,
				heapTotalBytes: 20 * 1024 * 1024,
				heapUsedBytes: 10 * 1024 * 1024,
				externalBytes: 0,
				arrayBuffersBytes: 0,
				rssMb: 15,
				heapUsagePercent: 50,
				timestamp: Date.now(),
			};

			assert.strictEqual(testMonitor.getWarningLevel(stats), MemoryWarningLevel.WARNING);
		});

		it("should return CRITICAL when stats exceed critical threshold", () => {
			const testMonitor = new MemoryMonitor({
				warningThresholdMb: 10,
				criticalThresholdMb: 50,
				emergencyThresholdMb: 1000,
			});
			const stats: MemoryStats = {
				rssBytes: 60 * 1024 * 1024,
				heapTotalBytes: 80 * 1024 * 1024,
				heapUsedBytes: 40 * 1024 * 1024,
				externalBytes: 0,
				arrayBuffersBytes: 0,
				rssMb: 60,
				heapUsagePercent: 50,
				timestamp: Date.now(),
			};

			assert.strictEqual(testMonitor.getWarningLevel(stats), MemoryWarningLevel.CRITICAL);
		});

		it("should return EMERGENCY when stats exceed emergency threshold", () => {
			const testMonitor = new MemoryMonitor({
				warningThresholdMb: 10,
				criticalThresholdMb: 50,
				emergencyThresholdMb: 100,
			});
			const stats: MemoryStats = {
				rssBytes: 150 * 1024 * 1024,
				heapTotalBytes: 200 * 1024 * 1024,
				heapUsedBytes: 100 * 1024 * 1024,
				externalBytes: 0,
				arrayBuffersBytes: 0,
				rssMb: 150,
				heapUsagePercent: 50,
				timestamp: Date.now(),
			};

			assert.strictEqual(testMonitor.getWarningLevel(stats), MemoryWarningLevel.EMERGENCY);
		});

		it("should return NORMAL when stats below all thresholds", () => {
			const testMonitor = new MemoryMonitor({
				warningThresholdMb: 100,
				criticalThresholdMb: 200,
				emergencyThresholdMb: 300,
			});
			const stats: MemoryStats = {
				rssBytes: 10 * 1024 * 1024,
				heapTotalBytes: 20 * 1024 * 1024,
				heapUsedBytes: 5 * 1024 * 1024,
				externalBytes: 0,
				arrayBuffersBytes: 0,
				rssMb: 10,
				heapUsagePercent: 25,
				timestamp: Date.now(),
			};

			assert.strictEqual(testMonitor.getWarningLevel(stats), MemoryWarningLevel.NORMAL);
		});

		it("should use default stats when none provided", () => {
			const level = monitor.getWarningLevel();
			assert.ok(Object.values(MemoryWarningLevel).includes(level));
		});
	});

	describe("check with callback", () => {
		it("should trigger callback when warning level changes", () => {
			const calls: { level: MemoryWarningLevel; stats: MemoryStats }[] = [];
			const testMonitor = new MemoryMonitor({
				warningThresholdMb: 1,
				criticalThresholdMb: 2,
				emergencyThresholdMb: 3,
				onWarningLevelChange(level, stats) {
					calls.push({ level, stats });
				},
			});

			// First check should trigger callback from NORMAL to WARNING
			testMonitor.check();

			assert.ok(calls.length > 0);
			assert.ok(calls.some((c) => c.level === MemoryWarningLevel.WARNING));
		});

		it("should not trigger callback when level unchanged", () => {
			let callCount = 0;
			const testMonitor = new MemoryMonitor({
				warningThresholdMb: 100_000,
				onWarningLevelChange() {
					callCount++;
				},
			});

			// Multiple checks with same memory level
			testMonitor.check();
			testMonitor.check();
			testMonitor.check();

			// Should only call once (initial NORMAL → NORMAL transition)
			assert.strictEqual(callCount, 1);
		});
	});

	describe("verbose logging", () => {
		it("should log warnings when verbose is true", () => {
			const testMonitor = new MemoryMonitor({
				warningThresholdMb: 1,
				verbose: true,
			});

			// Should not throw when verbose logging triggers
			assert.doesNotThrow(() => {
				testMonitor.check();
			});
		});
	});

	describe("snapshot", () => {
		it("should return memory stats", () => {
			const snapshot = monitor.snapshot();

			assert.ok(typeof snapshot.rssBytes === "number");
			assert.ok(typeof snapshot.heapUsedBytes === "number");
		});
	});

	describe("format", () => {
		it("should format stats as string", () => {
			const formatted = monitor.format();

			assert.ok(typeof formatted === "string");
			assert.ok(formatted.includes("RSS:"));
			assert.ok(formatted.includes("Heap:"));
		});

		it("should format provided stats", () => {
			const stats: MemoryStats = {
				rssBytes: 100_000_000,
				heapTotalBytes: 50_000_000,
				heapUsedBytes: 25_000_000,
				externalBytes: 0,
				arrayBuffersBytes: 0,
				rssMb: 100,
				heapUsagePercent: 50,
				timestamp: Date.now(),
			};

			const formatted = monitor.format(stats);

			assert.ok(formatted.includes("100.0MB"));
		});
	});
});

describe("DEFAULT_MEMORY_CONFIG", () => {
	it("should have default thresholds", () => {
		assert.ok(typeof DEFAULT_MEMORY_CONFIG.warningThresholdMb === "number");
		assert.ok(typeof DEFAULT_MEMORY_CONFIG.criticalThresholdMb === "number");
		assert.ok(typeof DEFAULT_MEMORY_CONFIG.emergencyThresholdMb === "number");
		assert.strictEqual(DEFAULT_MEMORY_CONFIG.verbose, false);
	});
});

describe("getGlobalMemoryMonitor", () => {
	it("should create and return a singleton monitor", () => {
		const monitor1 = getGlobalMemoryMonitor();
		const monitor2 = getGlobalMemoryMonitor();

		assert.ok(monitor1 instanceof MemoryMonitor);
		assert.strictEqual(monitor1, monitor2); // Same instance
	});

	it("should accept custom config on first call", () => {
		// Clear global state by creating a new monitor with specific config
		const customMonitor = getGlobalMemoryMonitor({
			warningThresholdMb: 500,
		});

		assert.ok(customMonitor instanceof MemoryMonitor);
	});

	it("should ignore config on subsequent calls", () => {
		const monitor1 = getGlobalMemoryMonitor({ warningThresholdMb: 500 });
		const monitor2 = getGlobalMemoryMonitor({ warningThresholdMb: 1000 });

		assert.strictEqual(monitor1, monitor2);
	});
});

describe("checkMemoryUsage", () => {
	it("should return warning level using global monitor", () => {
		const level = checkMemoryUsage();

		assert.ok(Object.values(MemoryWarningLevel).includes(level));
	});

	it("should return same level as global monitor check", () => {
		const globalMonitor = getGlobalMemoryMonitor();

		assert.strictEqual(checkMemoryUsage(), globalMonitor.check());
	});
});

describe("getMemoryStats", () => {
	it("should return stats using global monitor", () => {
		const stats = getMemoryStats();

		assert.ok(typeof stats.rssBytes === "number");
		assert.ok(typeof stats.heapUsedBytes === "number");
		assert.ok(typeof stats.rssMb === "number");
	});

	it("should return same stats as global monitor getStats", () => {
		const globalMonitor = getGlobalMemoryMonitor();

		const stats1 = getMemoryStats();
		const stats2 = globalMonitor.getStats();

		// Timestamp may differ, check other fields
		assert.strictEqual(stats1.rssBytes, stats2.rssBytes);
		assert.strictEqual(stats1.heapUsedBytes, stats2.heapUsedBytes);
	});
});
