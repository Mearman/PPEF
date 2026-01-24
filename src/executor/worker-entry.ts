/**
 * Worker entry point for parallel execution.
 *
 * This file is loaded as a worker thread and receives messages
 * with batches of runs to execute.
 *
 * It uses dependency injection to allow testing of the core logic.
 */

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parentPort } from "node:worker_threads";

import {
	type IDatasetsModule,
	type IEvaluateModule,
	type IExecutorModule,
	type IModuleLoader,
	type IRegistryModule,
	type ISutsModule,
	WorkerExecutor,
} from "./worker-executor.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, "../../../");

/**
 * Real module loader implementation for production use.
 */
class RealModuleLoader implements IModuleLoader {
	public async loadExecutor(): Promise<IExecutorModule> {
		return (await import(
			`${projectRoot}/dist/experiments/framework/executor/executor.js`
		)) as unknown as IExecutorModule;
	}

	public async loadEvaluate(): Promise<IEvaluateModule> {
		return (await import(
			`${projectRoot}/dist/cli-commands/evaluate.js`
		)) as unknown as IEvaluateModule;
	}

	public async loadRegistry(): Promise<IRegistryModule> {
		return (await import(
			`${projectRoot}/dist/experiments/framework/registry/index.js`
		)) as unknown as IRegistryModule;
	}

	public async loadSuts(): Promise<ISutsModule> {
		return (await import(
			`${projectRoot}/dist/experiments/framework/suts/index.js`
		)) as unknown as ISutsModule;
	}

	public async loadDatasets(): Promise<IDatasetsModule> {
		return (await import(
			`${projectRoot}/dist/experiments/evaluation/fixtures/benchmark-datasets.js`
		)) as unknown as IDatasetsModule;
	}
}

// Create executor with real dependencies and start listening
if (parentPort) {
	const moduleLoader = new RealModuleLoader();
	const executor = new WorkerExecutor(parentPort, moduleLoader, projectRoot);
	executor.start();
}
