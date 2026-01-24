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
 */

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { cpus } from "node:os";
import { dirname, resolve } from "node:path";

import type { EvaluationResult } from "../types/result.js";
import type { ExecutorConfig, PlannedRun } from "./executor.js";

/**
 * Get the package root directory by resolving from the entry point script.
 * The CLI entry point is dist/cli.js, so we go up one level from there.
 */
const getPackageRoot = (): string => {
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
};

const PACKAGE_ROOT = getPackageRoot();

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
 */
export const executeParallel = async (
	runs: PlannedRun[],
	suts: unknown,
	cases: unknown[],
	config: ExecutorConfig & { onResult?: (result: EvaluationResult) => void },
	options: ParallelExecutorOptions = {},
): Promise<{ results: EvaluationResult[]; errors: { runId: string; error: string }[] }> => {
	const numberWorkers = options.workers ?? cpus().length;
	const nodePath = options.nodePath ?? process.execPath;
	const checkpointDir = options.checkpointDir ?? resolve(PACKAGE_ROOT, "results/execute");
	const timeoutMs = options.timeoutMs ?? config.timeoutMs;

	console.log(`ParallelExecutor: Spawning ${numberWorkers} processes for ${runs.length} runs`);
	console.log(`Checkpoint directory: ${checkpointDir}`);
	if (timeoutMs > 0) {
		console.log(`Per-run timeout: ${timeoutMs}ms (${Math.round(timeoutMs / 1000)}s)`);
	}

	// Generate unique names for each worker
	const workerNames = generateWorkerNames(numberWorkers);
	console.log(`Workers: ${workerNames.map((name, index) => `${index + 1}. ${name}`).join(", ")}`);

	// Split runs into batches
	const batchSize = Math.ceil(runs.length / numberWorkers);
	const batches: PlannedRun[][] = [];
	for (let index = 0; index < runs.length; index += batchSize) {
		batches.push(runs.slice(index, index + batchSize));
	}

	// Create a run filter function for each batch
	const runFilters = batches.map((batch, _index) => {
		const runIds = new Set(batch.map((r) => r.runId));
		const filter = JSON.stringify([...runIds]);
		const firstRunId = batch[0]?.runId ?? "none";
		const lastRunId = batch.at(-1)?.runId ?? "none";
		console.log(`DEBUG: Batch ${_index} has ${batch.length} runs, filter length: ${filter.length}`);
		console.log(`DEBUG:   First run: ${firstRunId}, Last run: ${lastRunId}`);
		return filter;
	});

	// Spawn worker processes
	const workers = runFilters.map((runFilter, index) => {
		const workerName = workerNames[index];
		const workerCheckpointPath = shardPath(checkpointDir, index);

		const arguments_ = [
			resolve(PACKAGE_ROOT, "dist/cli.js"),
			"evaluate",
			"--phase=execute",
			"--checkpoint-mode=file",
			`--run-filter=${runFilter}`, // JSON array - needs to be quoted in shell but spawn() handles this
		];

		// Add timeout if specified
		if (timeoutMs > 0) {
			arguments_.push(`--timeout=${timeoutMs}`);
		}

		return spawn(nodePath, arguments_, {
			stdio: "inherit",
			cwd: PACKAGE_ROOT, // Ensure workers use the package root as working directory
			env: {
				...process.env,
				NODE_OPTIONS: "--max-old-space-size=4096",
				GRAPHBOX_WORKER_NAME: workerName,
				GRAPHBOX_WORKER_INDEX: index.toString(),
				GRAPHBOX_TOTAL_WORKERS: numberWorkers.toString(),
				GRAPHBOX_CHECKPOINT_DIR: checkpointDir,
				GRAPHBOX_CHECKPOINT_PATH: workerCheckpointPath,
			},
		});
	});

	// Wait for all workers to complete
	await Promise.all(
		workers.map(
			(w) =>
				new Promise((resolve) => {
					w.on("exit", (code) => {
						resolve(code);
					});
				}),
		),
	);

	// Load and return aggregated results
	// For now, return empty - the CLI will handle results and merge shards
	return { results: [], errors: [] };
};
