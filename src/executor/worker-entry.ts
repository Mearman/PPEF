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
// From dist/executor/, go up 2 levels to reach the package root
const projectRoot = resolve(__dirname, "../../");

/**
 * Real module loader implementation for production use.
 *
 * Module paths reference the ppef structure:
 * - executor: src/executor/executor.ts -> dist/executor/executor.js
 * - evaluate: Not used in worker mode (SUTs/cases loaded via serialization)
 * - registry: Not used in worker mode (not needed for isolated execution)
 * - suts: Not used in worker mode (SUTs passed via serialization)
 * - datasets: Not used in worker mode (not needed for isolated execution)
 *
 * NOTE: For worker threads, SUT and case definitions are passed via
 * WorkerMessage serialization instead of dynamic imports, providing
 * better isolation and avoiding hardcoded module paths.
 */
class RealModuleLoader implements IModuleLoader {
	public async loadExecutor(): Promise<IExecutorModule> {
		return (await import(`${projectRoot}/dist/executor/executor.js`)) as unknown as IExecutorModule;
	}

	public loadEvaluate(): Promise<IEvaluateModule> {
		// Not used in worker threads mode - SUTs/cases passed via serialization
		return Promise.reject(new Error("loadEvaluate not supported in worker threads mode"));
	}

	public loadRegistry(): Promise<IRegistryModule> {
		// Not used in worker threads mode
		return Promise.reject(new Error("loadRegistry not supported in worker threads mode"));
	}

	public loadSuts(): Promise<ISutsModule> {
		// Not used in worker threads mode - SUTs passed via serialization
		return Promise.reject(new Error("loadSuts not supported in worker threads mode"));
	}

	public loadDatasets(): Promise<IDatasetsModule> {
		// Not used in worker threads mode
		return Promise.reject(new Error("loadDatasets not supported in worker threads mode"));
	}
}

// Create executor with real dependencies and start listening
if (parentPort) {
	const moduleLoader = new RealModuleLoader();
	const executor = new WorkerExecutor(parentPort, moduleLoader, projectRoot);
	executor.start();
}
