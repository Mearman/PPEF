/**
 * Integration Tests for Parallel Checkpoint Merge Bug
 *
 * Simulates the actual parallel execution scenario that caused data loss:
 * 1. Main process has 123 completed runs
 * 2. Workers spawn and create sharded checkpoints
 * 3. Workers complete additional runs
 * 4. mergeShards() is called
 * 5. Main checkpoint should have all runs, but gets overwritten
 */

import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, it } from "node:test";
import * as assert from "node:assert/strict";

import type { EvaluationResult } from "../../types/result.js";
import type { CheckpointData } from "../checkpoint-manager.js";
import { CheckpointManager } from "../checkpoint-manager.js";
import { FileStorage } from "../checkpoint-storage.js";

describe("Parallel Checkpoint Merge Integration Tests", () => {
	let testDir: string;
	let mainCheckpoint: CheckpointManager;
	let mainPath: string;

	beforeEach(() => {
		testDir = join(tmpdir(), `parallel-merge-test-${randomBytes(8).toString("hex")}`);
		mkdirSync(testDir, { recursive: true });
		mainPath = join(testDir, "checkpoint.json");
		mainCheckpoint = new CheckpointManager({ storage: new FileStorage(mainPath) });
	});

	/**
	 * Helper to read checkpoint data directly from file
	 * @param path
	 */
	const readCheckpointFile = (path: string): CheckpointData => {
		const data = JSON.parse(readFileSync(path, "utf-8"));
		return data as CheckpointData;
	};

	afterEach(() => {
		rmSync(testDir, { recursive: true, force: true });
	});

	it("integration-1: simulates real data loss scenario - 123 main + 2 shards = only 3 remain", async () => {
		console.log("\n=== Simulating Real Data Loss Scenario ===\n");

		// Step 1: Populate main checkpoint with 123 runs (simulating completed experiments)
		console.log("Step 1: Creating main checkpoint with 123 runs...");
		const mainRuns = createMockRunBatch(123);
		for (const run of mainRuns) {
			await mainCheckpoint.saveIncremental(run);
		}

		console.log(
			"  Main checkpoint created:",
			readCheckpointFile(mainPath).completedRunIds.length,
			"runs",
		);

		// Step 2: Simulate workers creating sharded checkpoints
		console.log("\nStep 2: Workers create sharded checkpoints...");

		const shard1Path = join(testDir, "checkpoint-worker-01.json");
		const shard1Storage = new FileStorage(shard1Path);
		const shard1Runs = [createMockResult("worker1-run-001", "sut-1", "case-100")];
		await shard1Storage.save({
			configHash: "test-hash",
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			completedRunIds: ["worker1-run-001"],
			results: { "worker1-run-001": shard1Runs[0] },
			totalPlanned: 132,
		});
		console.log("  Worker 1 shard: 1 run");

		const shard2Path = join(testDir, "checkpoint-worker-02.json");
		const shard2Storage = new FileStorage(shard2Path);
		const shard2Runs = [createMockResult("worker2-run-001", "sut-2", "case-200")];
		await shard2Storage.save({
			configHash: "test-hash",
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			completedRunIds: ["worker2-run-001"],
			results: { "worker2-run-001": shard2Runs[0] },
			totalPlanned: 132,
		});
		console.log("  Worker 2 shard: 1 run");

		// Step 3: Main process loads checkpoint and calls mergeShards
		console.log("\nStep 3: Main process merges shards...");
		await mainCheckpoint.load();

		const beforeMerge = readCheckpointFile(mainPath);
		console.log("  Before merge: main checkpoint has", beforeMerge.completedRunIds.length, "runs");

		// This is where the bug happens!
		const merged = await mainCheckpoint.mergeShards([shard1Path, shard2Path]);

		const afterMerge = readCheckpointFile(mainPath);
		console.log("  After merge: main checkpoint has", afterMerge.completedRunIds.length, "runs");
		console.log("  Merged data has:", merged.completedRunIds.length, "runs");

		// BUG: We expect 125 runs (123 main + 2 shards), but we only get 2!
		console.log("\n  Expected: 125 runs (123 + 2)");
		console.log("  Actual:", afterMerge.completedRunIds.length, "runs");
		console.log("  Data loss:", 123 - afterMerge.completedRunIds.length, "runs!");

		assert.strictEqual(afterMerge.completedRunIds.length, 125);
	});

	it("integration-2: shows mergeShards creates new checkpoint instead of updating", async () => {
		// Populate main checkpoint
		await mainCheckpoint.saveIncremental(createMockResult("main-001", "sut-1", "case-1"));
		await mainCheckpoint.saveIncremental(createMockResult("main-002", "sut-1", "case-2"));

		const mainData = readCheckpointFile(mainPath);
		console.log("Main checkpoint before:", mainData.completedRunIds.length, "runs");

		// Create worker shard
		const shardPath = join(testDir, "checkpoint-worker-00.json");
		const shardStorage = new FileStorage(shardPath);
		await shardStorage.save({
			configHash: "test-hash",
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			completedRunIds: ["worker-001"],
			results: { "worker-001": createMockResult("worker-001", "sut-2", "case-2") },
			totalPlanned: 132,
		});

		// Reload and merge
		await mainCheckpoint.load();
		const merged = await mainCheckpoint.mergeShards([shardPath]);

		// The merged checkpoint should have both main runs and worker run
		console.log("\nExpected runs: main-001, main-002, worker-001 (3 total)");
		console.log("Actual runs:", merged.completedRunIds);

		// Check if main checkpoint was preserved
		const mainDataAfter = readCheckpointFile(mainPath);
		console.log("Main checkpoint after merge:", mainDataAfter.completedRunIds.length, "runs");

		assert.strictEqual(merged.completedRunIds.length, 3);
		assert.ok(merged.completedRunIds.includes("main-001"));
		assert.ok(merged.completedRunIds.includes("main-002"));
		assert.ok(merged.completedRunIds.includes("worker-001"));
	});

	it("integration-3: demonstrates fix strategy - include main checkpoint in merge", async () => {
		// This test shows what the correct behavior should be
		console.log("\n=== Demonstrating Correct Merge Strategy ===\n");

		// Populate main checkpoint
		await mainCheckpoint.saveIncremental(createMockResult("main-001", "sut-1", "case-1"));
		await mainCheckpoint.saveIncremental(createMockResult("main-002", "sut-1", "case-2"));

		console.log("Main checkpoint: 2 runs");

		// Create worker shard
		const shardPath = join(testDir, "checkpoint-worker-00.json");
		const shardStorage = new FileStorage(shardPath);
		await shardStorage.save({
			configHash: "test-hash",
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			completedRunIds: ["worker-001"],
			results: { "worker-001": createMockResult("worker-001", "sut-2", "case-2") },
			totalPlanned: 132,
		});

		console.log("Worker shard: 1 run");

		// Load both
		const mainData = readCheckpointFile(mainPath);
		const shardData = await shardStorage.load();

		// Manual merge (correct approach)
		const combinedRuns = new Set([...mainData.completedRunIds, ...shardData!.completedRunIds]);

		console.log("\nManual merge result:");
		console.log("  Combined runs:", combinedRuns.size);
		console.log("  Run IDs:", [...combinedRuns]);

		// This is what mergeShards should do!
		assert.strictEqual(combinedRuns.size, 3);
		assert.ok([...combinedRuns].includes("main-001"));
		assert.ok([...combinedRuns].includes("main-002"));
		assert.ok([...combinedRuns].includes("worker-001"));
	});
});

/**
 * Create a batch of mock evaluation results
 * @param count
 */
const createMockRunBatch = (count: number): EvaluationResult[] => {
	const results: EvaluationResult[] = [];
	for (let index = 0; index < count; index++) {
		results.push(
			createMockResult(
				`run-${String(index).padStart(3, "0")}`,
				`sut-${index % 4}`,
				`case-${index}`,
			),
		);
	}
	return results;
};

/**
 * Create a mock evaluation result
 * @param runId
 * @param sut
 * @param caseId
 */
const createMockResult = (runId: string, sut: string, caseId: string): EvaluationResult => ({
	run: {
		runId,
		sut,
		sutRole: "primary" as const,
		sutVersion: "1.0.0",
		caseId,
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
});
