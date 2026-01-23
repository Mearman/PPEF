/**
 * Worker entry point for parallel execution.
 *
 * This file is loaded as a worker thread and receives messages
 * with batches of runs to execute.
 */

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parentPort } from "node:worker_threads";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, "../../../");

/**
 * Type definition for a single run configuration
 */
interface RunConfig {
	runId: string;
	sutId: string;
	caseId: string;
	repetition: number;
	config: unknown;
}

/**
 * Type definition for executor configuration
 */
interface ExecutorConfig {
	repetitions: number;
	seedBase: number;
	continueOnError: boolean;
	timeoutMs: number;
	collectProvenance: boolean;
}

/**
 * Type definition for message sent to worker
 */
interface WorkerMessage {
	runs: RunConfig[];
	config: ExecutorConfig;
}

/**
 * Type definition for worker response
 */
interface WorkerResponse {
	results: unknown[];
	errors: { runId: string; error: string }[];
}

/**
 * Type definition for SUT registry
 */
interface SutRegistry {
	list(): string[];
	getFactory(id: string): unknown;
}

/**
 * Type definitions for dynamically imported modules
 */
interface ExecutorModule {
	Executor: new (config: ExecutorConfig) => {
		execute(
			suts: unknown,
			cases: unknown,
			callback: () => unknown,
		): Promise<{
			results: unknown[];
			errors: { runId: string; error: string }[];
		}>;
	};
}

interface EvaluateModule {
	getSutDefinitions(registry: SutRegistry): unknown;
	getCaseDefinitions(registry: unknown): unknown;
}

interface RegistryModule {
	registerAllBenchmarkCases(): Promise<unknown>;
}

interface SutsModule {
	registerAllSuts(): void;
}

interface BenchmarkDatasetsModule {
	registerBenchmarkDatasets(): Promise<void>;
}

// Dynamically import the main code
const executeBatch = async (message: WorkerMessage): Promise<WorkerResponse> => {
	// Import the executor and other dependencies
	const executorModule = (await import(
		`${projectRoot}/dist/experiments/framework/executor/executor.js`
	)) as unknown as ExecutorModule;
	const evaluateModule = (await import(
		`${projectRoot}/dist/cli-commands/evaluate.js`
	)) as unknown as EvaluateModule;
	const registryModule = (await import(
		`${projectRoot}/dist/experiments/framework/registry/index.js`
	)) as unknown as RegistryModule;
	const sutsModule = (await import(
		`${projectRoot}/dist/experiments/framework/suts/index.js`
	)) as unknown as SutsModule;
	const datasetsModule = (await import(
		`${projectRoot}/dist/experiments/evaluation/fixtures/benchmark-datasets.js`
	)) as unknown as BenchmarkDatasetsModule;

	// Register all datasets and SUTs
	await datasetsModule.registerBenchmarkDatasets();
	sutsModule.registerAllSuts();
	const caseRegistry = await registryModule.registerAllBenchmarkCases();

	const sutRegistry: SutRegistry = {
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
};

// Listen for messages from parent thread
parentPort?.on("message", (data: unknown) => {
	// Validate message structure
	const message = data as WorkerMessage;

	// Execute asynchronously without returning the promise
	void (async () => {
		try {
			const result = await executeBatch(message);
			parentPort?.postMessage({ type: "done", ...result });
		} catch (error) {
			parentPort?.postMessage({
				type: "error",
				error: error instanceof Error ? error.message : String(error),
			});
		}
	})();
});
