/**
 * Parallel executor using child processes.
 *
 * Spawns multiple Node.js processes, each executing a subset of runs.
 * Each worker writes to its own sharded checkpoint file to avoid race conditions.
 *
 * Sharded checkpoint files:
 *   results/execute/checkpoint-worker-00.json
 *   results/execute/checkpoint-worker-01.json
 *   ...
 *
 * Dependency Injection:
 * - Logger interface enables testing of log output
 * - ProcessSpawner interface enables mocking spawn() calls
 * - SystemInfo interface enables testing CPU count and node path logic
 */

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { cpus } from "node:os";
import { dirname, resolve } from "node:path";

import type { EvaluationResult } from "../types/result.js";
import type { ExecutorConfig, PlannedRun } from "./executor.js";

/**
 * Logger interface for output handling.
 * Enables testing of log messages.
 */
export interface ILogger {
	log(message: string): void;
	debug(message: string): void;
	info(message: string): void;
	warn(message: string): void;
}

/**
 * Production logger using console.
 */
export class ConsoleLogger implements ILogger {
	log(message: string): void {
		console.log(message);
	}

	debug(message: string): void {
		console.log(message);
	}

	info(message: string): void {
		console.log(message);
	}

	warn(message: string): void {
		console.warn(message);
	}
}

/**
 * Spawn options matching child_process.spawn signature.
 */
export interface SpawnOptions {
	cwd?: string;
	stdio?: "inherit" | "pipe" | "ignore";
	env?: Record<string, string | undefined>;
}

/**
 * Child process interface.
 * Abstraction over Node.js ChildProcess.
 */
export interface IChildProcess {
	on(event: string, listener: (...args: unknown[]) => void): void;
}

/**
 * Process spawner interface.
 * Enables mocking of spawn() for testing.
 */
export interface IProcessSpawner {
	spawn(command: string, args: string[], options: SpawnOptions): IChildProcess;
}

/**
 * Production process spawner using node:child_process.
 */
export class ProcessSpawner implements IProcessSpawner {
	spawn(command: string, args: string[], options: SpawnOptions): IChildProcess {
		return spawn(command, args, options) as unknown as IChildProcess;
	}
}

/**
 * System information interface.
 * Enables testing of CPU count and node path logic.
 */
export interface ISystemInfo {
	/** Number of CPU cores available */
	cpuCount: number;

	/** Path to the Node.js executable */
	nodePath: string;

	/** Package root directory */
	packageRoot: string;

	/** Current process environment */
	env: Record<string, string | undefined>;
}

/**
 * Production system info using node:os and process.
 */
export class SystemInfo implements ISystemInfo {
	cpuCount = cpus().length;
	nodePath = process.execPath;
	env = process.env;
	readonly packageRoot: string;

	constructor() {
		this.packageRoot = this.getPackageRoot();
	}

	/**
	 * Get the package root directory by resolving from the entry point script.
	 * The CLI entry point is dist/cli.js, so we go up one level from there.
	 */
	private getPackageRoot(): string {
		// Get the directory containing the entry point script
		// process.argv[1] is the path to the executed script (e.g., /path/to/graphbox/dist/cli.js)
		const entryPoint = process.argv[1];

		// Resolve to absolute path first (handles relative paths like "dist/cli.js")
		const absoluteEntry = resolve(entryPoint);
		const entryDir = dirname(absoluteEntry);

		// If entry point is in dist/, go up one level to get package root
		if (entryDir.endsWith("/dist") || entryDir.endsWith(String.raw`\dist`)) {
			return entryDir.slice(0, -5); // Remove "/dist"
		}

		// Fallback: use current directory
		return process.cwd();
	}
}

export interface ParallelExecutorOptions {
	/** Number of parallel processes (default: CPU count) */
	workers?: number;

	/** Path to node executable */
	nodePath?: string;

	/** Checkpoint directory (defaults to "results/execute") */
	checkpointDir?: string;

	/** Per-run timeout in milliseconds (0 = no timeout) */
	timeoutMs?: number;
}

/**
 * Generate random worker names using tech-themed adjectives.
 * Returns unique names for each worker.
 * @param count
 */
export const generateWorkerNames = (count: number): string[] => {
	const adjectives = [
		"swift",
		"nimble",
		"quick",
		"brisk",
		"speedy",
		"rapid",
		"fast",
		"agile",
		"crisp",
		"snappy",
		"zippy",
		"flash",
		"bolt",
		"dash",
		"zoom",
		"jet",
		"rocket",
		"comet",
		"meteor",
		"star",
		"nova",
		"spark",
		"flare",
		"blaze",
		"quantum",
		"cyber",
		"digital",
		"pixel",
		"byte",
		"bit",
		"logic",
		"circuit",
	];
	const nouns = [
		"runner",
		"worker",
		"processor",
		"executor",
		"cruncher",
		"solver",
		"engine",
		"motor",
		"driver",
		"pilot",
		"agent",
		"bot",
		"node",
		"core",
	];

	// Generate unique names using random adjectives + nouns + hex suffix
	const usedNames = new Set<string>();
	const names: string[] = [];

	while (names.length < count) {
		const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
		const noun = nouns[Math.floor(Math.random() * nouns.length)];
		const suffix = randomBytes(2).toString("hex");
		const name = `${adj}-${noun}-${suffix}`;

		if (!usedNames.has(name)) {
			usedNames.add(name);
			names.push(name);
		}
	}

	return names;
};

/**
 * Generate sharded checkpoint path for a worker.
 *
 * @param checkpointDir - Base checkpoint directory
 * @param workerIndex - Worker index (0-based)
 * @returns Path to the worker's checkpoint file
 */
export const shardPath = (checkpointDir: string, workerIndex: number): string =>
	resolve(checkpointDir, `checkpoint-worker-${String(workerIndex).padStart(2, "0")}.json`);

/**
 * Batch of runs for a worker.
 */
export interface RunBatch {
	/** Batch index */
	index: number;

	/** Run IDs in this batch */
	runIds: string[];

	/** JSON filter string for CLI */
	filter: string;

	/** First run ID in batch */
	firstRunId: string;

	/** Last run ID in batch */
	lastRunId: string;
}

/**
 * Worker configuration.
 */
export interface WorkerConfig {
	/** Worker index */
	index: number;

	/** Worker name */
	name: string;

	/** Checkpoint path for this worker */
	checkpointPath: string;

	/** CLI arguments */
	arguments: string[];

	/** Environment variables */
	env: Record<string, string | undefined>;
}

/**
 * Parallel executor class with dependency injection.
 *
 * Spawns multiple Node.js processes, each executing a subset of runs.
 * Each worker writes to its own sharded checkpoint file to avoid race conditions.
 */
export class ParallelExecutor {
	private readonly logger: ILogger;
	private readonly spawner: IProcessSpawner;
	private readonly systemInfo: ISystemInfo;

	constructor(logger?: ILogger, spawner?: IProcessSpawner, systemInfo?: ISystemInfo) {
		this.logger = logger ?? new ConsoleLogger();
		this.spawner = spawner ?? new ProcessSpawner();
		this.systemInfo = systemInfo ?? new SystemInfo();
	}

	/**
	 * Split runs into batches for parallel processing.
	 * @param runs - Runs to distribute
	 * @param numberWorkers - Number of worker processes
	 * @returns Array of run batches
	 */
	_createBatches(runs: PlannedRun[], numberWorkers: number): RunBatch[] {
		const batchSize = Math.ceil(runs.length / numberWorkers);
		const batches: RunBatch[] = [];

		for (let i = 0; i < runs.length; i += batchSize) {
			const batch = runs.slice(i, i + batchSize);
			const batchIndex = Math.floor(i / batchSize);
			const runIds = new Set(batch.map((r) => r.runId));

			batches.push({
				index: batchIndex,
				runIds: [...runIds],
				filter: JSON.stringify([...runIds]),
				firstRunId: batch[0]?.runId ?? "none",
				lastRunId: batch.at(-1)?.runId ?? "none",
			});
		}

		return batches;
	}

	/**
	 * Create worker configurations for all batches.
	 * @param batches - Run batches
	 * @param workerNames - Names for each worker
	 * @param cliPath - Path to CLI entry point
	 * @param checkpointDir - Base checkpoint directory
	 * @param timeoutMs - Per-run timeout in milliseconds
	 * @returns Array of worker configurations
	 */
	_createWorkerConfigs(
		batches: RunBatch[],
		workerNames: string[],
		cliPath: string,
		checkpointDir: string,
		timeoutMs: number,
	): WorkerConfig[] {
		return batches.map((batch) => {
			const workerName = workerNames[batch.index];
			const workerCheckpointPath = shardPath(checkpointDir, batch.index);

			const arguments_ = [
				cliPath,
				"evaluate",
				"--phase=execute",
				"--checkpoint-mode=file",
				`--run-filter=${batch.filter}`,
			];

			// Add timeout if specified
			if (timeoutMs > 0) {
				arguments_.push(`--timeout=${timeoutMs}`);
			}

			return {
				index: batch.index,
				name: workerName,
				checkpointPath: workerCheckpointPath,
				arguments: arguments_,
				env: {
					...this.systemInfo.env,
					NODE_OPTIONS: "--max-old-space-size=4096",
					GRAPHBOX_WORKER_NAME: workerName,
					GRAPHBOX_WORKER_INDEX: batch.index.toString(),
					GRAPHBOX_TOTAL_WORKERS: batches.length.toString(),
					GRAPHBOX_CHECKPOINT_DIR: checkpointDir,
					GRAPHBOX_CHECKPOINT_PATH: workerCheckpointPath,
				},
			};
		});
	}

	/**
	 * Spawn worker processes for all configurations.
	 * @param workerConfigs - Worker configurations
	 * @param nodePath - Path to node executable
	 * @param packageRoot - Package root directory
	 * @returns Array of child processes
	 */
	_spawnWorkers(
		workerConfigs: WorkerConfig[],
		nodePath: string,
		packageRoot: string,
	): IChildProcess[] {
		return workerConfigs.map((config) => {
			this.logger.debug(
				`Spawning worker ${config.index}: ${config.name} with ${config.arguments.length} args`,
			);

			return this.spawner.spawn(nodePath, config.arguments, {
				stdio: "inherit",
				cwd: packageRoot,
				env: config.env,
			});
		});
	}

	/**
	 * Wait for all workers to complete.
	 * @param workers - Child processes
	 * @returns Promise that resolves when all workers exit
	 */
	async _waitForWorkers(workers: IChildProcess[]): Promise<number[]> {
		return Promise.all(
			workers.map(
				(w) =>
					new Promise<number>((resolve) => {
						w.on("exit", (code) => {
							resolve(code as number);
						});
					}),
			),
		);
	}

	/**
	 * Execute runs using multiple parallel processes.
	 *
	 * Each worker writes to its own sharded checkpoint file to avoid race conditions.
	 * After all workers complete, the main process should merge the shards.
	 *
	 * @param runs - Planned runs to execute
	 * @param suts - SUT definitions (not used directly, passed to workers)
	 * @param cases - Case definitions (not used directly, passed to workers)
	 * @param config - Executor configuration
	 * @param options - Parallel executor options
	 * @returns Execution results (empty - CLI will load from shards)
	 */
	async execute(
		runs: PlannedRun[],
		_suts: unknown,
		_cases: unknown[],
		config: ExecutorConfig & { onResult?: (result: EvaluationResult) => void },
		options: ParallelExecutorOptions = {},
	): Promise<{ results: EvaluationResult[]; errors: { runId: string; error: string }[] }> {
		const numberWorkers = options.workers ?? this.systemInfo.cpuCount;
		const nodePath = options.nodePath ?? this.systemInfo.nodePath;
		const checkpointDir =
			options.checkpointDir ?? resolve(this.systemInfo.packageRoot, "results/execute");
		const timeoutMs = options.timeoutMs ?? config.timeoutMs;

		this.logger.info(
			`ParallelExecutor: Spawning ${numberWorkers} processes for ${runs.length} runs`,
		);
		this.logger.info(`Checkpoint directory: ${checkpointDir}`);
		if (timeoutMs > 0) {
			this.logger.info(`Per-run timeout: ${timeoutMs}ms (${Math.round(timeoutMs / 1000)}s)`);
		}

		// Generate unique names for each worker
		const workerNames = generateWorkerNames(numberWorkers);
		this.logger.info(
			`Workers: ${workerNames.map((name, index) => `${index + 1}. ${name}`).join(", ")}`,
		);

		// Split runs into batches
		const batches = this._createBatches(runs, numberWorkers);

		// Log batch information
		for (const batch of batches) {
			this.logger.debug(
				`Batch ${batch.index} has ${batch.runIds.length} runs, filter length: ${batch.filter.length}`,
			);
			this.logger.debug(`  First run: ${batch.firstRunId}, Last run: ${batch.lastRunId}`);
		}

		// Create worker configurations
		const cliPath = resolve(this.systemInfo.packageRoot, "dist/cli.js");
		const workerConfigs = this._createWorkerConfigs(
			batches,
			workerNames,
			cliPath,
			checkpointDir,
			timeoutMs,
		);

		// Spawn worker processes
		const workers = this._spawnWorkers(workerConfigs, nodePath, this.systemInfo.packageRoot);

		// Wait for all workers to complete
		const exitCodes = await this._waitForWorkers(workers);

		this.logger.debug(`All workers exited with codes: ${exitCodes.join(", ")}`);

		// Load and return aggregated results
		// For now, return empty - the CLI will handle results and merge shards
		return { results: [], errors: [] };
	}
}

/**
 * Execute runs using multiple parallel processes.
 *
 * Each worker writes to its own sharded checkpoint file to avoid race conditions.
 * After all workers complete, the main process should merge the shards.
 *
 * This is a convenience function that creates a ParallelExecutor with default dependencies.
 * For testing or custom behavior, use the ParallelExecutor class directly.
 *
 * @param runs - Planned runs to execute
 * @param suts - SUT definitions (not used directly, passed to workers)
 * @param cases - Case definitions (not used directly, passed to workers)
 * @param config - Executor configuration
 * @param options - Parallel executor options
 * @returns Execution results (empty - CLI will load from shards)
 */
export const executeParallel = async (
	runs: PlannedRun[],
	suts: unknown,
	cases: unknown[],
	config: ExecutorConfig & { onResult?: (result: EvaluationResult) => void },
	options: ParallelExecutorOptions = {},
): Promise<{ results: EvaluationResult[]; errors: { runId: string; error: string }[] }> => {
	const executor = new ParallelExecutor();
	return executor.execute(runs, suts, cases, config, options);
};
