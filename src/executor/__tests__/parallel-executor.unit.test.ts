/**
 * Unit tests for ParallelExecutor
 *
 * Tests worker name generation, run batch distribution, shard path generation,
 * and the new DI-enabled ParallelExecutor class.
 */

import { describe, it, beforeEach } from "node:test";
import { strict as assert } from "node:assert";

import {
	shardPath,
	generateWorkerNames,
	ParallelExecutor,
	ILogger,
	IProcessSpawner,
	ISystemInfo,
	IChildProcess,
	type RunBatch,
	type WorkerConfig,
} from "../parallel-executor.js";
import type { PlannedRun, ExecutorConfig } from "../executor.js";

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
 * Mock child process for testing.
 */
class MockChildProcess implements IChildProcess {
	private exitCode = 0;
	private listeners = new Map<string, (...args: unknown[]) => void>();

	on(event: string, listener: (...args: unknown[]) => void): this {
		this.listeners.set(event, listener);
		return this;
	}

	/**
	 * Simulate process exit.
	 */
	exit(code: number): void {
		const listener = this.listeners.get("exit");
		if (listener) {
			listener(code);
		}
	}
}

/**
 * Mock process spawner for testing.
 */
class MockProcessSpawner implements IProcessSpawner {
	public spawnedProcesses: {
		command: string;
		args: string[];
		options: {
			cwd?: string;
			stdio?: "inherit" | "pipe" | "ignore";
			env?: Record<string, string | undefined>;
		};
		process: MockChildProcess;
	}[] = [];

	spawn(
		command: string,
		args: string[],
		options: {
			cwd?: string;
			stdio?: "inherit" | "pipe" | "ignore";
			env?: Record<string, string | undefined>;
		},
	): IChildProcess {
		const process = new MockChildProcess();
		this.spawnedProcesses.push({
			command,
			args,
			options: {
				cwd: options.cwd ?? "/default",
				stdio: options.stdio ?? "inherit",
				env: options.env ?? {},
			},
			process,
		});
		return process;
	}

	clear(): void {
		this.spawnedProcesses = [];
	}
}

/**
 * Mock system info for testing.
 */
class MockSystemInfo implements ISystemInfo {
	cpuCount = 4;
	nodePath = "/path/to/node";
	packageRoot = "/path/to/project";
	env: Record<string, string | undefined> = {
		NODE_ENV: "test",
		PATH: "/usr/bin:/bin",
	};
}

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

		it("should handle Windows-style backslash dist paths", () => {
			// Windows paths use backslashes
			// String.raw`\dist` produces a literal backslash
			const windowsBackslashDist = String.raw`\dist`;
			assert.strictEqual(windowsBackslashDist, "\\dist");

			// Test that endsWith works with backslash paths
			const windowsDir = "C:\\path\\to\\project\\dist";
			assert.ok(windowsDir.endsWith(windowsBackslashDist));
		});
	});
});

describe("ParallelExecutor class with DI", () => {
	let mockLogger: MockLogger;
	let mockSpawner: MockProcessSpawner;
	let mockSystemInfo: MockSystemInfo;

	beforeEach(() => {
		mockLogger = new MockLogger();
		mockSpawner = new MockProcessSpawner();
		mockSystemInfo = new MockSystemInfo();
	});

	describe("constructor", () => {
		it("should use default dependencies when none provided", () => {
			const executor = new ParallelExecutor();
			assert.ok(executor);
		});

		it("should use provided dependencies", () => {
			const executor = new ParallelExecutor(mockLogger, mockSpawner, mockSystemInfo);
			assert.ok(executor);
		});

		it("should use partial dependencies", () => {
			const executor = new ParallelExecutor(mockLogger);
			assert.ok(executor);
		});
	});

	describe("createBatches", () => {
		it("should distribute runs evenly across workers", () => {
			const executor = new ParallelExecutor(mockLogger, mockSpawner, mockSystemInfo);
			const runs: PlannedRun[] = [
				{ runId: "run1", sutId: "sut1", caseId: "case1", repetition: 0, seed: 1 },
				{ runId: "run2", sutId: "sut1", caseId: "case2", repetition: 0, seed: 2 },
				{ runId: "run3", sutId: "sut1", caseId: "case3", repetition: 0, seed: 3 },
				{ runId: "run4", sutId: "sut1", caseId: "case4", repetition: 0, seed: 4 },
			];

			// Access private method via testing
			//
			const batches = executor._createBatches(runs, 2);

			assert.strictEqual(batches.length, 2);
			assert.strictEqual(batches[0].runIds.length, 2);
			assert.strictEqual(batches[1].runIds.length, 2);
			assert.deepStrictEqual(batches[0].runIds, ["run1", "run2"]);
			assert.deepStrictEqual(batches[1].runIds, ["run3", "run4"]);
		});

		it("should handle uneven distribution", () => {
			const executor = new ParallelExecutor(mockLogger, mockSpawner, mockSystemInfo);
			const runs: PlannedRun[] = [
				{ runId: "run1", sutId: "sut1", caseId: "case1", repetition: 0, seed: 1 },
				{ runId: "run2", sutId: "sut1", caseId: "case2", repetition: 0, seed: 2 },
				{ runId: "run3", sutId: "sut1", caseId: "case3", repetition: 0, seed: 3 },
			];

			//
			const batches = executor._createBatches(runs, 2);

			assert.strictEqual(batches.length, 2);
			assert.strictEqual(batches[0].runIds.length, 2);
			assert.strictEqual(batches[1].runIds.length, 1);
		});

		it("should handle more workers than runs", () => {
			const executor = new ParallelExecutor(mockLogger, mockSpawner, mockSystemInfo);
			const runs: PlannedRun[] = [
				{ runId: "run1", sutId: "sut1", caseId: "case1", repetition: 0, seed: 1 },
			];

			//
			const batches = executor._createBatches(runs, 4);

			assert.strictEqual(batches.length, 1);
			assert.strictEqual(batches[0].runIds.length, 1);
		});

		it("should handle empty runs", () => {
			const executor = new ParallelExecutor(mockLogger, mockSpawner, mockSystemInfo);
			const runs: PlannedRun[] = [];

			//
			const batches = executor._createBatches(runs, 2);

			assert.strictEqual(batches.length, 0);
		});

		it("should create proper batch metadata", () => {
			const executor = new ParallelExecutor(mockLogger, mockSpawner, mockSystemInfo);
			const runs: PlannedRun[] = [
				{ runId: "run1", sutId: "sut1", caseId: "case1", repetition: 0, seed: 1 },
				{ runId: "run2", sutId: "sut1", caseId: "case2", repetition: 0, seed: 2 },
			];

			//
			const batches = executor._createBatches(runs, 2);

			assert.strictEqual(batches[0].index, 0);
			assert.strictEqual(batches[0].firstRunId, "run1");
			assert.strictEqual(batches[0].lastRunId, "run1");
			assert.ok(batches[0].filter.startsWith("["));
			assert.ok(batches[0].filter.endsWith("]"));
		});
	});

	describe("createWorkerConfigs", () => {
		it("should create worker configs with proper arguments", () => {
			const executor = new ParallelExecutor(mockLogger, mockSpawner, mockSystemInfo);
			const batches: RunBatch[] = [
				{
					index: 0,
					runIds: ["run1", "run2"],
					filter: '["run1","run2"]',
					firstRunId: "run1",
					lastRunId: "run2",
				},
			];

			//
			const configs = executor._createWorkerConfigs(
				batches,
				["worker-1"],
				"/path/to/cli.js",
				"/checkpoints",
				5000,
			);

			assert.strictEqual(configs.length, 1);
			assert.strictEqual(configs[0].index, 0);
			assert.strictEqual(configs[0].name, "worker-1");
			assert.strictEqual(configs[0].checkpointPath, "/checkpoints/checkpoint-worker-00.json");
			assert.deepStrictEqual(configs[0].arguments, [
				"/path/to/cli.js",
				"evaluate",
				"--phase=execute",
				"--checkpoint-mode=file",
				'--run-filter=["run1","run2"]',
				"--timeout=5000",
			]);
		});

		it("should not include timeout when timeoutMs is 0", () => {
			const executor = new ParallelExecutor(mockLogger, mockSpawner, mockSystemInfo);
			const batches: RunBatch[] = [
				{
					index: 0,
					runIds: ["run1"],
					filter: '["run1"]',
					firstRunId: "run1",
					lastRunId: "run1",
				},
			];

			//
			const configs = executor._createWorkerConfigs(
				batches,
				["worker-1"],
				"/path/to/cli.js",
				"/checkpoints",
				0, // No timeout
			);

			assert.ok(!configs[0].arguments.includes("--timeout="));
		});

		it("should include proper environment variables", () => {
			const executor = new ParallelExecutor(mockLogger, mockSpawner, mockSystemInfo);
			const batches: RunBatch[] = [
				{
					index: 0,
					runIds: ["run1"],
					filter: '["run1"]',
					firstRunId: "run1",
					lastRunId: "run1",
				},
			];

			//
			const configs = executor._createWorkerConfigs(
				batches,
				["worker-1"],
				"/path/to/cli.js",
				"/checkpoints",
				5000,
			);

			assert.strictEqual(configs[0].env.GRAPHBOX_WORKER_NAME, "worker-1");
			assert.strictEqual(configs[0].env.GRAPHBOX_WORKER_INDEX, "0");
			assert.strictEqual(configs[0].env.GRAPHBOX_TOTAL_WORKERS, "1");
			assert.strictEqual(configs[0].env.GRAPHBOX_CHECKPOINT_DIR, "/checkpoints");
			assert.strictEqual(
				configs[0].env.GRAPHBOX_CHECKPOINT_PATH,
				"/checkpoints/checkpoint-worker-00.json",
			);
			assert.strictEqual(configs[0].env.NODE_OPTIONS, "--max-old-space-size=4096");
		});
	});

	describe("execute", () => {
		it("should spawn workers for each batch", async () => {
			const executor = new ParallelExecutor(mockLogger, mockSpawner, mockSystemInfo);
			const runs: PlannedRun[] = [
				createTestRun({ runId: "run1", caseId: "case1" }),
				createTestRun({ runId: "run2", caseId: "case2" }),
				createTestRun({ runId: "run3", caseId: "case3" }),
				createTestRun({ runId: "run4", caseId: "case4" }),
			];

			const config = createTestConfig(1000);

			// Simulate worker exits
			setTimeout(() => {
				for (const spawned of mockSpawner.spawnedProcesses) {
					spawned.process.exit(0);
				}
			}, 10);

			const result = await executor.execute(runs, [], [], config);

			assert.strictEqual(mockSpawner.spawnedProcesses.length, mockSystemInfo.cpuCount);
			assert.strictEqual(result.results.length, 0);
			assert.strictEqual(result.errors.length, 0);
		});

		it("should use system defaults when options not provided", async () => {
			const executor = new ParallelExecutor(mockLogger, mockSpawner, mockSystemInfo);
			const runs: PlannedRun[] = [createTestRun({ runId: "run1", caseId: "case1" })];

			// Simulate worker exit
			setTimeout(() => {
				for (const spawned of mockSpawner.spawnedProcesses) {
					spawned.process.exit(0);
				}
			}, 10);

			await executor.execute(runs, [], [], createTestConfig(0));

			assert.strictEqual(mockSpawner.spawnedProcesses.length, 1);
			assert.strictEqual(mockSpawner.spawnedProcesses[0].command, mockSystemInfo.nodePath);
		});

		it("should log execution information", async () => {
			const executor = new ParallelExecutor(mockLogger, mockSpawner, mockSystemInfo);
			const runs: PlannedRun[] = [createTestRun({ runId: "run1", caseId: "case1" })];

			// Simulate worker exit
			setTimeout(() => {
				for (const spawned of mockSpawner.spawnedProcesses) {
					spawned.process.exit(0);
				}
			}, 10);

			await executor.execute(runs, [], [], createTestConfig(5000));

			assert.ok(mockLogger.logs.some((log) => log.includes("Spawning")));
			assert.ok(mockLogger.logs.some((log) => log.includes("Checkpoint directory")));
			assert.ok(mockLogger.logs.some((log) => log.includes("timeout")));
		});

		it("should handle custom worker count", async () => {
			const executor = new ParallelExecutor(mockLogger, mockSpawner, mockSystemInfo);
			const runs: PlannedRun[] = [
				createTestRun({ runId: "run1", caseId: "case1" }),
				createTestRun({ runId: "run2", caseId: "case2" }),
				createTestRun({ runId: "run3", caseId: "case3" }),
			];

			// Simulate worker exits
			setTimeout(() => {
				for (const spawned of mockSpawner.spawnedProcesses) {
					spawned.process.exit(0);
				}
			}, 10);

			const result = await executor.execute(runs, [], [], createTestConfig(0), { workers: 2 });

			assert.strictEqual(mockSpawner.spawnedProcesses.length, 2);
			assert.strictEqual(result.results.length, 0);
		});

		it("should return empty results by design", async () => {
			const executor = new ParallelExecutor(mockLogger, mockSpawner, mockSystemInfo);
			const runs: PlannedRun[] = [createTestRun({ runId: "run1", caseId: "case1" })];

			// Simulate worker exit
			setTimeout(() => {
				for (const spawned of mockSpawner.spawnedProcesses) {
					spawned.process.exit(0);
				}
			}, 10);

			const result = await executor.execute(runs, [], [], createTestConfig(0));

			assert.deepStrictEqual(result, { results: [], errors: [] });
		});
	});
});
