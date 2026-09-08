/**
 * Diagnostic Unit Tests for Checkpoint Merge Bug
 *
 * Tests to reproduce the data loss bug where mergeShards() overwrites
 * the main checkpoint instead of combining it with shard results.
 */

import { randomBytes } from "node:crypto";
import { readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import type { EvaluationResult } from "../../types/result.js";
import type { CheckpointData } from "../checkpoint-manager.js";
import { CheckpointManager } from "../checkpoint-manager.js";
import { FileStorage } from "../checkpoint-storage.js";

describe("Checkpoint Merge Bug Diagnostics", () => {
	let testDir: string;
	let mainCheckpoint: CheckpointManager;
	let mainPath: string;

	beforeEach(() => {
		testDir = join(tmpdir(), `checkpoint-merge-test-${randomBytes(8).toString("hex")}`);
		mainPath = join(testDir, "checkpoint.json");
		mainCheckpoint = new CheckpointManager({
			storage: new FileStorage(mainPath),
		});
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

	it("diagnostic-1: mergeShards should combine main checkpoint with shards", async () => {
		// Setup: Create main checkpoint with 3 completed runs
		const run1: EvaluationResult = createMockResult("run-001", "sut-1", "case-1");
		const run2: EvaluationResult = createMockResult("run-002", "sut-1", "case-2");
		const run3: EvaluationResult = createMockResult("run-003", "sut-1", "case-3");

		await mainCheckpoint.saveIncremental(run1);
		await mainCheckpoint.saveIncremental(run2);
		await mainCheckpoint.saveIncremental(run3);

		const mainData = readCheckpointFile(mainPath);
		assert.strictEqual(mainData.completedRunIds.length, 3);

		// Create worker shard with 1 additional run
		const shardPath = join(testDir, "checkpoint-worker-00.json");
		const shardStorage = new FileStorage(shardPath);
		await shardStorage.save({
			configHash: "test-hash",
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			completedRunIds: ["run-004"],
			results: {
				"run-004": createMockResult("run-004", "sut-1", "case-4"),
			},
			totalPlanned: 4,
		});

		// Load checkpoint to reset internal state
		await mainCheckpoint.load();

		// BUG: mergeShards will lose the 3 runs from main checkpoint!
		const merged = await mainCheckpoint.mergeShards([shardPath]);

		const mainAfterMerge = readCheckpointFile(mainPath);
		console.log("Main checkpoint runs:", mainAfterMerge.completedRunIds.length);
		console.log("Merged runs:", merged.completedRunIds.length);
		console.log("Expected: 4 runs (3 from main + 1 from shard)");

		// This should be 4, but will fail showing the bug
		assert.strictEqual(merged.completedRunIds.length, 4);
	});

	it("diagnostic-2: demonstrates mergeShards creates new checkpoint instead of combining", async () => {
		// Setup main checkpoint with data
		await mainCheckpoint.saveIncremental(createMockResult("main-001", "sut-1", "case-1"));

		const mainBeforeMerge = readCheckpointFile(mainPath);
		console.log("Main checkpoint before merge:", mainBeforeMerge.completedRunIds.length);

		// Create empty shard (simulating worker that completed no runs)
		const shardPath = join(testDir, "checkpoint-worker-00.json");
		const shardStorage = new FileStorage(shardPath);
		await shardStorage.save({
			configHash: "test-hash",
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			completedRunIds: [],
			results: {},
			totalPlanned: 132,
		});

		await mainCheckpoint.load();

		// Merge empty shard
		await mainCheckpoint.mergeShards([shardPath]);

		const mainAfterMerge = readCheckpointFile(mainPath);
		console.log("Main checkpoint after merge:", mainAfterMerge.completedRunIds.length);

		// BUG: The main checkpoint's run is lost!
		assert.ok(mainAfterMerge.completedRunIds.length > 0);
	});

	it("diagnostic-3: shows mergeShards doesn't preserve main checkpoint data", async () => {
		// Create main checkpoint
		await mainCheckpoint.saveIncremental(createMockResult("main-001", "sut-1", "case-1"));
		await mainCheckpoint.saveIncremental(createMockResult("main-002", "sut-2", "case-2"));

		const mainDataBefore = readCheckpointFile(mainPath);
		const mainRuns = mainDataBefore.completedRunIds;
		console.log("Main checkpoint has runs:", mainRuns);

		// Create worker shard
		const shardPath = join(testDir, "checkpoint-worker-00.json");
		const shardStorage = new FileStorage(shardPath);
		await shardStorage.save({
			configHash: "test-hash",
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			completedRunIds: ["shard-001"],
			results: {
				"shard-001": createMockResult("shard-001", "sut-3", "case-3"),
			},
			totalPlanned: 132,
		});

		// Reload main checkpoint
		await mainCheckpoint.load();

		// Merge
		const merged = await mainCheckpoint.mergeShards([shardPath]);

		const mainDataAfter = readCheckpointFile(mainPath);
		console.log("After merge:");
		console.log("  Main checkpoint runs:", mainDataAfter.completedRunIds);
		console.log("  Merged runs:", merged.completedRunIds);
		console.log("  Expected: 3 runs (2 from main + 1 from shard)");
		console.log("  Actual:", merged.completedRunIds.length, "runs");

		// Should have both main runs AND shard run
		const expectedRunIds = new Set([...mainRuns, "shard-001"]);
		const actualRunIds = new Set(merged.completedRunIds);

		console.log(
			"  Missing runs:",
			[...expectedRunIds].filter((x) => !actualRunIds.has(x)),
		);

		// Check all expected runs are present
		for (const runId of expectedRunIds) {
			assert.ok(actualRunIds.has(runId), `Expected run ${runId} to be in merged results`);
		}
		// Check counts match
		assert.strictEqual(actualRunIds.size, expectedRunIds.size);
	});
});

/**
 * Create a mock evaluation result for testing
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
