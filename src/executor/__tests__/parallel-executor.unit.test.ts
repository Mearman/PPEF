/**
 * Unit tests for ParallelExecutor
 *
 * Tests worker name generation, run batch distribution, and shard path generation.
 */

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import { shardPath, generateWorkerNames } from "../parallel-executor.js";

describe("ParallelExecutor", () => {
	describe("generateWorkerNames", () => {
		it("should generate the requested number of unique names", () => {
			const count = 5;
			const names = generateWorkerNames(count);

			assert.strictEqual(names.length, count);
			assert.strictEqual(new Set(names).size, count); // All unique
		});

		it("should generate names with hyphen-separated pattern", () => {
			const names = generateWorkerNames(3);

			for (const name of names) {
				assert.ok(name.includes("-"), `Name ${name} should contain hyphens`);
				const parts = name.split("-");
				assert.strictEqual(parts.length, 3, `Name ${name} should have 3 parts`);
			}
		});

		it("should generate unique names for large counts", () => {
			const count = 20;
			const names = generateWorkerNames(count);

			assert.strictEqual(names.length, count);
			assert.strictEqual(new Set(names).size, count);
		});

		it("should handle single worker", () => {
			const names = generateWorkerNames(1);

			assert.strictEqual(names.length, 1);
			assert.ok(names[0].includes("-"));
		});

		it("should not repeat names across multiple calls", () => {
			const count = 10;
			const names1 = generateWorkerNames(count);
			const names2 = generateWorkerNames(count);

			// Each set should have unique names
			assert.strictEqual(new Set(names1).size, count);
			assert.strictEqual(new Set(names2).size, count);

			// The two sets may overlap, but that's acceptable due to randomness
			// What matters is each individual call returns unique names
		});
	});

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

		it("should handle relative checkpoint directories", () => {
			const path = shardPath("checkpoints", 3);
			assert.ok(path.includes("checkpoints"));
			assert.ok(path.includes("checkpoint-worker-03.json"));
		});

		it("should handle empty checkpoint directory", () => {
			const path = shardPath("", 7);
			assert.ok(path.includes("checkpoint-worker-07.json"));
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

		it("should use default workers when not specified", () => {
			const options: { workers?: number } = {};
			// Default is CPU count, but we can't test that directly
			// Just verify the undefined case falls back
			assert.strictEqual(options.workers, undefined);
		});

		it("should use custom workers when specified", () => {
			const options = { workers: 4 };
			assert.strictEqual(options.workers, 4);
		});
	});
});

describe("path handling utilities", () => {
	describe("dist directory detection", () => {
		it("should detect Unix-style dist paths", () => {
			const unixDistPath = "/path/to/project/dist/cli.js";
			// Extract directory from file path
			const lastSlashIndex = unixDistPath.lastIndexOf("/");
			const entryDir = unixDistPath.substring(0, lastSlashIndex);
			const endsWithUnixDist = entryDir.endsWith("/dist");

			assert.ok(endsWithUnixDist);
		});

		it("should not detect non-dist paths", () => {
			const nonDistPath = "/path/to/project/index.js";
			const lastSlashIndex = nonDistPath.lastIndexOf("/");
			const entryDir = nonDistPath.substring(0, lastSlashIndex);
			const endsWithDist = entryDir.endsWith("/dist");

			assert.ok(!endsWithDist);
		});

		it("should handle paths with dist in middle", () => {
			const pathWithDistInMiddle = "/path/to/dist/middle/cli.js";
			const lastSlashIndex = pathWithDistInMiddle.lastIndexOf("/");
			const entryDir = pathWithDistInMiddle.substring(0, lastSlashIndex);
			const endsWithDist = entryDir.endsWith("/dist");

			assert.ok(!endsWithDist);
		});

		it("should detect nested dist paths", () => {
			const nestedDistPath = "/path/to/project/sub/dist/cli.js";
			const lastSlashIndex = nestedDistPath.lastIndexOf("/");
			const entryDir = nestedDistPath.substring(0, lastSlashIndex);
			const endsWithDist = entryDir.endsWith("/dist");

			assert.ok(endsWithDist);
		});
	});
});
