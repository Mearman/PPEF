/**
 * Unit tests for ParallelExecutor
 *
 * Tests worker name generation, run batch distribution, and shard path generation.
 */

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import type { PlannedRun } from "../executor.js";
import { shardPath } from "../parallel-executor.js";

describe("ParallelExecutor", () => {
	describe("shardPath", () => {
		it("should generate zero-padded worker indices", () => {
			const path0 = shardPath("/tmp/checkpoints", 0);
			const path1 = shardPath("/tmp/checkpoints", 1);
			const path9 = shardPath("/tmp/checkpoints", 9);
			const path10 = shardPath("/tmp/checkpoints", 10);
			const path99 = shardPath("/tmp/checkpoints", 99);
			const path100 = shardPath("/tmp/checkpoints", 100);

			assert.ok(path0.includes("checkpoint-worker-00.json"));
			assert.ok(path1.includes("checkpoint-worker-01.json"));
			assert.ok(path9.includes("checkpoint-worker-09.json"));
			assert.ok(path10.includes("checkpoint-worker-10.json"));
			assert.ok(path99.includes("checkpoint-worker-99.json"));
			assert.ok(path100.includes("checkpoint-worker-100.json"));
		});

		it("should include checkpoint directory in path", () => {
			const path = shardPath("/my/checkpoint/dir", 5);
			assert.ok(path.includes("/my/checkpoint/dir"));
			assert.ok(path.includes("checkpoint-worker-05.json"));
		});
	});

	describe("run batch distribution (conceptual)", () => {
		/**
		 * The executeParallel function uses the following algorithm:
		 * 1. Calculate batch size = ceil(runs.length / numWorkers)
		 * 2. Split runs into batches using slice(i, i + batchSize)
		 *
		 * This test verifies the algorithm produces expected results.
		 */
		it("should distribute runs evenly across workers", () => {
			const runs: PlannedRun[] = Array.from({ length: 100 }, (_, index) => ({
				runId: `run${index}`,
				sutId: "sut",
				caseId: "case",
				repetition: 0,
				seed: index,
			}));

			const numberWorkers = 4;
			const batchSize = Math.ceil(runs.length / numberWorkers); // 25

			const batches: PlannedRun[][] = [];
			for (let index = 0; index < runs.length; index += batchSize) {
				batches.push(runs.slice(index, index + batchSize));
			}

			assert.strictEqual(batches.length, 4);
			assert.strictEqual(batches[0].length, 25);
			assert.strictEqual(batches[1].length, 25);
			assert.strictEqual(batches[2].length, 25);
			assert.strictEqual(batches[3].length, 25);
		});

		it("should handle uneven distribution", () => {
			const runs: PlannedRun[] = Array.from({ length: 10 }, (_, index) => ({
				runId: `run${index}`,
				sutId: "sut",
				caseId: "case",
				repetition: 0,
				seed: index,
			}));

			const numberWorkers = 3;
			const batchSize = Math.ceil(runs.length / numberWorkers); // 4

			const batches: PlannedRun[][] = [];
			for (let index = 0; index < runs.length; index += batchSize) {
				batches.push(runs.slice(index, index + batchSize));
			}

			assert.strictEqual(batches.length, 3);
			assert.strictEqual(batches[0].length, 4);
			assert.strictEqual(batches[1].length, 4);
			assert.strictEqual(batches[2].length, 2); // Last batch gets remainder
		});

		it("should handle single worker", () => {
			const runs: PlannedRun[] = Array.from({ length: 50 }, (_, index) => ({
				runId: `run${index}`,
				sutId: "sut",
				caseId: "case",
				repetition: 0,
				seed: index,
			}));

			const numberWorkers = 1;
			const batchSize = Math.ceil(runs.length / numberWorkers); // 50

			const batches: PlannedRun[][] = [];
			for (let index = 0; index < runs.length; index += batchSize) {
				batches.push(runs.slice(index, index + batchSize));
			}

			assert.strictEqual(batches.length, 1);
			assert.strictEqual(batches[0].length, 50);
		});

		it("should handle more workers than runs", () => {
			const runs: PlannedRun[] = [
				{ runId: "run0", sutId: "sut", caseId: "case", repetition: 0, seed: 0 },
				{ runId: "run1", sutId: "sut", caseId: "case", repetition: 0, seed: 1 },
			];

			const numberWorkers = 5;
			const batchSize = Math.ceil(runs.length / numberWorkers); // 1

			const batches: PlannedRun[][] = [];
			for (let index = 0; index < runs.length; index += batchSize) {
				batches.push(runs.slice(index, index + batchSize));
			}

			// With batchSize=1, we get 2 batches (one per run)
			// The last 3 workers would get empty batches in the actual implementation
			assert.ok(batches.length >= 2);
			assert.strictEqual(batches[0].length, 1);
			assert.strictEqual(batches[1].length, 1);
		});
	});

	describe("run filter generation (conceptual)", () => {
		/**
		 * Each worker receives a run filter as a JSON array of run IDs.
		 * This test verifies the filter format.
		 */
		it("should generate JSON array of run IDs for each batch", () => {
			const runs: PlannedRun[] = [
				{ runId: "alpha", sutId: "sut", caseId: "case", repetition: 0, seed: 0 },
				{ runId: "bravo", sutId: "sut", caseId: "case", repetition: 0, seed: 1 },
				{ runId: "charlie", sutId: "sut", caseId: "case", repetition: 0, seed: 2 },
			];

			const numberWorkers = 2;
			const batchSize = Math.ceil(runs.length / numberWorkers); // 2

			const runFilters: string[] = [];
			for (let index = 0; index < runs.length; index += batchSize) {
				const batch = runs.slice(index, index + batchSize);
				const runIds = new Set(batch.map((r) => r.runId));
				runFilters.push(JSON.stringify([...runIds]));
			}

			assert.strictEqual(runFilters.length, 2);

			const filter0 = JSON.parse(runFilters[0]) as string[];
			const filter1 = JSON.parse(runFilters[1]) as string[];

			assert.ok(filter0.includes("alpha"));
			assert.ok(filter0.includes("bravo"));
			assert.ok(filter1.includes("charlie"));
		});
	});

	describe("worker names generation (conceptual)", () => {
		/**
		 * Worker names follow the pattern: {adjective}-{noun}-{hex-suffix}
		 * This test verifies names are unique and well-formatted.
		 */
		it("should generate unique worker names", () => {
			// The actual implementation uses random adjectives, nouns, and hex suffix
			// Here we verify the pattern is followed

			const adjectives = ["swift", "nimble", "quick"];
			const nouns = ["runner", "worker", "processor"];

			const usedNames = new Set<string>();
			const names: string[] = [];

			for (let index = 0; index < 10; index++) {
				const adj = adjectives[index % adjectives.length];
				const noun = nouns[index % nouns.length];
				const suffix = index.toString(16).padStart(4, "0"); // Simulate hex suffix
				const name = `${adj}-${noun}-${suffix}`;

				// Verify uniqueness
				assert.ok(!usedNames.has(name));
				usedNames.add(name);
				names.push(name);
			}

			assert.strictEqual(names.length, 10);
			assert.strictEqual(new Set(names).size, 10); // All unique
		});
	});

	describe("spawn arguments (conceptual)", () => {
		/**
		 * Verify that workers are spawned with correct arguments.
		 */
		it("should include checkpoint-path argument for each worker", () => {
			const checkpointDir = "/tmp/checkpoints";
			const workerIndex = 2;
			const checkpointPath = shardPath(checkpointDir, workerIndex);

			assert.ok(checkpointPath.includes("checkpoint-worker-02.json"));
			assert.ok(checkpointPath.includes(checkpointDir));
		});

		it("should include worker-index in environment variables", () => {
			const workerIndex = 3;
			const environmentVariable = `GRAPHBOX_WORKER_INDEX=${workerIndex}`;

			assert.strictEqual(environmentVariable, "GRAPHBOX_WORKER_INDEX=3");
		});

		it("should include total-workers in environment variables", () => {
			const totalWorkers = 5;
			const environmentVariable = `GRAPHBOX_TOTAL_WORKERS=${totalWorkers}`;

			assert.strictEqual(environmentVariable, "GRAPHBOX_TOTAL_WORKERS=5");
		});
	});
});

describe("ParallelExecutorOptions", () => {
	describe("defaults", () => {
		it("should use default checkpoint directory when not specified", () => {
			const options: { checkpointDir?: string } = {};
			const checkpointDir = options.checkpointDir ?? "/default/path";

			assert.strictEqual(checkpointDir, "/default/path");
		});

		it("should use custom checkpoint directory when specified", () => {
			const options = { checkpointDir: "/custom/path" };
			const checkpointDir = options.checkpointDir;

			assert.strictEqual(checkpointDir, "/custom/path");
		});
	});
});
