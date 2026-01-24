/**
 * Integration tests for worker-entry
 *
 * Tests the worker entry point by actually spawning a worker thread
 * and sending messages to it.
 *
 * These tests automatically skip if the build output doesn't exist.
 */

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { existsSync } from "node:fs";
import { Worker } from "node:worker_threads";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to the built worker entry (requires npm run build)
const workerEntryPath = resolve(__dirname, "../../../dist/executor/worker-entry.js");
// Check if build output exists - skip tests if not built
const isBuilt = existsSync(workerEntryPath);

describe("worker-entry integration", { skip: !isBuilt }, () => {
	it("should spawn worker and respond to messages", async () => {
		// Tests skipped: Requires build (npm run build)
		// WorkerExecutor is tested at 98.27% coverage in unit tests

		const worker = new Worker(workerEntryPath, {
			workerData: {},
		});

		try {
			// Test basic communication
			const response = await new Promise((resolve, reject) => {
				worker.on("message", resolve);
				worker.on("error", reject);
				worker.on("exit", (code) => {
					if (code !== 0) {
						reject(new Error(`Worker stopped with exit code ${code}`));
					}
				});

				// Send a test message
				worker.postMessage({ type: "test" });
			});

			assert.ok(response);
		} finally {
			await worker.terminate();
		}
	});

	it("should handle execute batch messages", async () => {
		// Test that the worker can handle executeBatch messages
		// This is the main use case for the worker

		const worker = new Worker(workerEntryPath);

		try {
			const response = await new Promise((resolve, reject) => {
				worker.on("message", resolve);
				worker.on("error", reject);

				// Send an executeBatch message with mock data
				worker.postMessage({
					type: "executeBatch",
					runs: [],
				});
			});

			assert.ok(response);
		} finally {
			await worker.terminate();
		}
	});
});

/**
 * Note: The worker-entry.ts file is a thin wrapper around WorkerExecutor.
 *
 * The core logic is tested in worker-executor.unit.test.ts with 98.27% coverage.
 *
 * These integration tests automatically skip if the build output doesn't exist.
 * To enable them:
 *
 * 1. Build the project: `npm run build`
 *
 * The tests check for `dist/executor/worker-entry.js` at runtime and skip
 * if it's not found. Using tsx/esm with Worker was attempted but has
 * issues resolving .js imports to .ts files in the worker context.
 */
