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

// Dynamically import the main code
const executeBatch = async (message: {
	runs: { runId: string; sutId: string; caseId: string; repetition: number; config: unknown }[];
	config: {
		repetitions: number;
		seedBase: number;
		continueOnError: boolean;
		timeoutMs: number;
		collectProvenance: boolean;
	};
}): Promise<{ results: unknown[]; errors: { runId: string; error: string }[] }> => {
	// Import the executor and other dependencies
	const { Executor } = await import(
		`${projectRoot}/dist/experiments/framework/executor/executor.js`
	);
	const { getSutDefinitions } = await import(`${projectRoot}/dist/cli-commands/evaluate.js`);
	const { getCaseDefinitions } = await import(`${projectRoot}/dist/cli-commands/evaluate.js`);
	const { registerAllBenchmarkCases } = await import(
		`${projectRoot}/dist/experiments/framework/registry/index.js`
	);
	const { registerAllSuts } = await import(
		`${projectRoot}/dist/experiments/framework/suts/index.js`
	);
	const { registerBenchmarkDatasets } = await import(
		`${projectRoot}/dist/experiments/evaluation/fixtures/benchmark-datasets.js`
	);

	// Register all datasets and SUTs
	await registerBenchmarkDatasets();
	registerAllSuts();
	const caseRegistry = await registerAllBenchmarkCases();

	const sutRegistry = {
		list: () => ["degree-prioritised", "standard-bfs", "frontier-balanced", "random-priority"],
		getFactory: (id: string) => {
			// This would need to be implemented properly
			return null as any;
		},
	};

	const suts = getSutDefinitions(sutRegistry as any);
	const cases = getCaseDefinitions(caseRegistry);

	// Create executor with no onResult callback (workers don't save checkpoints)
	const executor = new Executor({
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
parentPort?.on(
	"message",
	async (data: {
		runs: typeof executeBatch extends (...arguments_: any[]) => Promise<any> ? any : never;
		config: object;
	}) => {
		try {
			const result = await executeBatch(data as any);
			parentPort?.postMessage({ type: "done", ...result });
		} catch (error) {
			parentPort?.postMessage({
				type: "error",
				error: error instanceof Error ? error.message : String(error),
			});
		}
	},
);
