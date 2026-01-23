/**
 * Diagnostic Tests for Checkpoint Integration Bug
 *
 * Tests to diagnose why parallel workers aren't properly using checkpoints.
 * Symptoms:
 * - Workers report "No checkpoint"
 * - Workers report "Total runs: 0, From checkpoint: 0, New this run: 0"
 * - Main checkpoint has 123/132 runs but workers start fresh
 */

import { createHash, randomBytes } from "node:crypto";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strict as assert } from "node:assert";
import { afterEach, beforeEach, describe, it } from "node:test";

import type { CaseDefinition, SutDefinition } from "../../types/index.js";
import type { EvaluationResult } from "../../types/result.js";
import { CheckpointManager } from "../checkpoint-manager.js";
import { FileStorage } from "../checkpoint-storage.js";

describe("Checkpoint Integration Bug Diagnostics", () => {
	let testDir: string;
	let checkpoint: CheckpointManager;
	let checkpointPath: string;

	beforeEach(() => {
		testDir = join(tmpdir(), `checkpoint-test-${randomBytes(8).toString("hex")}`);
		checkpointPath = join(testDir, "checkpoint.json");
		checkpoint = new CheckpointManager({ storage: new FileStorage(checkpointPath) });
	});

	afterEach(() => {
		rmSync(testDir, { recursive: true, force: true });
	});

	it("diagnostic-1: should save and load single run", async () => {
		const sut = createMockSut();
		const testCase = createMockCase("case-001");

		const { Executor } = await import("../executor.js");
		const executor = new Executor({
			repetitions: 1,
			seedBase: 42,
			timeoutMs: 5000,
			collectProvenance: false,
			onResult: async (result) => {
				await checkpoint.saveIncremental(result);
			},
		});

		// Execute
		const summary = await executor.execute([sut], [testCase], () => ({}));

		// Verify
		assert.strictEqual(summary.successfulRuns, 1);
		const results = checkpoint.getResults();
		assert.strictEqual(results.length, 1);

		// Load fresh checkpoint
		const fresh = new CheckpointManager({ storage: new FileStorage(checkpointPath) });
		await fresh.load();
		assert.strictEqual(fresh.getResults().length, 1);
	});

	it("diagnostic-2: should detect config hash mismatch", async () => {
		// Save with one config
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
		const fresh = new CheckpointManager({ storage: new FileStorage(checkpointPath) });
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

	it("diagnostic-3: should find worker shards", async () => {
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

	it("diagnostic-4: should merge shards without duplicates", async () => {
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

	it("diagnostic-5: config hash should include all executor config properties", async () => {
		// This test verifies which properties are included in the hash
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

		console.log("Hash without concurrency:", hash1);
		console.log("Hash with concurrency:", hash2);
		console.log("Match:", hash1 === hash2);

		// They should be different because concurrency is different
		assert.notStrictEqual(hash1, hash2);
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
 * @param id
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
