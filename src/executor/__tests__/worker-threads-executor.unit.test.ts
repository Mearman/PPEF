/**
 * Unit tests for WorkerThreadsExecutor
 *
 * Tests worker thread spawning, message passing, batch distribution,
 * and the new DI-enabled WorkerThreadsExecutor class.
 */

import { describe, it, beforeEach } from "node:test";
import { strict as assert } from "node:assert";

import {
	WorkerThreadsExecutor,
	type ILogger,
	type IWorker,
	type IWorkerFactory,
	type IWorkerEntryPath,
	type RunBatch,
	ConsoleLogger,
	type WorkerThreadsExecutorOptions,
} from "../worker-threads-executor.js";
import type { PlannedRun, ExecutorConfig } from "../executor.js";
import type {
	WorkerMessage,
	WorkerOutputMessage,
	WorkerSuccessMessage,
} from "../worker-executor.js";
import type { EvaluationResult } from "../../types/result.js";

/**
 * Create a minimal ExecutorConfig for testing.
 */
function createTestConfig(timeoutMs = 0): ExecutorConfig {
	return {
		continueOnError: false,
		repetitions: 1,
		seedBase: 42,
		timeoutMs,
		collectProvenance: false,
	};
}

/**
 * Create a minimal PlannedRun for testing.
 */
function createTestRun(override: Partial<PlannedRun> & { runId: string }): PlannedRun {
	return {
		sutId: "test-sut",
		caseId: "test-case",
		repetition: 0,
		seed: 42,
		...override,
	};
}

/**
 * Mock logger for testing.
 */
class MockLogger implements ILogger {
	public logs: string[] = [];

	log(message: string): void {
		this.logs.push(message);
	}

	debug(message: string): void {
		this.logs.push(message);
	}

	info(message: string): void {
		this.logs.push(message);
	}

	warn(message: string): void {
		this.logs.push(message);
	}

	clear(): void {
		this.logs = [];
	}
}

/**
 * Mock worker for testing.
 */
class MockWorker {
	private messageListener: ((data: WorkerOutputMessage) => void) | null = null;
	private errorListener: ((error: Error) => void) | null = null;

	postMessage(_message: WorkerMessage): void {
		// Simulate async response
		setTimeout(() => {
			if (this.messageListener) {
				const response: WorkerSuccessMessage = {
					type: "done",
					results: [],
					errors: [],
				};
				this.messageListener(response);
			}
		}, 10);
	}

	on(event: "message" | "error", listener: (data: WorkerOutputMessage | Error) => void): void {
		if (event === "message") {
			this.messageListener = listener;
		} else {
			this.errorListener = listener;
		}
	}

	async terminate(): Promise<number> {
		// Mock terminate - return exit code
		return 0;
	}
}

/**
 * Mock worker factory for testing.
 */
class MockWorkerFactory {
	public createdWorkers: MockWorker[] = [];

	create(_workerPath: string): MockWorker {
		const worker = new MockWorker();
		this.createdWorkers.push(worker);
		return worker;
	}

	clear(): void {
		this.createdWorkers = [];
	}
}

/**
 * Mock worker entry path for testing.
 */
class MockWorkerEntryPath implements IWorkerEntryPath {
	getWorkerEntryPath(): string {
		return "/mock/worker-entry.js";
	}
}

describe("WorkerThreadsExecutor", () => {
	let mockLogger: MockLogger;
	let mockWorkerFactory: MockWorkerFactory;
	let mockWorkerEntryPath: MockWorkerEntryPath;

	beforeEach(() => {
		mockLogger = new MockLogger();
		mockWorkerFactory = new MockWorkerFactory();
		mockWorkerEntryPath = new MockWorkerEntryPath();
	});

	describe("constructor", () => {
		it("should use default dependencies when none provided", () => {
			const executor = new WorkerThreadsExecutor();
			assert.ok(executor);
		});

		it("should use provided dependencies", () => {
			const executor = new WorkerThreadsExecutor({
				logger: mockLogger,
				workerFactory: mockWorkerFactory as never,
				workerEntryPath: mockWorkerEntryPath,
			});
			assert.ok(executor);
		});

		it("should use partial dependencies", () => {
			const executor = new WorkerThreadsExecutor({
				logger: mockLogger,
			});
			assert.ok(executor);
		});
	});

	describe("_createBatches", () => {
		it("should distribute runs evenly across workers", () => {
			const executor = new WorkerThreadsExecutor({
				logger: mockLogger,
				workerFactory: mockWorkerFactory as never,
				workerEntryPath: mockWorkerEntryPath,
			});
			const runs: PlannedRun[] = [
				createTestRun({ runId: "run1", caseId: "case1" }),
				createTestRun({ runId: "run2", caseId: "case2" }),
				createTestRun({ runId: "run3", caseId: "case3" }),
				createTestRun({ runId: "run4", caseId: "case4" }),
			];

			// Access private method via testing
			const batches = (
				executor as unknown as {
					_createBatches: (runs: PlannedRun[], numberWorkers: number) => RunBatch[];
				}
			)._createBatches(runs, 2);

			assert.strictEqual(batches.length, 2);
			assert.strictEqual(batches[0].runIds.length, 2);
			assert.strictEqual(batches[1].runIds.length, 2);
			assert.deepStrictEqual(batches[0].runIds, ["run1", "run2"]);
			assert.deepStrictEqual(batches[1].runIds, ["run3", "run4"]);
		});

		it("should handle uneven distribution", () => {
			const executor = new WorkerThreadsExecutor({
				logger: mockLogger,
				workerFactory: mockWorkerFactory as never,
				workerEntryPath: mockWorkerEntryPath,
			});
			const runs: PlannedRun[] = [
				createTestRun({ runId: "run1", caseId: "case1" }),
				createTestRun({ runId: "run2", caseId: "case2" }),
				createTestRun({ runId: "run3", caseId: "case3" }),
			];

			const batches = (
				executor as unknown as {
					_createBatches: (runs: PlannedRun[], numberWorkers: number) => RunBatch[];
				}
			)._createBatches(runs, 2);

			assert.strictEqual(batches.length, 2);
			assert.strictEqual(batches[0].runIds.length, 2);
			assert.strictEqual(batches[1].runIds.length, 1);
		});

		it("should handle more workers than runs", () => {
			const executor = new WorkerThreadsExecutor({
				logger: mockLogger,
				workerFactory: mockWorkerFactory as never,
				workerEntryPath: mockWorkerEntryPath,
			});
			const runs: PlannedRun[] = [createTestRun({ runId: "run1", caseId: "case1" })];

			const batches = (
				executor as unknown as {
					_createBatches: (runs: PlannedRun[], numberWorkers: number) => RunBatch[];
				}
			)._createBatches(runs, 4);

			assert.strictEqual(batches.length, 1);
			assert.strictEqual(batches[0].runIds.length, 1);
		});

		it("should handle empty runs", () => {
			const executor = new WorkerThreadsExecutor({
				logger: mockLogger,
				workerFactory: mockWorkerFactory as never,
				workerEntryPath: mockWorkerEntryPath,
			});
			const runs: PlannedRun[] = [];

			const batches = (
				executor as unknown as {
					_createBatches: (runs: PlannedRun[], numberWorkers: number) => RunBatch[];
				}
			)._createBatches(runs, 2);

			assert.strictEqual(batches.length, 0);
		});

		it("should create proper batch metadata", () => {
			const executor = new WorkerThreadsExecutor({
				logger: mockLogger,
				workerFactory: mockWorkerFactory as never,
				workerEntryPath: mockWorkerEntryPath,
			});
			const runs: PlannedRun[] = [
				createTestRun({ runId: "run1", caseId: "case1" }),
				createTestRun({ runId: "run2", caseId: "case2" }),
			];

			const batches = (
				executor as unknown as {
					_createBatches: (runs: PlannedRun[], numberWorkers: number) => RunBatch[];
				}
			)._createBatches(runs, 2);

			assert.strictEqual(batches[0].index, 0);
			assert.strictEqual(batches[0].firstRunId, "run1");
			assert.strictEqual(batches[0].lastRunId, "run1");
		});
	});

	describe("WorkerThreadsExecutorOptions", () => {
		describe("defaults", () => {
			it("should use default workers when not specified", () => {
				const options: WorkerThreadsExecutorOptions = {};
				const executor = new WorkerThreadsExecutor(options);

				assert.ok(executor);
			});

			it("should use custom workers when specified", () => {
				const options: WorkerThreadsExecutorOptions = { workers: 4 };
				const executor = new WorkerThreadsExecutor(options);

				assert.ok(executor);
			});

			it("should accept resource limits", () => {
				const options: WorkerThreadsExecutorOptions = {
					workers: 2,
					maxMemoryMb: 2048,
					maxConcurrentIo: 50,
				};
				const executor = new WorkerThreadsExecutor(options);

				assert.ok(executor);
			});
		});
	});

	describe("ConsoleLogger", () => {
		it("should provide console-based logging", () => {
			const logger = new ConsoleLogger();

			// These should not throw
			logger.log("test log");
			logger.debug("test debug");
			logger.info("test info");
			logger.warn("test warn");

			assert.ok(true);
		});
	});

	describe("WorkerEntryPath", () => {
		it("should return path to worker entry", () => {
			const pathResolver = new MockWorkerEntryPath();
			const path = pathResolver.getWorkerEntryPath();

			assert.strictEqual(path, "/mock/worker-entry.js");
		});
	});
});

describe("WorkerThreadsExecutor integration", () => {
	it("should spawn workers for each batch", async () => {
		const mockLogger = new MockLogger();
		const mockWorkerFactory = new MockWorkerFactory();
		const mockWorkerEntryPath = new MockWorkerEntryPath();

		const executor = new WorkerThreadsExecutor({
			logger: mockLogger,
			workerFactory: mockWorkerFactory as never,
			workerEntryPath: mockWorkerEntryPath,
		});

		const runs: PlannedRun[] = [
			createTestRun({ runId: "run1", caseId: "case1" }),
			createTestRun({ runId: "run2", caseId: "case2" }),
		];

		const config = createTestConfig(0);

		const result = await executor.execute(runs, [], [], config, { workers: 2 });

		// Should have spawned 2 workers
		assert.strictEqual(mockWorkerFactory.createdWorkers.length, 2);
		assert.strictEqual(result.results.length, 0);
		assert.strictEqual(result.errors.length, 0);
	});
});
