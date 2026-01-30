/**
 * Worker Threads Executor
 *
 * Executes experiments using Node.js worker threads for parallelism.
 * Each worker runs in isolation, preventing SUT crashes from affecting the main process.
 *
 * Architecture:
 * - Main thread spawns N worker threads (75% of CPU cores by default)
 * - Each worker receives a batch of runs via postMessage
 * - Workers write results to sharded checkpoint files
 * - Main thread merges shards after all workers complete
 *
 * Benefits:
 * - Main thread isolation: SUT crashes don't crash the CLI
 * - True parallelism: Workers run on separate OS threads
 * - Resource managed: Automatic 75% resource allocation
 * - Fault tolerance: Single worker failure doesn't stop others
 *
 * Dependency Injection:
 * - Logger interface enables testing of log output
 * - WorkerFactory interface enables mocking Worker for testing
 * - WorkerEntryPath interface enables testing worker path resolution
 */

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { EvaluationResult } from "../types/result.js";
import type { ExecutorConfig, PlannedRun } from "./executor.js";
import type {
	RegistryManifest,
	SerializedSut,
	SerializedCase,
	WorkerMessage,
	WorkerOutputMessage,
	WorkerSuccessMessage,
	WorkerErrorMessage,
} from "./worker-executor.js";
import type { ResourceLimits } from "./resource-calculator.js";

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
 * Worker interface.
 * Abstraction over Node.js Worker.
 */
export interface IWorker {
	postMessage(message: WorkerMessage): void;
	on(event: "message", listener: (data: WorkerOutputMessage) => void): void;
	on(event: "error", listener: (error: Error) => void): void;
	terminate(): Promise<number>;
}

/**
 * Worker factory interface.
 * Enables mocking of Worker construction for testing.
 */
export interface IWorkerFactory {
	create(workerPath: string): IWorker;
}

import { Worker } from "node:worker_threads";

/**
 * Create an IWorker adapter from a Node.js Worker.
 * Uses bind to delegate methods without type assertions.
 */
function createWorkerAdapter(worker: Worker): IWorker {
	return {
		postMessage: worker.postMessage.bind(worker),
		on: worker.on.bind(worker),
		terminate: worker.terminate.bind(worker),
	};
}

/**
 * Production worker factory using node:worker_threads.
 * Registers the tsx loader when spawning workers from TypeScript source.
 */
export class WorkerFactory implements IWorkerFactory {
	create(workerPath: string): IWorker {
		const execArgv = workerPath.endsWith(".ts") ? ["--import", "tsx"] : [];
		const worker = new Worker(workerPath, { execArgv });
		return createWorkerAdapter(worker);
	}
}

/**
 * Path resolver interface.
 * Enables testing of worker entry path resolution.
 */
export interface IWorkerEntryPath {
	/**
	 * Get the absolute path to the worker entry point.
	 */
	getWorkerEntryPath(): string;
}

/**
 * Production path resolver using import.meta.url.
 * Handles both compiled (dist/*.js) and source (src/*.ts via tsx) contexts.
 */
export class WorkerEntryPath implements IWorkerEntryPath {
	getWorkerEntryPath(): string {
		const __filename = fileURLToPath(import.meta.url);
		const __dirname = resolve(__filename, "..");
		const ext = __filename.endsWith(".ts") ? ".ts" : ".js";
		return resolve(__dirname, `worker-entry${ext}`);
	}
}

/**
 * Batch of runs for a worker.
 */
export interface RunBatch {
	/** Batch index */
	index: number;

	/** Run IDs in this batch */
	runIds: string[];

	/** Runs in this batch */
	runs: PlannedRun[];

	/** First run ID in batch */
	firstRunId: string;

	/** Last run ID in batch */
	lastRunId: string;
}

/**
 * Worker threads executor options.
 */
export interface WorkerThreadsExecutorOptions {
	/** Number of worker threads (default: auto-calculated from 75% CPU) */
	workers?: number;

	/** Maximum memory per worker in MB */
	maxMemoryMb?: number;

	/** Maximum concurrent I/O operations per worker */
	maxConcurrentIo?: number;

	/** Logger instance */
	logger?: ILogger;

	/** Worker factory instance */
	workerFactory?: IWorkerFactory;

	/** Worker entry path resolver */
	workerEntryPath?: IWorkerEntryPath;

	/** Base directory for resolving module paths (default: process.cwd()) */
	baseDir?: string;

	/** Use registry manifest mode for SUTs (enables registry-based SUTs with worker isolation) */
	useRegistryManifest?: boolean;
}

/**
 * Worker state for tracking execution.
 */
interface WorkerState {
	/** Worker instance */
	worker: IWorker;

	/** Worker index */
	index: number;

	/** Batch assigned to this worker */
	batch: RunBatch;

	/** Checkpoint path for this worker */
	checkpointPath: string;

	/** Whether this worker has completed */
	completed: boolean;

	/** Results received from this worker */
	results: EvaluationResult[];

	/** Errors received from this worker */
	errors: { runId: string; error: string }[];
}

/**
 * Worker threads executor class with dependency injection.
 *
 * Executes experiments using Node.js worker threads for parallelism.
 * Each worker runs in isolation, preventing SUT crashes from affecting the main process.
 */
export class WorkerThreadsExecutor {
	private readonly logger: ILogger;
	private readonly workerFactory: IWorkerFactory;
	private readonly workerEntryPath: IWorkerEntryPath;
	private readonly baseDir: string;
	private readonly useRegistryManifest: boolean;

	constructor(options: WorkerThreadsExecutorOptions = {}) {
		this.logger = options.logger ?? new ConsoleLogger();
		this.workerFactory = options.workerFactory ?? new WorkerFactory();
		this.workerEntryPath = options.workerEntryPath ?? new WorkerEntryPath();
		this.baseDir = options.baseDir ?? process.cwd();
		this.useRegistryManifest = options.useRegistryManifest ?? false;
	}

	/**
	 * Split runs into batches for parallel processing.
	 * @param runs - Runs to distribute
	 * @param numberWorkers - Number of worker threads
	 * @returns Array of run batches
	 */
	private _createBatches(runs: PlannedRun[], numberWorkers: number): RunBatch[] {
		const batchSize = Math.ceil(runs.length / numberWorkers);
		const batches: RunBatch[] = [];

		for (let i = 0; i < runs.length; i += batchSize) {
			const batch = runs.slice(i, i + batchSize);
			const batchIndex = Math.floor(i / batchSize);
			const runIds = batch.map((r) => r.runId);

			batches.push({
				index: batchIndex,
				runIds,
				runs: batch,
				firstRunId: batch[0]?.runId ?? "none",
				lastRunId: batch.at(-1)?.runId ?? "none",
			});
		}

		return batches;
	}

	/**
	 * Execute runs using multiple worker threads.
	 *
	 * Each worker writes to its own sharded checkpoint file to avoid race conditions.
	 * After all workers complete, results are aggregated and returned.
	 *
	 * @param runs - Planned runs to execute
	 * @param suts - SUT definitions (serialized and passed to workers)
	 * @param cases - Case definitions (serialized and passed to workers)
	 * @param config - Executor configuration
	 * @param options - Worker threads executor options
	 * @param checkpointDir - Checkpoint directory for shard files
	 * @returns Execution results
	 */
	async execute(
		runs: PlannedRun[],
		suts: {
			registration: { id: string; name: string; version: string; role: string };
			factory: unknown;
		}[],
		cases: {
			case: { caseId: string };
			getInput: () => Promise<unknown>;
			getInputs: () => unknown;
		}[],
		config: ExecutorConfig & { onResult?: (result: EvaluationResult) => void },
		options: WorkerThreadsExecutorOptions = {},
		checkpointDir = resolve(process.cwd(), "results/execute"),
	): Promise<{ results: EvaluationResult[]; errors: { runId: string; error: string }[] }> {
		const workerCount = options.workers ?? 1;

		this.logger.info(
			`WorkerThreadsExecutor: Spawning ${workerCount} workers for ${runs.length} runs`,
		);
		this.logger.info(`Checkpoint directory: ${checkpointDir}`);

		// Split runs into batches
		const batches = this._createBatches(runs, workerCount);

		// Log batch information
		for (const batch of batches) {
			this.logger.debug(`Batch ${batch.index} has ${batch.runIds.length} runs`);
			this.logger.debug(`  First run: ${batch.firstRunId}, Last run: ${batch.lastRunId}`);
		}

		// Get worker entry path
		const workerPath = this.workerEntryPath.getWorkerEntryPath();
		this.logger.debug(`Worker entry path: ${workerPath}`);

		// Spawn workers
		const workerStates = this._spawnWorkers(
			batches,
			workerPath,
			checkpointDir,
			config,
			suts,
			cases,
		);

		// Wait for all workers to complete
		await this._waitForWorkers(workerStates);

		// Aggregate results
		const allResults: EvaluationResult[] = [];
		const allErrors: { runId: string; error: string }[] = [];

		for (const state of workerStates) {
			allResults.push(...state.results);
			allErrors.push(...state.errors);
		}

		this.logger.info(
			`All workers completed: ${allResults.length} results, ${allErrors.length} errors`,
		);

		return { results: allResults, errors: allErrors };
	}

	/**
	 * Spawn worker threads for all batches.
	 * @param batches - Run batches
	 * @param workerPath - Path to worker entry point
	 * @param checkpointDir - Checkpoint directory
	 * @param config - Executor configuration
	 * @param suts - SUT definitions to serialize
	 * @param cases - Case definitions to serialize
	 * @returns Array of worker states
	 */
	private _spawnWorkers(
		batches: RunBatch[],
		workerPath: string,
		checkpointDir: string,
		config: ExecutorConfig,
		suts: {
			registration: { id: string; name: string; version: string; role: string };
			factory: unknown;
		}[],
		cases: {
			case: { caseId: string };
			getInput: () => Promise<unknown>;
			getInputs: () => unknown;
		}[],
	): WorkerState[] {
		const workerStates: WorkerState[] = [];

		// Serialize SUTs for WorkerMessage
		const serializedSuts: SerializedSut[] = suts.map((sut) => {
			const sutRecord: Record<string, unknown> = Object.fromEntries(Object.entries(sut));
			const sourceModule: string =
				typeof sutRecord.sourceModule === "string"
					? sutRecord.sourceModule
					: `./dist/suts/${sut.registration.id}.js`;
			const sourceExportName: string =
				typeof sutRecord.sourceExportName === "string" ? sutRecord.sourceExportName : "createSut";
			return {
				id: sut.registration.id,
				module: sourceModule,
				exportName: sourceExportName,
				registration: {
					name: sut.registration.name,
					version: sut.registration.version,
					role: sut.registration.role,
				},
			};
		});

		// Serialize cases for WorkerMessage
		const serializedCases: SerializedCase[] = cases.map((c) => {
			const caseRecord: Record<string, unknown> = Object.fromEntries(Object.entries(c));
			const sourceModule: string =
				typeof caseRecord.sourceModule === "string"
					? caseRecord.sourceModule
					: `./dist/cases/${c.case.caseId}.js`;
			const sourceExportName: string =
				typeof caseRecord.sourceExportName === "string"
					? caseRecord.sourceExportName
					: "createCase";
			return {
				caseId: c.case.caseId,
				module: sourceModule,
				exportName: sourceExportName,
			};
		});

		for (const batch of batches) {
			const checkpointPath = resolve(
				checkpointDir,
				`checkpoint-worker-${String(batch.index).padStart(2, "0")}.json`,
			);

			const worker = this.workerFactory.create(workerPath);
			const state: WorkerState = {
				worker,
				index: batch.index,
				batch,
				checkpointPath,
				completed: false,
				results: [],
				errors: [],
			};

			// Set up message handler
			worker.on("message", (data: WorkerOutputMessage) => {
				this._handleWorkerMessage(state, data, config);
			});

			// Set up error handler
			worker.on("error", (error: Error) => {
				this.logger.warn(`Worker ${batch.index} error: ${error.message}`);
				state.completed = true;
				// Add error for all runs in this batch
				for (const runId of batch.runIds) {
					state.errors.push({ runId, error: error.message });
				}
			});

			// Send initial message to worker with serialized SUTs and cases
			const workerMessage: WorkerMessage = {
				runs: batch.runs.map((run) => ({
					runId: run.runId,
					sutId: run.sutId,
					caseId: run.caseId,
					repetition: run.repetition,
					config: run.config,
				})),
				config: {
					repetitions: config.repetitions,
					seedBase: config.seedBase,
					continueOnError: config.continueOnError,
					timeoutMs: config.timeoutMs,
					collectProvenance: config.collectProvenance,
					inputSchema: config.inputSchema,
					outputSchema: config.outputSchema,
					sutOutputSchemas: config.sutOutputSchemas,
					caseInputSchemas: config.caseInputSchemas,
				},
				baseDir: this.baseDir,
				suts: serializedSuts,
				cases: serializedCases,
			};

			// Add registry manifest if useRegistryManifest is enabled
			if (this.useRegistryManifest) {
				const emptyConfig: Record<string, unknown> = {};
				const emptyTags: string[] = [];
				const registryManifest: RegistryManifest = {
					suts: suts.map((sut) => ({
						id: sut.registration.id,
						name: sut.registration.name,
						version: sut.registration.version,
						role: sut.registration.role,
						config: emptyConfig,
						tags: emptyTags,
					})),
					sharedCode: "", // Registry code not bundled in this implementation
					sutModules: Object.fromEntries(
						suts.map((sut) => [sut.registration.id, `./dist/suts/${sut.registration.id}.js`]),
					),
					exportName: "createSut",
				};
				workerMessage.registryManifest = registryManifest;
			}

			worker.postMessage(workerMessage);

			workerStates.push(state);
		}

		return workerStates;
	}

	/**
	 * Handle a message from a worker.
	 * @param state - Worker state
	 * @param data - Message data
	 * @param config - Executor configuration
	 */
	private _handleWorkerMessage(
		state: WorkerState,
		data: WorkerOutputMessage,
		config: ExecutorConfig,
	): void {
		// Use type guards to discriminate the union type
		const isError = (msg: WorkerOutputMessage): msg is WorkerErrorMessage => msg.type === "error";

		const isSuccess = (msg: WorkerOutputMessage): msg is WorkerSuccessMessage =>
			msg.type === "done";

		// Handle WorkerErrorMessage
		if (isError(data)) {
			this.logger.warn(`Worker ${state.index} error: ${data.error}`);
			state.completed = true;
			for (const runId of state.batch.runIds) {
				state.errors.push({ runId, error: data.error });
			}
			return;
		}

		// Handle WorkerSuccessMessage
		if (isSuccess(data)) {
			state.results.push(...data.results);
			state.errors.push(...data.errors);
			state.completed = true;
			this.logger.debug(`Worker ${state.index} completed: ${data.results.length} results`);

			// Call onResult callback for each result
			if (config.onResult) {
				for (const result of data.results) {
					try {
						void config.onResult(result);
					} catch (error) {
						this.logger.warn(`Error in onResult callback: ${String(error)}`);
					}
				}
			}
		}
	}

	/**
	 * Wait for all workers to complete.
	 * @param workerStates - Worker states
	 * @returns Promise that resolves when all workers complete
	 */
	private async _waitForWorkers(workerStates: WorkerState[]): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			let completedCount = 0;
			const totalWorkers = workerStates.length;

			const checkCompletion = () => {
				completedCount = workerStates.filter((s) => s.completed).length;
				if (completedCount === totalWorkers) {
					clearInterval(interval);
					clearTimeout(timeout);
					resolve();
				}
			};

			// Poll for completion
			const interval = setInterval(checkCompletion, 100);

			// Timeout after 1 hour
			const timeout = setTimeout(() => {
				clearInterval(interval);
				const incomplete = workerStates.filter((s) => !s.completed).map((s) => s.index);
				reject(
					new Error(`Worker timeout after 1 hour. Incomplete workers: ${incomplete.join(", ")}`),
				);
			}, 3_600_000);
		});
	}
}

/**
 * Execute runs using multiple worker threads.
 *
 * Each worker writes to its own sharded checkpoint file to avoid race conditions.
 * After all workers complete, results are aggregated and returned.
 *
 * This is a convenience function that creates a WorkerThreadsExecutor with default dependencies.
 * For testing or custom behavior, use the WorkerThreadsExecutor class directly.
 *
 * @param runs - Planned runs to execute
 * @param suts - SUT definitions (serialized and passed to workers)
 * @param cases - Case definitions (serialized and passed to workers)
 * @param config - Executor configuration
 * @param options - Worker threads executor options
 * @returns Execution results
 */
export const executeWithWorkerThreads = async (
	runs: PlannedRun[],
	suts: {
		registration: { id: string; name: string; version: string; role: string };
		factory: unknown;
	}[],
	cases: { case: { caseId: string }; getInput: () => Promise<unknown>; getInputs: () => unknown }[],
	config: ExecutorConfig & { onResult?: (result: EvaluationResult) => void },
	options: WorkerThreadsExecutorOptions & Partial<ResourceLimits> = {},
): Promise<{ results: EvaluationResult[]; errors: { runId: string; error: string }[] }> => {
	const executor = new WorkerThreadsExecutor(options);
	return executor.execute(runs, suts, cases, config, options);
};
