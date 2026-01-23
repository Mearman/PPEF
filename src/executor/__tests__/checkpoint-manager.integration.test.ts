/**
 * Integration tests for CheckpointManager
 *
 * Tests end-to-end checkpoint operations with real file system.
 */

import { existsSync, rmSync, unlinkSync } from "node:fs";
import { join } from "node:path";

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import type { EvaluationResult, RunContext } from "../../types/result.js";
import { CheckpointManager, InMemoryLock } from "../checkpoint-manager.js";
import { FileStorage } from "../checkpoint-storage.js";

const TEST_DIR = join(process.cwd(), "test-checkpoints");

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
 * Clean up test checkpoint files.
 * @param path
 */
const cleanupCheckpointFile = (path: string): void => {
	try {
		if (existsSync(path)) {
			unlinkSync(path);
		}
	} catch {
		// Ignore
	}
};

/**
 * Clean up test directory.
 */
const cleanupTestDir = (): void => {
	try {
		rmSync(TEST_DIR, { recursive: true, force: true });
	} catch {
		// Ignore
	}
};

describe("CheckpointManager (Integration)", () => {
	beforeEach(() => {
		cleanupTestDir();
	});

	afterEach(() => {
		cleanupTestDir();
	});

	describe("End-to-end checkpoint lifecycle", () => {
		it("should create checkpoint, save results, load, and verify", async () => {
			const checkpointPath = join(TEST_DIR, "checkpoint.json");
			const storage = new FileStorage(checkpointPath);
			const lock = new InMemoryLock();
			const checkpoint = new CheckpointManager({ storage, lock });

			// Initially no checkpoint
			assert.strictEqual(await checkpoint.load(), false);
			assert.strictEqual(checkpoint.exists(), false);

			// Save a result
			const result1 = createTestResult("run1");
			await checkpoint.saveIncremental(result1);

			// Load checkpoint
			const loaded = await checkpoint.load();
			assert.strictEqual(loaded, true);
			assert.strictEqual(checkpoint.exists(), true);

			// Verify data
			assert.strictEqual(checkpoint.isCompleted("run1"), true);
			assert.strictEqual(checkpoint.getResults().length, 1);

			// Save another result
			const result2 = createTestResult("run2");
			await checkpoint.saveIncremental(result2);

			// Reload and verify both results
			await checkpoint.load();
			assert.strictEqual(checkpoint.isCompleted("run1"), true);
			assert.strictEqual(checkpoint.isCompleted("run2"), true);
			assert.strictEqual(checkpoint.getResults().length, 2);

			// Clean up
			cleanupCheckpointFile(checkpointPath);
		});

		it("should resume from checkpoint and save more results", async () => {
			const checkpointPath = join(TEST_DIR, "resume-checkpoint.json");
			const storage = new FileStorage(checkpointPath);
			const lock = new InMemoryLock();
			const checkpoint = new CheckpointManager({ storage, lock });

			// Save initial results
			await checkpoint.saveIncremental(createTestResult("run1"));
			await checkpoint.saveIncremental(createTestResult("run2"));

			// Create new checkpoint manager instance (simulating process restart)
			const storage2 = new FileStorage(checkpointPath);
			const checkpoint2 = new CheckpointManager({ storage: storage2, lock });
			await checkpoint2.load();

			// Verify existing data
			assert.strictEqual(checkpoint2.isCompleted("run1"), true);
			assert.strictEqual(checkpoint2.isCompleted("run2"), true);

			// Add more results
			await checkpoint2.saveIncremental(createTestResult("run3"));
			await checkpoint2.saveIncremental(createTestResult("run4"));

			// Final verification with yet another instance
			const storage3 = new FileStorage(checkpointPath);
			const checkpoint3 = new CheckpointManager({ storage: storage3, lock });
			await checkpoint3.load();

			assert.strictEqual(checkpoint3.getResults().length, 4);
			assert.strictEqual(checkpoint3.isCompleted("run1"), true);
			assert.strictEqual(checkpoint3.isCompleted("run2"), true);
			assert.strictEqual(checkpoint3.isCompleted("run3"), true);
			assert.strictEqual(checkpoint3.isCompleted("run4"), true);

			// Clean up
			cleanupCheckpointFile(checkpointPath);
		});
	});

	describe("Multi-worker simulation", () => {
		it("should handle multiple workers writing to separate files", async () => {
			const workers = 3;
			const checkpoints: CheckpointManager[] = [];
			const checkpointPaths: string[] = [];

			// Create checkpoint managers for each worker
			for (let index = 0; index < workers; index++) {
				const path = join(TEST_DIR, `checkpoint-worker-${index}.json`);
				checkpointPaths.push(path);
				const storage = new FileStorage(path);
				const lock = new InMemoryLock();
				const checkpoint = new CheckpointManager({
					storage,
					lock,
					workerIndex: index,
					totalWorkers: workers,
					basePath: TEST_DIR,
				});
				checkpoints.push(checkpoint);
			}

			// Each worker saves different results
			await checkpoints[0].saveIncremental(createTestResult("run0"));
			await checkpoints[0].saveIncremental(createTestResult("run1"));
			await checkpoints[1].saveIncremental(createTestResult("run2"));
			await checkpoints[1].saveIncremental(createTestResult("run3"));
			await checkpoints[2].saveIncremental(createTestResult("run4"));
			await checkpoints[2].saveIncremental(createTestResult("run5"));

			// Verify each worker has their own data
			await checkpoints[0].load();
			assert.strictEqual(checkpoints[0].getResults().length, 2);
			assert.strictEqual(checkpoints[0].isCompleted("run0"), true);
			assert.strictEqual(checkpoints[0].isCompleted("run1"), true);

			await checkpoints[1].load();
			assert.strictEqual(checkpoints[1].getResults().length, 2);
			assert.strictEqual(checkpoints[1].isCompleted("run2"), true);
			assert.strictEqual(checkpoints[1].isCompleted("run3"), true);

			await checkpoints[2].load();
			assert.strictEqual(checkpoints[2].getResults().length, 2);
			assert.strictEqual(checkpoints[2].isCompleted("run4"), true);
			assert.strictEqual(checkpoints[2].isCompleted("run5"), true);

			// Clean up
			for (const path of checkpointPaths) {
				cleanupCheckpointFile(path);
			}
		});
	});

	describe("Merge phase", () => {
		it("should merge multiple worker checkpoints into aggregate", async () => {
			const workers = 3;
			const checkpointPaths: string[] = [];

			// Create worker checkpoints
			for (let index = 0; index < workers; index++) {
				const path = join(TEST_DIR, `checkpoint-worker-${index}.json`);
				checkpointPaths.push(path);
				const storage = new FileStorage(path);
				const lock = new InMemoryLock();
				const checkpoint = new CheckpointManager({
					storage,
					lock,
					workerIndex: index,
					totalWorkers: workers,
					basePath: TEST_DIR,
				});

				// Initialize with config hash
				checkpoint.initializeEmpty([], [], { repetitions: 1 }, 6);

				// Save some results
				const baseIndex = index * 2;
				await checkpoint.saveIncremental(createTestResult(`run${baseIndex}`));
				await checkpoint.saveIncremental(createTestResult(`run${baseIndex + 1}`));
			}

			// Now merge them
			const mainPath = join(TEST_DIR, "checkpoint.json");
			const mainStorage = new FileStorage(mainPath);
			const mainCheckpoint = new CheckpointManager({
				storage: mainStorage,
				lock: new InMemoryLock(),
			});

			await mainCheckpoint.mergeShards(checkpointPaths);

			// Verify merged data
			assert.strictEqual(mainCheckpoint.exists(), true);
			assert.strictEqual(mainCheckpoint.getResults().length, 6);
			assert.strictEqual(mainCheckpoint.isCompleted("run0"), true);
			assert.strictEqual(mainCheckpoint.isCompleted("run1"), true);
			assert.strictEqual(mainCheckpoint.isCompleted("run2"), true);
			assert.strictEqual(mainCheckpoint.isCompleted("run3"), true);
			assert.strictEqual(mainCheckpoint.isCompleted("run4"), true);
			assert.strictEqual(mainCheckpoint.isCompleted("run5"), true);

			// Clean up
			cleanupCheckpointFile(mainPath);
			for (const path of checkpointPaths) {
				cleanupCheckpointFile(path);
			}
		});

		it("should use FileStorage.findShards to discover worker checkpoints", async () => {
			const workers = 3;

			// Create worker checkpoints
			for (let index = 0; index < workers; index++) {
				const path = join(TEST_DIR, `checkpoint-worker-${index}.json`);
				const storage = new FileStorage(path);
				const lock = new InMemoryLock();
				const checkpoint = new CheckpointManager({
					storage,
					lock,
					workerIndex: index,
					totalWorkers: workers,
					basePath: TEST_DIR,
				});
				await checkpoint.saveIncremental(createTestResult(`run${index}`));
			}

			// Discover shards
			const shards = await FileStorage.findShards(TEST_DIR);
			assert.strictEqual(shards.length, 3);

			// Merge discovered shards
			const mainPath = join(TEST_DIR, "checkpoint.json");
			const mainStorage = new FileStorage(mainPath);
			const mainCheckpoint = new CheckpointManager({
				storage: mainStorage,
				lock: new InMemoryLock(),
			});

			await mainCheckpoint.mergeShards(shards);

			// Verify all results merged
			assert.strictEqual(mainCheckpoint.getResults().length, 3);

			// Clean up
			cleanupCheckpointFile(mainPath);
			for (let index = 0; index < workers; index++) {
				cleanupCheckpointFile(join(TEST_DIR, `checkpoint-worker-${index}.json`));
			}
		});
	});

	describe("Progress tracking", () => {
		it("should calculate progress correctly", async () => {
			const checkpointPath = join(TEST_DIR, "progress-checkpoint.json");
			const storage = new FileStorage(checkpointPath);
			const lock = new InMemoryLock();
			const checkpoint = new CheckpointManager({ storage, lock });

			// Initialize with total planned and save to persist totalPlanned
			checkpoint.initializeEmpty([], [], { repetitions: 1 }, 10);
			await checkpoint.save();

			const progress1 = checkpoint.getProgress();
			assert.strictEqual(progress1.completed, 0);
			assert.strictEqual(progress1.total, 10);
			assert.strictEqual(progress1.percent, 0);

			// Save some results
			await checkpoint.saveIncremental(createTestResult("run1"));
			await checkpoint.saveIncremental(createTestResult("run2"));
			await checkpoint.saveIncremental(createTestResult("run3"));

			// Reload and check progress
			await checkpoint.load();
			const progress2 = checkpoint.getProgress();
			assert.strictEqual(progress2.completed, 3);
			assert.strictEqual(progress2.total, 10);
			assert.strictEqual(progress2.percent, 30);

			// Complete all
			for (let index = 4; index <= 10; index++) {
				await checkpoint.saveIncremental(createTestResult(`run${index}`));
			}

			await checkpoint.load();
			const progress3 = checkpoint.getProgress();
			assert.strictEqual(progress3.completed, 10);
			assert.strictEqual(progress3.total, 10);
			assert.strictEqual(progress3.percent, 100);

			// Clean up
			cleanupCheckpointFile(checkpointPath);
		});
	});

	describe("Filter remaining runs", () => {
		it("should filter out completed runs", async () => {
			const checkpointPath = join(TEST_DIR, "filter-checkpoint.json");
			const storage = new FileStorage(checkpointPath);
			const lock = new InMemoryLock();
			const checkpoint = new CheckpointManager({ storage, lock });

			// Save some results
			await checkpoint.saveIncremental(createTestResult("run1"));
			await checkpoint.saveIncremental(createTestResult("run2"));
			await checkpoint.saveIncremental(createTestResult("run3"));

			// Reload
			await checkpoint.load();

			// Filter remaining
			const allRuns = [
				{ runId: "run1", sutId: "sut", caseId: "case", repetition: 0, seed: 1 },
				{ runId: "run2", sutId: "sut", caseId: "case", repetition: 0, seed: 2 },
				{ runId: "run3", sutId: "sut", caseId: "case", repetition: 0, seed: 3 },
				{ runId: "run4", sutId: "sut", caseId: "case", repetition: 0, seed: 4 },
				{ runId: "run5", sutId: "sut", caseId: "case", repetition: 0, seed: 5 },
			];

			const remaining = checkpoint.filterRemaining(allRuns);
			assert.strictEqual(remaining.length, 2);
			assert.deepStrictEqual(
				remaining.map((r) => r.runId),
				["run4", "run5"],
			);

			// Clean up
			cleanupCheckpointFile(checkpointPath);
		});
	});
});
