/**
 * Diagnostic Tests for Checkpoint Config Hash Bug
 *
 * Root cause: Config hash calculation includes properties that vary between
 * main process and workers (e.g., 'concurrency'), causing checkpoint invalidation.
 *
 * This test diagnoses and will help fix the hash matching issue.
 */

import { createHash } from "node:crypto";

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

describe("Checkpoint Config Hash Bug Diagnostics", () => {
	it("diagnostic-1: identifies which properties cause hash mismatch", () => {
		// Main process config (from evaluate.ts)
		const mainProcessConfig = {
			continueOnError: true,
			repetitions: 1,
			seedBase: 42,
			timeoutMs: 300_000,
			collectProvenance: true,
			concurrency: 12, // This varies!
			onProgress: undefined,
			onResult: undefined,
		};

		// Worker process config (what workers actually use)
		const workerConfig = {
			continueOnError: true,
			repetitions: 1,
			seedBase: 42,
			timeoutMs: 300_000,
			collectProvenance: true,
		};

		const mainHash = createHash("sha256")
			.update(JSON.stringify(mainProcessConfig, Object.keys(mainProcessConfig).sort()))
			.digest("hex");

		const workerHash = createHash("sha256")
			.update(JSON.stringify(workerConfig, Object.keys(workerConfig).sort()))
			.digest("hex");

		console.log("Main process hash:", mainHash);
		console.log("Worker process hash:", workerHash);
		console.log("Match:", mainHash === workerHash);

		// They should NOT match because 'concurrency' is different
		assert.notStrictEqual(mainHash, workerHash);

		// This is the bug! The hash includes functions/concurrency which varies
	});

	it("diagnostic-2: demonstrates correct hash normalization", () => {
		// Extract only serializable properties for hashing
		const extractConfigForHash = (config: Record<string, unknown>) => {
			const { concurrency, onProgress, onResult, ...hashable } = config;
			return hashable;
		};

		const config1 = {
			continueOnError: true,
			repetitions: 1,
			seedBase: 42,
			timeoutMs: 300_000,
			collectProvenance: true,
			concurrency: 12,
			onProgress: () => {},
			onResult: async () => {},
		};

		const config2 = {
			continueOnError: true,
			repetitions: 1,
			seedBase: 42,
			timeoutMs: 300_000,
			collectProvenance: true,
			concurrency: 4, // Different!
			onProgress: undefined,
			onResult: undefined,
		};

		const hash1 = createHash("sha256")
			.update(
				JSON.stringify(
					extractConfigForHash(config1),
					Object.keys(extractConfigForHash(config1)).sort(),
				),
			)
			.digest("hex");

		const hash2 = createHash("sha256")
			.update(
				JSON.stringify(
					extractConfigForHash(config2),
					Object.keys(extractConfigForHash(config2)).sort(),
				),
			)
			.digest("hex");

		console.log("Normalized hash 1:", hash1);
		console.log("Normalized hash 2:", hash2);
		console.log("Match after normalization:", hash1 === hash2);

		// They SHOULD match after normalization
		assert.strictEqual(hash1, hash2);
	});

	it("diagnostic-3: shows actual checkpoint vs computed hash", () => {
		// This is what's stored in the checkpoint
		const storedHash = "a5cf20f1520ebfdb108b04f62a4a06682e4c8c791e00c7aed32fa25088ce53d5";

		// What the main process computes
		const mainConfig = {
			continueOnError: true,
			repetitions: 1,
			seedBase: 42,
			timeoutMs: 300_000,
			collectProvenance: true,
			concurrency: 12,
		};

		// What a worker computes
		const workerConfig = {
			continueOnError: true,
			repetitions: 1,
			seedBase: 42,
			timeoutMs: 300_000,
			collectProvenance: true,
		};

		const mainHash = createHash("sha256")
			.update(JSON.stringify(mainConfig, Object.keys(mainConfig).sort()))
			.digest("hex");

		const workerHash = createHash("sha256")
			.update(JSON.stringify(workerConfig, Object.keys(workerConfig).sort()))
			.digest("hex");

		console.log("Stored hash:", storedHash);
		console.log("Main process hash:", mainHash);
		console.log("Worker process hash:", workerHash);
		console.log("Main matches stored:", mainHash === storedHash);
		console.log("Worker matches stored:", workerHash === storedHash);

		// The stored hash matches main process (with concurrency=12)
		assert.strictEqual(mainHash, storedHash);

		// Worker hash differs (no concurrency property)
		assert.notStrictEqual(workerHash, storedHash);

		// This proves workers will always have hash mismatch!
	});
});
