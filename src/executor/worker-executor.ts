/**
 * WorkerExecutor - Core worker logic with dependency injection.
 *
 * This class can be tested by injecting mock dependencies,
 * while worker-entry.ts provides real implementations.
 */

import type { EvaluationResult } from "../types/result.js";

/**
 * Type definition for a single run configuration
 */
export interface RunConfig {
	runId: string;
	sutId: string;
	caseId: string;
	repetition: number;
	config: unknown;
}

/**
 * Type definition for executor configuration
 */
export interface ExecutorConfig {
	repetitions: number;
	seedBase: number;
	continueOnError: boolean;
	timeoutMs: number;
	collectProvenance: boolean;
}

/**
 * Type definition for message sent to worker
 */
export interface WorkerMessage {
	runs: RunConfig[];
	config: ExecutorConfig;
}

/**
 * Type definition for worker response
 */
export interface WorkerResponse {
	results: EvaluationResult[];
	errors: { runId: string; error: string }[];
}

/**
 * Type definition for successful response message
 */
export interface WorkerSuccessMessage {
	type: "done";
	results: EvaluationResult[];
	errors: { runId: string; error: string }[];
}

/**
 * Type definition for error response message
 */
export interface WorkerErrorMessage {
	type: "error";
	error: string;
}

/**
 * Type definition for any worker message
 */
export type WorkerOutputMessage = WorkerSuccessMessage | WorkerErrorMessage;

/**
 * Interface for parent port communication
 */
export interface IParentPort {
	on(event: string, listener: (data: unknown) => void): void;
	postMessage(message: unknown): void;
}

/**
 * Interface for dynamically loaded executor module
 */
export interface IExecutorModule {
	Executor: new (config: ExecutorConfig) => {
		execute(
			suts: unknown,
			cases: unknown,
			callback: () => unknown,
		): Promise<{
			results: EvaluationResult[];
			errors: { runId: string; error: string }[];
		}>;
	};
}

/**
 * Interface for dynamically loaded evaluate module
 */
export interface IEvaluateModule {
	getSutDefinitions(registry: ISutRegistry): unknown;
	getCaseDefinitions(registry: unknown): unknown;
}

/**
 * Interface for SUT registry
 */
export interface ISutRegistry {
	list(): string[];
	getFactory(id: string): unknown;
}

/**
 * Interface for dynamically loaded registry module
 */
export interface IRegistryModule {
	registerAllBenchmarkCases(): Promise<unknown>;
}

/**
 * Interface for dynamically loaded SUTs module
 */
export interface ISutsModule {
	registerAllSuts(): void;
}

/**
 * Interface for dynamically loaded datasets module
 */
export interface IDatasetsModule {
	registerBenchmarkDatasets(): Promise<void>;
}

/**
 * Interface for module loader
 */
export interface IModuleLoader {
	loadExecutor(): Promise<IExecutorModule>;
	loadEvaluate(): Promise<IEvaluateModule>;
	loadRegistry(): Promise<IRegistryModule>;
	loadSuts(): Promise<ISutsModule>;
	loadDatasets(): Promise<IDatasetsModule>;
}

/**
 * WorkerExecutor - Core worker execution logic with injected dependencies.
 */
export class WorkerExecutor {
	private readonly parentPort: IParentPort;
	private readonly moduleLoader: IModuleLoader;

	/**
	 * Create a new WorkerExecutor with injected dependencies.
	 * @param parentPort - Communication port to parent thread
	 * @param moduleLoader - Module loader for dynamic imports
	 * @param projectRoot - Root directory for the project (reserved for future use)
	 */
	constructor(parentPort: IParentPort, moduleLoader: IModuleLoader, projectRoot: string) {
		this.parentPort = parentPort;
		this.moduleLoader = moduleLoader;
		// projectRoot reserved for future use
		void projectRoot;
	}

	/**
	 * Start listening for messages from parent thread.
	 */
	public start(): void {
		this.parentPort.on("message", (data: unknown) => {
			void this.handleMessage(data);
		});
	}

	/**
	 * Handle an incoming message from the parent thread.
	 */
	public async handleMessage(data: unknown): Promise<void> {
		const message = data as WorkerMessage;

		try {
			const result = await this.executeBatch(message);
			this.parentPort.postMessage({ type: "done", ...result });
		} catch (error) {
			this.parentPort.postMessage({
				type: "error",
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	/**
	 * Execute a batch of runs.
	 */
	public async executeBatch(message: WorkerMessage): Promise<WorkerResponse> {
		// Import the executor and other dependencies
		const executorModule = await this.moduleLoader.loadExecutor();
		const evaluateModule = await this.moduleLoader.loadEvaluate();
		const registryModule = await this.moduleLoader.loadRegistry();
		const sutsModule = await this.moduleLoader.loadSuts();
		const datasetsModule = await this.moduleLoader.loadDatasets();

		// Register all datasets and SUTs
		await datasetsModule.registerBenchmarkDatasets();
		sutsModule.registerAllSuts();
		const caseRegistry = await registryModule.registerAllBenchmarkCases();

		const sutRegistry: ISutRegistry = {
			list: () => ["degree-prioritised", "standard-bfs", "frontier-balanced", "random-priority"],
			getFactory: () => {
				// This would need to be implemented properly
				return null;
			},
		};

		const suts = evaluateModule.getSutDefinitions(sutRegistry);
		const cases = evaluateModule.getCaseDefinitions(caseRegistry);

		// Create executor with no onResult callback (workers don't save checkpoints)
		const executor = new executorModule.Executor({
			repetitions: message.config.repetitions,
			seedBase: message.config.seedBase,
			continueOnError: message.config.continueOnError,
			timeoutMs: message.config.timeoutMs,
			collectProvenance: message.config.collectProvenance,
		});

		// Execute the runs
		const results = await executor.execute(suts, cases, () => ({}));

		return {
			results: results.results,
			errors: results.errors,
		};
	}
}
