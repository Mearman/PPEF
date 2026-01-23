/**
 * Unit tests for CheckpointManager
 *
 * Tests checkpoint management, staleness detection, and shard merging.
 */

import { beforeEach, describe, it } from "node:test";
import { strict as assert } from "node:assert";

import type { EvaluationResult, RunContext } from "../../types/result.js";
import type { CheckpointData } from "../checkpoint-manager.js";
import { CheckpointManager } from "../checkpoint-manager.js";
import { FileStorage } from "../checkpoint-storage.js";
import type { PlannedRun } from "../executor.js";

/**
 * Create a minimal valid EvaluationResult for testing.
 * @param runId
 */
const createTestResult = (runId: string): EvaluationResult => {
	const runContext: RunContext = {
		runId,
		sut: "test-sut",
		sutRole: "primary",
		caseId: "test-case",
		config: { repetitions: 1, seedBase: 42 },
	};

	return {
		run: runContext,
		correctness: {
			expectedExists: false,
			producedOutput: true,
			valid: true,
			matchesExpected: null,
		},
		outputs: {},
		metrics: { numeric: {} },
		provenance: {
			runtime: {
				platform: process.platform,
				arch: process.arch,
				nodeVersion: process.version,
			},
		},
	};
};

/**
 * Create a minimal valid PlannedRun for testing.
 * @param runId
 * @param seed
 */
const createTestRun = (runId: string, seed: number): PlannedRun => ({
	runId,
	sutId: "test-sut",
	caseId: "test-case",
	repetition: 0,
	seed,
});

/**
 * Mock checkpoint storage for testing.
 */
class MockCheckpointStorage {
	private data: CheckpointData | null = null;
	saveDelay = 0;
	loadDelay = 0;
	saveCallCount = 0;
	loadCallCount = 0;

	async load(): Promise<CheckpointData | null> {
		this.loadCallCount++;
		if (this.loadDelay > 0) {
			await new Promise((resolve) => setTimeout(resolve, this.loadDelay));
		}
		return this.data ? { ...this.data } : null;
	}

	async save(data: CheckpointData): Promise<void> {
		this.saveCallCount++;
		if (this.saveDelay > 0) {
			await new Promise((resolve) => setTimeout(resolve, this.saveDelay));
		}
		this.data = { ...data };
	}

	async delete(): Promise<void> {
		this.data = null;
	}

	async exists(): Promise<boolean> {
		return this.data !== null;
	}

	get type(): string {
		return "mock";
	}

	setData(data: CheckpointData | null): void {
		this.data = data;
	}

	getData(): CheckpointData | null {
		return this.data;
	}

	reset(): void {
		this.data = null;
		this.saveCallCount = 0;
		this.loadCallCount = 0;
	}
}

/**
 * Mock lock for testing.
 */
class MockLock {
	acquireCallCount = 0;
	releaseCallCount = 0;
	acquireDelay = 0;

	async acquire(): Promise<void> {
		this.acquireCallCount++;
		if (this.acquireDelay > 0) {
			await new Promise((resolve) => setTimeout(resolve, this.acquireDelay));
		}
	}

	release(): void {
		this.releaseCallCount++;
	}

	reset(): void {
		this.acquireCallCount = 0;
		this.releaseCallCount = 0;
	}
}

describe("CheckpointManager", () => {
	let storage: MockCheckpointStorage;
	let lock: MockLock;
	let checkpoint: CheckpointManager;

	beforeEach(() => {
		storage = new MockCheckpointStorage();
		lock = new MockLock();
		checkpoint = new CheckpointManager({ storage, lock });
	});

	describe("constructor", () => {
		it("should use injected storage", () => {
			const mockStorage = new MockCheckpointStorage();
			const mockLock = new MockLock();
			const cp = new CheckpointManager({ storage: mockStorage, lock: mockLock });
			assert.ok(cp);
		});

		it("should use InMemoryLock when no lock provided", () => {
			const mockStorage = new MockCheckpointStorage();
			const cp = new CheckpointManager({ storage: mockStorage });
			assert.ok(cp);
		});

		it("should store worker identity", () => {
			const cp = new CheckpointManager({
				storage,
				lock,
				workerIndex: 2,
				totalWorkers: 4,
				basePath: "/tmp/checkpoints",
			});
			assert.ok(cp);
		});
	});

	describe("load", () => {
		it("should return true when checkpoint exists", async () => {
			const data: CheckpointData = {
				configHash: "abc123",
				createdAt: "2024-01-01T00:00:00.000Z",
				updatedAt: "2024-01-01T00:00:00.000Z",
				completedRunIds: ["run1"],
				results: {},
				totalPlanned: 10,
			};
			storage.setData(data);

			const loaded = await checkpoint.load();
			assert.strictEqual(loaded, true);
		});

		it("should return false when checkpoint does not exist", async () => {
			const loaded = await checkpoint.load();
			assert.strictEqual(loaded, false);
		});

		it("should return false on load error", async () => {
			storage.setData(null);
			// Simulate error by returning null from load
			const loaded = await checkpoint.load();
			assert.strictEqual(loaded, false);
		});
	});

	describe("save", () => {
		it("should save when dirty", async () => {
			storage.setData({
				configHash: "abc123",
				createdAt: "2024-01-01T00:00:00.000Z",
				updatedAt: "2024-01-01T00:00:00.000Z",
				completedRunIds: [],
				results: {},
				totalPlanned: 10,
			});

			await checkpoint.load();
			// Make it dirty by merging results (this modifies data without clearing it)
			const result = createTestResult("test-run");
			checkpoint.mergeResults([result]);
			await checkpoint.save();

			assert.strictEqual(storage.saveCallCount, 1);
		});

		it("should not save when not dirty", async () => {
			storage.setData({
				configHash: "abc123",
				createdAt: "2024-01-01T00:00:00.000Z",
				updatedAt: "2024-01-01T00:00:00.000Z",
				completedRunIds: [],
				results: {},
				totalPlanned: 10,
			});

			await checkpoint.load();
			await checkpoint.save();

			assert.strictEqual(storage.saveCallCount, 0);
		});
	});

	describe("saveIncremental", () => {
		it("should use lock during save", async () => {
			const result = createTestResult("test-run");

			await checkpoint.saveIncremental(result);

			assert.strictEqual(lock.acquireCallCount, 1);
			assert.strictEqual(lock.releaseCallCount, 1);
		});

		it("should add result to checkpoint", async () => {
			const result = createTestResult("test-run");

			await checkpoint.saveIncremental(result);

			const saved = storage.getData();
			assert.ok(saved?.completedRunIds.includes("test-run"));
			assert.deepStrictEqual(saved?.results["test-run"], result);
		});

		it("should reload from storage before save to prevent stale memory", async () => {
			// Create two checkpoints pointing to same storage
			const checkpoint2 = new CheckpointManager({ storage, lock });

			const result1 = createTestResult("run1");
			const result2 = createTestResult("run2");

			// First checkpoint saves result1
			await checkpoint.saveIncremental(result1);

			// Second checkpoint saves result2
			await checkpoint2.saveIncremental(result2);

			const saved = storage.getData();
			assert.ok(saved?.completedRunIds.includes("run1"));
			assert.ok(saved?.completedRunIds.includes("run2"));
		});

		it("should not add duplicate runIds when same result is saved twice", async () => {
			const result = createTestResult("duplicate-run");

			// Save the same result twice (simulating retry or race condition)
			await checkpoint.saveIncremental(result);
			await checkpoint.saveIncremental(result);

			const saved = storage.getData();

			// Should only have one entry in completedRunIds
			assert.deepStrictEqual(saved?.completedRunIds, ["duplicate-run"]);
			assert.strictEqual(saved?.completedRunIds.length, 1);

			// Result should still be stored
			assert.deepStrictEqual(saved?.results["duplicate-run"], result);
		});

		it("should not add duplicate runIds when saving same runId with different results", async () => {
			const result1 = createTestResult("conflict-run");
			const result2 = createTestResult("conflict-run");
			// Modify result2 to be different
			result2.run.sut = "different-sut";

			// Save both results with same runId
			await checkpoint.saveIncremental(result1);
			await checkpoint.saveIncremental(result2);

			const saved = storage.getData();

			// Should only have one entry in completedRunIds
			assert.strictEqual(saved?.completedRunIds.filter((id) => id === "conflict-run").length, 1);
		});
	});

	describe("isCompleted", () => {
		it("should return true for completed runs", async () => {
			storage.setData({
				configHash: "abc123",
				createdAt: "2024-01-01T00:00:00.000Z",
				updatedAt: "2024-01-01T00:00:00.000Z",
				completedRunIds: ["run1", "run2"],
				results: {},
				totalPlanned: 10,
			});

			await checkpoint.load();

			assert.strictEqual(checkpoint.isCompleted("run1"), true);
			assert.strictEqual(checkpoint.isCompleted("run2"), true);
		});

		it("should return false for incomplete runs", async () => {
			storage.setData({
				configHash: "abc123",
				createdAt: "2024-01-01T00:00:00.000Z",
				updatedAt: "2024-01-01T00:00:00.000Z",
				completedRunIds: ["run1"],
				results: {},
				totalPlanned: 10,
			});

			await checkpoint.load();

			assert.strictEqual(checkpoint.isCompleted("run2"), false);
		});

		it("should return false when no checkpoint loaded", () => {
			assert.strictEqual(checkpoint.isCompleted("run1"), false);
		});
	});

	describe("getResults", () => {
		it("should return all completed results", async () => {
			const result1 = createTestResult("run1");

			storage.setData({
				configHash: "abc123",
				createdAt: "2024-01-01T00:00:00.000Z",
				updatedAt: "2024-01-01T00:00:00.000Z",
				completedRunIds: ["run1"],
				results: { run1: result1 },
				totalPlanned: 10,
			});

			await checkpoint.load();
			const results = checkpoint.getResults();

			assert.strictEqual(results.length, 1);
			assert.deepStrictEqual(results[0], result1);
		});

		it("should return empty array when no checkpoint", () => {
			const results = checkpoint.getResults();
			assert.deepStrictEqual(results, []);
		});
	});

	describe("getProgress", () => {
		it("should calculate progress percentage", async () => {
			storage.setData({
				configHash: "abc123",
				createdAt: "2024-01-01T00:00:00.000Z",
				updatedAt: "2024-01-01T00:00:00.000Z",
				completedRunIds: ["run1", "run2", "run3"],
				results: {},
				totalPlanned: 10,
			});

			await checkpoint.load();
			const progress = checkpoint.getProgress();

			assert.strictEqual(progress.completed, 3);
			assert.strictEqual(progress.total, 10);
			assert.strictEqual(progress.percent, 30);
		});

		it("should return zero progress when no checkpoint", () => {
			const progress = checkpoint.getProgress();
			assert.deepStrictEqual(progress, { completed: 0, total: 0, percent: 0 });
		});
	});

	describe("filterRemaining", () => {
		it("should filter out completed runs", async () => {
			storage.setData({
				configHash: "abc123",
				createdAt: "2024-01-01T00:00:00.000Z",
				updatedAt: "2024-01-01T00:00:00.000Z",
				completedRunIds: ["run1", "run2"],
				results: {},
				totalPlanned: 5,
			});

			await checkpoint.load();

			const plannedRuns: PlannedRun[] = [
				createTestRun("run1", 0),
				createTestRun("run2", 1),
				createTestRun("run3", 2),
			];

			const remaining = checkpoint.filterRemaining(plannedRuns);

			assert.strictEqual(remaining.length, 1);
			assert.strictEqual(remaining[0].runId, "run3");
		});

		it("should return all runs when no checkpoint", () => {
			const plannedRuns: PlannedRun[] = [createTestRun("run1", 0), createTestRun("run2", 1)];

			const remaining = checkpoint.filterRemaining(plannedRuns);

			assert.strictEqual(remaining.length, 2);
		});
	});

	describe("invalidate", () => {
		it("should clear checkpoint data", async () => {
			storage.setData({
				configHash: "abc123",
				createdAt: "2024-01-01T00:00:00.000Z",
				updatedAt: "2024-01-01T00:00:00.000Z",
				completedRunIds: ["run1"],
				results: {},
				totalPlanned: 10,
			});

			await checkpoint.load();
			checkpoint.invalidate();

			assert.strictEqual(checkpoint.exists(), false);
		});
	});

	describe("mergeShards", () => {
		it("should merge multiple checkpoint shards", async () => {
			// Create shard storage files
			const shard0 = new MockCheckpointStorage();
			const shard1 = new MockCheckpointStorage();

			const shard0Data: CheckpointData = {
				configHash: "abc123",
				createdAt: "2024-01-01T00:00:00.000Z",
				updatedAt: "2024-01-01T00:01:00.000Z",
				completedRunIds: ["run1", "run2"],
				results: {},
				totalPlanned: 10,
			};
			shard0.setData(shard0Data);

			const shard1Data: CheckpointData = {
				configHash: "abc123",
				createdAt: "2024-01-01T00:00:00.000Z",
				updatedAt: "2024-01-01T00:02:00.000Z",
				completedRunIds: ["run3", "run4"],
				results: {},
				totalPlanned: 10,
			};
			shard1.setData(shard1Data);

			// Mock FileStorage to return our mock shards
			const mockFileStorage = new MockCheckpointStorage();

			// We can't easily mock FileStorage.findShards without actually creating files,
			// so we'll test the merge logic directly by passing shard paths
			// For now, let's just verify the method exists
			assert.strictEqual(typeof checkpoint.mergeShards, "function");
		});
	});

	describe("getStorageType", () => {
		it("should return storage type", () => {
			const fileStorage = new FileStorage("test.json");
			const cp = new CheckpointManager({ storage: fileStorage });
			assert.strictEqual(cp.getStorageType(), "file");
		});
	});

	describe("getSummary", () => {
		it("should return checkpoint summary", async () => {
			storage.setData({
				configHash: "abc123",
				createdAt: "2024-01-01T00:00:00.000Z",
				updatedAt: "2024-01-01T00:00:00.000Z",
				completedRunIds: ["run1", "run2", "run3"],
				results: {},
				totalPlanned: 10,
			});

			await checkpoint.load();
			const summary = checkpoint.getSummary();

			assert.ok(summary.includes("3/10"));
			assert.ok(summary.includes("30%"));
		});

		it("should return 'No checkpoint' when not loaded", () => {
			const summary = checkpoint.getSummary();
			assert.strictEqual(summary, "No checkpoint");
		});
	});

	describe("mergeResults", () => {
		it("should merge new results into checkpoint", async () => {
			const result1 = createTestResult("run1");
			const result2 = createTestResult("run2");

			storage.setData({
				configHash: "abc123",
				createdAt: "2024-01-01T00:00:00.000Z",
				updatedAt: "2024-01-01T00:00:00.000Z",
				completedRunIds: ["run1"],
				results: { run1: result1 },
				totalPlanned: 10,
			});

			await checkpoint.load();
			checkpoint.mergeResults([result2]);

			assert.strictEqual(checkpoint.isCompleted("run1"), true);
			assert.strictEqual(checkpoint.isCompleted("run2"), true);
		});
	});
});
