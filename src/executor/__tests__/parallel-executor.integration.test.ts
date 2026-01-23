/**
 * Integration tests for ParallelExecutor
 *
 * Tests worker spawning, checkpoint file creation, and merge phase.
 */

import { existsSync, readFileSync, rmSync, unlinkSync } from "node:fs";
import { join } from "node:path";

import { describe, it, beforeEach, afterEach } from "node:test";
import * as assert from "node:assert/strict";

import { FileStorage } from "../checkpoint-storage.js";
import { shardPath } from "../parallel-executor.js";

const TEST_DIR = join(process.cwd(), "test-parallel-executor");

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

describe("ParallelExecutor (Integration)", () => {
	beforeEach(() => {
		cleanupTestDir();
	});

	afterEach(() => {
		cleanupTestDir();
	});

	describe("shardPath", () => {
		it("should create shard paths that are properly formatted", () => {
			const path0 = shardPath(TEST_DIR, 0);
			const path1 = shardPath(TEST_DIR, 1);
			const path10 = shardPath(TEST_DIR, 10);

			assert.ok(path0.includes("checkpoint-worker-00.json"));
			assert.ok(path1.includes("checkpoint-worker-01.json"));
			assert.ok(path10.includes("checkpoint-worker-10.json"));

			// All should be in the test directory
			assert.ok(path0.includes(TEST_DIR));
			assert.ok(path1.includes(TEST_DIR));
			assert.ok(path10.includes(TEST_DIR));
		});

		it("should create unique paths for each worker index", () => {
			const paths = new Set<string>();
			for (let index = 0; index < 10; index++) {
				paths.add(shardPath(TEST_DIR, index));
			}
			assert.strictEqual(paths.size, 10);
		});
	});

	describe("FileStorage with sharded checkpoints", () => {
		it("should create and read sharded checkpoint files", async () => {
			const numberWorkers = 3;
			const checkpointPaths: string[] = [];

			// Create checkpoint files for each worker
			for (let index = 0; index < numberWorkers; index++) {
				const path = shardPath(TEST_DIR, index);
				checkpointPaths.push(path);

				const storage = new FileStorage(path);
				const checkpointData = {
					configHash: `worker-${index}`,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					completedRunIds: [`run${index}-1`, `run${index}-2`],
					results: {},
					totalPlanned: 10,
					workerIndex: index,
					totalWorkers: numberWorkers,
				};

				await storage.save(checkpointData);

				// Verify file exists
				assert.strictEqual(existsSync(path), true);
			}

			// Verify each checkpoint can be loaded
			for (let index = 0; index < numberWorkers; index++) {
				const storage = new FileStorage(checkpointPaths[index]);
				const loaded = await storage.load();
				assert.ok(loaded);
				assert.strictEqual(loaded?.configHash, `worker-${index}`);
				assert.strictEqual(loaded?.workerIndex, index);
				assert.strictEqual(loaded?.totalWorkers, numberWorkers);
			}

			// Clean up
			for (const path of checkpointPaths) {
				try {
					unlinkSync(path);
				} catch {
					// Ignore
				}
			}
		});
	});

	describe("FileStorage.findShards", () => {
		it("should discover all worker checkpoint files", async () => {
			const numberWorkers = 4;

			// Create checkpoint files
			for (let index = 0; index < numberWorkers; index++) {
				const path = shardPath(TEST_DIR, index);
				const storage = new FileStorage(path);
				await storage.save({
					configHash: `worker-${index}`,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					completedRunIds: [`run${index}`],
					results: {},
					totalPlanned: 10,
					workerIndex: index,
					totalWorkers: numberWorkers,
				});
			}

			// Create a non-shard file (should be ignored)
			const otherPath = join(TEST_DIR, "other.json");
			const otherStorage = new FileStorage(otherPath);
			await otherStorage.save({
				configHash: "other",
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				completedRunIds: [],
				results: {},
				totalPlanned: 0,
			});

			// Discover shards
			const shards = await FileStorage.findShards(TEST_DIR);
			assert.strictEqual(shards.length, numberWorkers);

			// Verify shards are sorted by worker index
			for (let index = 0; index < numberWorkers; index++) {
				assert.ok(
					shards[index].includes(`checkpoint-worker-${String(index).padStart(2, "0")}.json`),
				);
			}

			// Clean up
			for (let index = 0; index < numberWorkers; index++) {
				try {
					unlinkSync(shardPath(TEST_DIR, index));
				} catch {
					// Ignore
				}
			}
			try {
				unlinkSync(otherPath);
			} catch {
				// Ignore
			}
		});

		it("should return empty array when no shards exist", async () => {
			const shards = await FileStorage.findShards(TEST_DIR);
			assert.deepStrictEqual(shards, []);
		});

		it("should handle non-existent directory gracefully", async () => {
			const nonExistentDir = join(TEST_DIR, "does-not-exist");
			const shards = await FileStorage.findShards(nonExistentDir);
			assert.deepStrictEqual(shards, []);
		});
	});

	describe("Checkpoint file format", () => {
		it("should write valid JSON that can be parsed", async () => {
			const path = shardPath(TEST_DIR, 0);
			const storage = new FileStorage(path);

			// Create minimal valid EvaluationResult objects
			const createMinimalResult = (runId: string) => ({
				run: {
					runId,
					sut: "test-sut",
					sutRole: "primary" as const,
					caseId: "test-case",
					config: { repetitions: 1, seedBase: 42 },
				},
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
			});

			const checkpointData = {
				configHash: "test-config",
				createdAt: "2024-01-01T00:00:00.000Z",
				updatedAt: "2024-01-01T01:00:00.000Z",
				completedRunIds: ["run1", "run2", "run3"],
				results: {
					run1: createMinimalResult("run1"),
					run2: createMinimalResult("run2"),
					run3: createMinimalResult("run3"),
				},
				totalPlanned: 10,
				workerIndex: 0,
				totalWorkers: 3,
			};

			await storage.save(checkpointData);

			// Read raw file and verify JSON
			const rawContent = readFileSync(path, "utf-8");
			const parsed = JSON.parse(rawContent);

			assert.strictEqual(parsed.configHash, "test-config");
			assert.strictEqual(parsed.completedRunIds.length, 3);
			assert.strictEqual(parsed.workerIndex, 0);
			assert.strictEqual(parsed.totalWorkers, 3);

			// Clean up
			try {
				unlinkSync(path);
			} catch {
				// Ignore
			}
		});
	});

	describe("Worker identity", () => {
		it("should store worker index and total workers in checkpoint", async () => {
			const numberWorkers = 5;

			for (let index = 0; index < numberWorkers; index++) {
				const path = shardPath(TEST_DIR, index);
				const storage = new FileStorage(path);
				const checkpoint = {
					configHash: "test",
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					completedRunIds: [],
					results: {},
					totalPlanned: 10,
					workerIndex: index,
					totalWorkers: numberWorkers,
				};

				await storage.save(checkpoint);

				// Reload and verify
				const loaded = await storage.load();
				assert.strictEqual(loaded?.workerIndex, index);
				assert.strictEqual(loaded?.totalWorkers, numberWorkers);

				// Clean up
				try {
					unlinkSync(path);
				} catch {
					// Ignore
				}
			}
		});
	});
});
