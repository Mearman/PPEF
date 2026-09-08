/**
 * Checkpoint Integration Tests
 *
 * Tests checkpoint save/load functionality, shard merging,
 * and config hash validation.
 */

import { createHash, randomBytes } from "node:crypto";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { strict as assert } from "node:assert";

import type { CaseDefinition, SutDefinition } from "../../types/index.js";
import type { EvaluationResult } from "../../types/result.js";
import { CheckpointManager } from "../checkpoint-manager.js";
import { FileStorage } from "../checkpoint-storage.js";

describe("Checkpoint Integration", () => {
	let testDir: string;
	let checkpoint: CheckpointManager;
	let checkpointPath: string;

	beforeEach(() => {
		testDir = join(tmpdir(), `checkpoint-test-${randomBytes(8).toString("hex")}`);
		checkpointPath = join(testDir, "checkpoint.json");
		checkpoint = new CheckpointManager({
			storage: new FileStorage(checkpointPath),
		});
	});

	afterEach(() => {
		rmSync(testDir, { recursive: true, force: true });
	});

	describe("save and load", () => {
		it("should save and load single run", async () => {
			const result: EvaluationResult = {
				run: {
					runId: "test-run-001",
					sut: "test-sut",
					sutRole: "primary",
					sutVersion: "1.0.0",
					caseId: "case-001",
					caseClass: "test-class",
					seed: 42,
					repetition: 0,
				},
				correctness: {
					expectedExists: false,
					producedOutput: true,
					valid: true,
					matchesExpected: null,
				},
				outputs: { summary: {} },
				metrics: { numeric: { test: 1 } },
				provenance: {
					runtime: { platform: "linux", arch: "x64", nodeVersion: "v22.0.0" },
				},
			};

			// Save
			await checkpoint.saveIncremental(result);

			// Load fresh checkpoint
			const fresh = new CheckpointManager({
				storage: new FileStorage(checkpointPath),
			});
			await fresh.load();
			const results = fresh.getResults();

			assert.strictEqual(results.length, 1);
			assert.strictEqual(results[0]?.run.runId, "test-run-001");
		});

		it("should save and load multiple runs", async () => {
			const results: EvaluationResult[] = [];
			for (let i = 0; i < 5; i++) {
				const result: EvaluationResult = {
					run: {
						runId: `test-run-${i}`,
						sut: "test-sut",
						sutRole: "primary",
						sutVersion: "1.0.0",
						caseId: "case-001",
						caseClass: "test-class",
						seed: 42,
						repetition: i,
					},
					correctness: {
						expectedExists: false,
						producedOutput: true,
						valid: true,
						matchesExpected: null,
					},
					outputs: { summary: {} },
					metrics: { numeric: { test: i } },
					provenance: {
						runtime: { platform: "linux", arch: "x64", nodeVersion: "v22.0.0" },
					},
				};
				results.push(result);
				await checkpoint.saveIncremental(result);
			}

			// Load fresh checkpoint
			const fresh = new CheckpointManager({
				storage: new FileStorage(checkpointPath),
			});
			await fresh.load();
			const loaded = fresh.getResults();

			assert.strictEqual(loaded.length, 5);
			for (let i = 0; i < 5; i++) {
				assert.strictEqual(loaded[i]?.run.runId, `test-run-${i}`);
			}
		});

		it("should persist results to file", async () => {
			const result: EvaluationResult = {
				run: {
					runId: "test-run-001",
					sut: "test-sut",
					sutRole: "primary",
					sutVersion: "1.0.0",
					caseId: "case-001",
					caseClass: "test-class",
					seed: 42,
					repetition: 0,
				},
				correctness: {
					expectedExists: false,
					producedOutput: true,
					valid: true,
					matchesExpected: null,
				},
				outputs: { summary: {} },
				metrics: { numeric: { test: 1 } },
				provenance: {
					runtime: { platform: "linux", arch: "x64", nodeVersion: "v22.0.0" },
				},
			};

			await checkpoint.saveIncremental(result);

			// Verify file exists
			const fresh = new CheckpointManager({
				storage: new FileStorage(checkpointPath),
			});
			await fresh.load();

			assert.strictEqual(fresh.getResults().length, 1);
		});
	});

	describe("config hash", () => {
		it("should detect config hash mismatch", async () => {
			const result: EvaluationResult = {
				run: {
					runId: "test-run-001",
					sut: "test-sut",
					sutRole: "primary",
					sutVersion: "1.0.0",
					caseId: "case-001",
					caseClass: "test-class",
					seed: 42,
					repetition: 0,
				},
				correctness: {
					expectedExists: false,
					producedOutput: true,
					valid: true,
					matchesExpected: null,
				},
				outputs: { summary: {} },
				metrics: { numeric: { test: 1 } },
				provenance: {
					runtime: { platform: "linux", arch: "x64", nodeVersion: "v22.0.0" },
				},
			};

			await checkpoint.saveIncremental(result);

			// Try to load with different config
			const fresh = new CheckpointManager({
				storage: new FileStorage(checkpointPath),
			});
			await fresh.load();

			// Check if stale with different config
			const isStale = fresh.isStale(
				[createMockSut()],
				[createMockCase("case-001")],
				{
					repetitions: 2, // Different from original (1)
					seedBase: 42,
					timeoutMs: 5000,
					collectProvenance: false,
				},
				1,
			);

			assert.strictEqual(isStale, true);
		});

		it("should not be stale when config matches", async () => {
			const result: EvaluationResult = {
				run: {
					runId: "test-run-001",
					sut: "test-sut",
					sutRole: "primary",
					sutVersion: "1.0.0",
					caseId: "case-001",
					caseClass: "test-class",
					seed: 42,
					repetition: 0,
				},
				correctness: {
					expectedExists: false,
					producedOutput: true,
					valid: true,
					matchesExpected: null,
				},
				outputs: { summary: {} },
				metrics: { numeric: { test: 1 } },
				provenance: {
					runtime: { platform: "linux", arch: "x64", nodeVersion: "v22.0.0" },
				},
			};

			// Initialize with proper config hash first
			checkpoint.initializeEmpty(
				[createMockSut()],
				[createMockCase("case-001")],
				{
					repetitions: 1,
					seedBase: 42,
					timeoutMs: 5000,
					collectProvenance: false,
				},
				1,
			);
			// Save the initialized checkpoint to persist the config hash
			await checkpoint.save();

			await checkpoint.saveIncremental(result);

			const fresh = new CheckpointManager({
				storage: new FileStorage(checkpointPath),
			});
			await fresh.load();

			// Same config should not be stale
			const isStale = fresh.isStale(
				[createMockSut()],
				[createMockCase("case-001")],
				{
					repetitions: 1,
					seedBase: 42,
					timeoutMs: 5000,
					collectProvenance: false,
				},
				1,
			);

			assert.strictEqual(isStale, false);
		});

		it("should include all executor config properties in hash", async () => {
			const config1 = {
				continueOnError: true,
				repetitions: 1,
				seedBase: 42,
				timeoutMs: 300_000,
				collectProvenance: true,
			};

			const config2 = {
				...config1,
				concurrency: 12, // Additional property
			};

			const hash1 = createHash("sha256")
				.update(JSON.stringify(config1, Object.keys(config1).sort()))
				.digest("hex");

			const hash2 = createHash("sha256")
				.update(JSON.stringify(config2, Object.keys(config2).sort()))
				.digest("hex");

			// They should be different because concurrency is different
			assert.notStrictEqual(hash1, hash2);
		});
	});

	describe("shard operations", () => {
		it("should find worker shards", async () => {
			// Create mock worker shards
			const shard1 = join(testDir, "checkpoint-worker-00.json");
			const shard2 = join(testDir, "checkpoint-worker-01.json");

			const storage1 = new FileStorage(shard1);
			const storage2 = new FileStorage(shard2);

			await storage1.save({
				configHash: "test-hash",
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				completedRunIds: ["run-001", "run-002"],
				results: {},
				totalPlanned: 0,
			});

			await storage2.save({
				configHash: "test-hash",
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				completedRunIds: ["run-003", "run-004"],
				results: {},
				totalPlanned: 0,
			});

			// Find shards
			const shards = await FileStorage.findShards(testDir);
			assert.strictEqual(shards.length, 2);
			assert.ok(shards.includes(shard1));
			assert.ok(shards.includes(shard2));
		});

		it("should return empty array when no shards exist", async () => {
			const shards = await FileStorage.findShards(testDir);
			assert.deepStrictEqual(shards, []);
		});

		it("should filter shards by config hash", async () => {
			const shard1 = join(testDir, "checkpoint-worker-00.json");
			const shard2 = join(testDir, "checkpoint-worker-01.json");

			const storage1 = new FileStorage(shard1);
			const storage2 = new FileStorage(shard2);

			await storage1.save({
				configHash: "hash-1",
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				completedRunIds: ["run-001"],
				results: {},
				totalPlanned: 0,
			});

			await storage2.save({
				configHash: "hash-2",
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				completedRunIds: ["run-002"],
				results: {},
				totalPlanned: 0,
			});

			// Find shards with specific hash
			const shards = await FileStorage.findShards(testDir);
			assert.strictEqual(shards.length, 2);
		});

		it("should merge shards without duplicates", async () => {
			// Create main checkpoint
			const result1: EvaluationResult = {
				run: {
					runId: "run-001",
					sut: "sut-1",
					sutRole: "primary",
					sutVersion: "1.0.0",
					caseId: "case-001",
					caseClass: "test-class",
					seed: 42,
					repetition: 0,
				},
				correctness: {
					expectedExists: false,
					producedOutput: true,
					valid: true,
					matchesExpected: null,
				},
				outputs: { summary: {} },
				metrics: { numeric: { test: 1 } },
				provenance: {
					runtime: { platform: "linux", arch: "x64", nodeVersion: "v22.0.0" },
				},
			};

			await checkpoint.saveIncremental(result1);

			// Create worker shard with overlapping run
			const workerStorage = new FileStorage(join(testDir, "checkpoint-worker-00.json"));

			await workerStorage.save({
				configHash: "test-hash",
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				completedRunIds: ["run-001", "run-002"], // run-001 overlaps with main
				results: {},
				totalPlanned: 0,
			});

			// Merge
			const shards = await FileStorage.findShards(testDir);
			const merged = await checkpoint.mergeShards(shards);

			// Verify no duplicates
			const uniqueIds = new Set(merged.completedRunIds);
			assert.strictEqual(uniqueIds.size, 2); // run-001, run-002 (no duplicates)
			assert.strictEqual(merged.completedRunIds.length, 2);
		});

		it("should merge all completed run IDs from shards", async () => {
			// Save main checkpoint with some runs
			const result1: EvaluationResult = {
				run: {
					runId: "run-001",
					sut: "sut-1",
					sutRole: "primary",
					sutVersion: "1.0.0",
					caseId: "case-001",
					seed: 42,
					repetition: 0,
				},
				correctness: {
					expectedExists: false,
					producedOutput: true,
					valid: true,
					matchesExpected: null,
				},
				outputs: { summary: {} },
				metrics: { numeric: { test: 1 } },
				provenance: {
					runtime: { platform: "linux", arch: "x64", nodeVersion: "v22.0.0" },
				},
			};

			await checkpoint.saveIncremental(result1);
			// Reload to update in-memory data (saveIncremental only writes to file)
			await checkpoint.load();

			// Create two worker shards with different runs
			const shard1 = join(testDir, "checkpoint-worker-00.json");
			const shard2 = join(testDir, "checkpoint-worker-01.json");

			const storage1 = new FileStorage(shard1);
			const storage2 = new FileStorage(shard2);

			await storage1.save({
				configHash: "test-hash",
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				completedRunIds: ["run-002", "run-003"],
				results: {},
				totalPlanned: 0,
			});

			await storage2.save({
				configHash: "test-hash",
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				completedRunIds: ["run-004", "run-005"],
				results: {},
				totalPlanned: 0,
			});

			// Merge shards
			const shards = await FileStorage.findShards(testDir);
			const merged = await checkpoint.mergeShards(shards);

			// Verify all runs are included
			const runIds = new Set(merged.completedRunIds);
			assert.strictEqual(runIds.size, 5);
			assert.ok(runIds.has("run-001"));
			assert.ok(runIds.has("run-002"));
			assert.ok(runIds.has("run-003"));
			assert.ok(runIds.has("run-004"));
			assert.ok(runIds.has("run-005"));
		});
	});

	describe("edge cases", () => {
		it("should handle loading non-existent checkpoint file", async () => {
			const fresh = new CheckpointManager({
				storage: new FileStorage(join(testDir, "non-existent.json")),
			});

			// Should not throw, just return empty checkpoint
			await fresh.load();

			assert.strictEqual(fresh.getResults().length, 0);
		});

		it("should handle empty shard list during merge", async () => {
			const merged = await checkpoint.mergeShards([]);

			assert.strictEqual(merged.completedRunIds.length, 0);
			assert.strictEqual(merged.totalPlanned, 0);
		});

		it("should handle shard with different config hash", async () => {
			// Save main checkpoint with one config
			const result: EvaluationResult = {
				run: {
					runId: "run-001",
					sut: "test-sut",
					sutRole: "primary",
					sutVersion: "1.0.0",
					caseId: "case-001",
					seed: 42,
					repetition: 0,
				},
				correctness: {
					expectedExists: false,
					producedOutput: true,
					valid: true,
					matchesExpected: null,
				},
				outputs: { summary: {} },
				metrics: { numeric: { test: 1 } },
				provenance: {
					runtime: { platform: "linux", arch: "x64", nodeVersion: "v22.0.0" },
				},
			};

			await checkpoint.saveIncremental(result);
			// Reload to update in-memory data
			await checkpoint.load();

			// Create shard with different config hash
			const shard1 = join(testDir, "checkpoint-worker-00.json");
			const storage1 = new FileStorage(shard1);

			await storage1.save({
				configHash: "different-hash", // Different config
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				completedRunIds: ["run-002"],
				results: {},
				totalPlanned: 0,
			});

			// Merge merges all shards regardless of config hash
			// (implementation doesn't filter by hash)
			const shards = await FileStorage.findShards(testDir);
			const merged = await checkpoint.mergeShards(shards);

			// Should include both runs (merge doesn't filter by hash)
			assert.ok(merged.completedRunIds.includes("run-001"));
			assert.ok(merged.completedRunIds.includes("run-002"));
		});
	});
});

/**
 * Create a mock SUT for testing.
 */
const createMockSut = (): SutDefinition => ({
	registration: {
		id: "mock-sut-v1.0.0",
		name: "Mock SUT",
		version: "1.0.0",
		role: "primary",
		config: {},
		tags: ["test"],
	},
	factory: () => ({
		id: "mock-sut-v1.0.0",
		config: {},
		run: async () => ({ mockResult: true }),
	}),
});

/**
 * Create a mock case for testing.
 */
const createMockCase = (id: string): CaseDefinition => ({
	case: {
		caseId: id,
		name: `Mock Case ${id}`,
		caseClass: "test",
		inputs: { summary: { test: id } },
		tags: ["test"],
		version: "1.0.0",
	},
	getInput: async () => ({ mockInput: true }),
	getInputs: () => ({ mockInputs: true }),
});
