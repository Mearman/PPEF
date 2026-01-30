/**
 * WorkerExecutor - Core worker logic with dependency injection.
 *
 * This class can be tested by injecting mock dependencies,
 * while worker-entry.ts provides real implementations.
 *
 * Two execution modes:
 * 1. Legacy mode: Uses module loader to dynamically load SUTs/cases (for backward compatibility)
 * 2. Serialized mode: SUTs/cases passed via WorkerMessage (for worker threads isolation)
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
	forceInProcess?: boolean;

	/** Experiment-level input schema (validates case getInputs() return values) */
	inputSchema?: Record<string, unknown>;

	/** Experiment-level output schema (validates sut.run() return values) */
	outputSchema?: Record<string, unknown>;

	/** Per-SUT output schema overrides (sutId → JSON Schema) */
	sutOutputSchemas?: Record<string, Record<string, unknown>>;

	/** Per-case input schema overrides (caseId → JSON Schema) */
	caseInputSchemas?: Record<string, Record<string, unknown>>;
}

/**
 * Serialized SUT definition for passing via WorkerMessage.
 */
export interface SerializedSut {
	id: string;
	module: string;
	exportName: string;
	registration: {
		name: string;
		version: string;
		role: string;
	};

	/** Binary SUT configuration (if type="binary") */
	binary?: {
		command: string;
		args?: string[];
		inputFormat?: "json" | "raw" | "lines";
		outputFormat?: "json" | "raw" | "lines";
		timeout?: number;
	};
}

/**
 * Serialized case definition for passing via WorkerMessage.
 */
export interface SerializedCase {
	caseId: string;
	module: string;
	exportName: string;
}

/**
 * Registry manifest for passing pre-registered SUTs/cases via WorkerMessage.
 * Allows worker threads to reconstruct registries without dynamic module loading.
 *
 * This enables registry-based SUTs (like GraphBox's wrapper classes) to work
 * with worker thread isolation without requiring standalone createSut() files.
 */
export interface RegistryManifest {
	/** Pre-registered SUT metadata */
	suts: {
		id: string;
		name: string;
		version: string;
		role: string;
		config: Record<string, unknown>;
		tags: string[];
	}[];

	/** Shared code bundle (registry functions) */
	sharedCode: string;

	/** Map of SUT IDs to their module paths */
	sutModules: Record<string, string>;

	/** Export name for createSut function */
	exportName: string;
}

/**
 * Type definition for message sent to worker.
 *
 * Supports three modes:
 * - Legacy: Only `runs` and `config` provided (uses module loader)
 * - Serialized: `suts` and `cases` arrays provided (direct instantiation)
 * - Registry: `registryManifest` provided (reconstructs registry from manifest)
 */
export interface WorkerMessage {
	runs: RunConfig[];
	config: ExecutorConfig;

	/** Base directory for resolving module paths (required for serialized mode) */
	baseDir?: string;

	/** Serialized SUT definitions (optional, for serialized mode) */
	suts?: SerializedSut[];

	/** Serialized case definitions (optional, for serialized mode) */
	cases?: SerializedCase[];

	/** Registry manifest (optional, for registry mode) */
	registryManifest?: RegistryManifest;
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
 * Type-safe dynamic import helper.
 * TypeScript's import() returns `any`, so we use a type assertion function
 * to satisfy ESLint's no-unsafe-assignment rule.
 */
async function dynamicImport(modulePath: string): Promise<Record<string, unknown>> {
	// Dynamic import returns Promise<any>; use structuredClone-like identity to safely type
	const mod: unknown = await (import(modulePath) satisfies Promise<unknown>);
	if (typeof mod !== "object" || mod === null) {
		throw new Error(`Module ${modulePath} did not return an object`);
	}
	// After narrowing to object, reconstruct as Record<string, unknown>
	const record: Record<string, unknown> = Object.fromEntries(Object.entries(mod));
	return record;
}

/**
 * Runtime check that incoming data looks like a WorkerMessage.
 */
function isWorkerMessage(data: unknown): data is WorkerMessage {
	if (typeof data !== "object" || data === null) return false;
	if (!("runs" in data) || !("config" in data)) return false;
	return Array.isArray(data.runs) && typeof data.config === "object" && data.config !== null;
}

/**
 * Safely call an unknown value expected to be a no-arg factory function.
 * Returns the result as a Record<string, unknown>.
 *
 * Uses a typed wrapper function to avoid eslint no-unsafe-call/no-unsafe-assignment
 * violations that occur when calling Function-typed values directly.
 */
function callFactory(fn: unknown): Record<string, unknown> {
	if (typeof fn !== "function") {
		throw new TypeError("Expected a function");
	}
	// Wrap in a typed function to avoid unsafe-call on Function type
	const wrapper: () => unknown = () => Reflect.apply(fn, undefined, []);
	const result: unknown = wrapper();
	if (typeof result !== "object" || result === null) {
		throw new TypeError("Factory did not return an object");
	}
	return Object.fromEntries(Object.entries(result));
}

/**
 * WorkerExecutor - Core worker execution logic with injected dependencies.
 *
 * Supports two execution modes:
 * 1. Legacy mode: Uses module loader for dynamic imports (backward compatible)
 * 2. Serialized mode: SUTs/cases passed via WorkerMessage (worker threads isolation)
 */
export class WorkerExecutor {
	private readonly parentPort: IParentPort;
	private readonly moduleLoader: IModuleLoader;
	private readonly projectRoot: string;

	/**
	 * Create a new WorkerExecutor with injected dependencies.
	 * @param parentPort - Communication port to parent thread
	 * @param moduleLoader - Module loader for dynamic imports (legacy mode)
	 * @param projectRoot - Root directory for the project (used for module resolution)
	 */
	constructor(parentPort: IParentPort, moduleLoader: IModuleLoader, projectRoot: string) {
		this.parentPort = parentPort;
		this.moduleLoader = moduleLoader;
		this.projectRoot = projectRoot;
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
		if (!isWorkerMessage(data)) {
			throw new Error("Invalid worker message received");
		}
		const message: WorkerMessage = data;

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
	 *
	 * Three execution modes:
	 * 1. Legacy mode: Uses module loader to dynamically load SUTs/cases
	 * 2. Serialized mode: SUTs/cases passed via WorkerMessage (for worker threads)
	 * 3. Registry mode: Reconstructs registry from manifest (for registry-based SUTs)
	 */
	public async executeBatch(message: WorkerMessage): Promise<WorkerResponse> {
		// Check for registry manifest mode
		if (message.registryManifest && message.baseDir) {
			return this.executeBatchRegistry(message);
		}

		// Check if serialized mode (SUTs/cases provided in message)
		if (message.suts && message.cases && message.baseDir) {
			return this.executeBatchSerialized(message);
		}

		// Legacy mode: Use module loader
		return this.executeBatchLegacy(message);
	}

	/**
	 * Execute using legacy mode with dynamic module loading.
	 * Used for backward compatibility with existing tests.
	 */
	private async executeBatchLegacy(message: WorkerMessage): Promise<WorkerResponse> {
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
		// Force in-process execution since we're already inside a worker thread
		const executor = new executorModule.Executor({
			repetitions: message.config.repetitions,
			seedBase: message.config.seedBase,
			continueOnError: message.config.continueOnError,
			timeoutMs: message.config.timeoutMs,
			collectProvenance: message.config.collectProvenance,
			forceInProcess: true,
		});

		// Execute the runs
		const results = await executor.execute(suts, cases, () => ({}));

		return {
			results: results.results,
			errors: results.errors,
		};
	}

	/**
	 * Execute using serialized mode (SUTs/cases passed via WorkerMessage).
	 * This mode is used for worker threads isolation.
	 *
	 * Dynamically imports SUT and case modules based on provided definitions,
	 * creates an Executor instance, and executes the planned runs.
	 */
	private async executeBatchSerialized(message: WorkerMessage): Promise<WorkerResponse> {
		if (!message.baseDir || !message.suts || !message.cases) {
			throw new Error("Serialized mode requires baseDir, suts, and cases in WorkerMessage");
		}

		// Load executor module
		const executorModule = await this.moduleLoader.loadExecutor();

		// Load SUTs dynamically
		const suts: unknown[] = [];
		const sutMap = new Map<string, unknown>();

		for (const serializedSut of message.suts) {
			try {
				// Handle binary SUTs
				if (serializedSut.binary) {
					const binarySutModule = await dynamicImport(
						`${this.projectRoot}/dist/executor/binary-sut.js`,
					);
					const BinarySutExport: unknown = binarySutModule.BinarySut;
					if (typeof BinarySutExport !== "function") {
						throw new Error("BinarySut export is not a constructor");
					}
					const constructed: unknown = Reflect.construct(BinarySutExport, [
						serializedSut.id,
						serializedSut.binary,
					]);
					if (
						typeof constructed !== "object" ||
						constructed === null ||
						!("run" in constructed) ||
						typeof constructed.run !== "function"
					) {
						throw new Error("BinarySut constructor did not return a valid SUT");
					}
					// Store run method while it's narrowed to Function by typeof check
					const runMethod = constructed.run;
					const constructedObj = constructed;
					const sut: { id: string; config: unknown; run: (inputs: unknown) => Promise<unknown> } = {
						id:
							"id" in constructed && typeof constructed.id === "string"
								? constructed.id
								: serializedSut.id,
						config: "config" in constructed ? constructed.config : undefined,
						run: (inputs: unknown) => {
							// Call run method on the constructed BinarySut object
							const result: unknown = Reflect.apply(runMethod, constructedObj, [inputs]);
							return result instanceof Promise ? result : Promise.resolve(result);
						},
					};
					const sutDefinition = {
						factory: () => sut,
						registration: {
							...serializedSut.registration,
							id: serializedSut.id,
						},
					};
					suts.push(sutDefinition);
					sutMap.set(serializedSut.id, sutDefinition);
					continue;
				}

				// Resolve module path relative to the experiment config's baseDir
				const modulePath = `${message.baseDir}/${serializedSut.module}`;

				// Dynamic import from the module path
				const module = await dynamicImport(modulePath);
				const factory: unknown = module[serializedSut.exportName];

				if (typeof factory !== "function") {
					throw new Error(`Export ${serializedSut.exportName} in ${modulePath} is not a function`);
				}

				// Build SutDefinition object
				const sutDefinition = {
					factory,
					registration: {
						...serializedSut.registration,
						id: serializedSut.id,
					},
				};

				suts.push(sutDefinition);
				sutMap.set(serializedSut.id, sutDefinition);
			} catch (error) {
				throw new Error(
					`Failed to load SUT "${serializedSut.id}": ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		}

		// Load cases dynamically
		const cases: unknown[] = [];
		const caseMap = new Map<string, unknown>();

		for (const serializedCase of message.cases) {
			// Resolve module path relative to the experiment config's baseDir
			const modulePath = `${message.baseDir}/${serializedCase.module}`;

			try {
				// Dynamic import from the module path
				const module = await dynamicImport(modulePath);
				const caseDefinitionFn: unknown = module[serializedCase.exportName];

				if (typeof caseDefinitionFn !== "function") {
					throw new Error(`Export ${serializedCase.exportName} in ${modulePath} is not a function`);
				}

				// Call the function to get the case definition
				const caseDefinition = callFactory(caseDefinitionFn);

				// Validate that we got a proper CaseDefinition
				if (
					typeof caseDefinition.getInput !== "function" ||
					typeof caseDefinition.getInputs !== "function"
				) {
					throw new Error(
						`Export ${serializedCase.exportName} in ${modulePath} did not return a valid CaseDefinition`,
					);
				}

				cases.push(caseDefinition);
				caseMap.set(serializedCase.caseId, caseDefinition);
			} catch (error) {
				throw new Error(
					`Failed to load case "${serializedCase.caseId}" from ${modulePath}: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		}

		// Create executor with config
		// Force in-process execution since we're already inside a worker thread
		const executor = new executorModule.Executor({
			repetitions: message.config.repetitions,
			seedBase: message.config.seedBase,
			continueOnError: message.config.continueOnError,
			timeoutMs: message.config.timeoutMs,
			collectProvenance: message.config.collectProvenance,
			forceInProcess: true,
			inputSchema: message.config.inputSchema,
			outputSchema: message.config.outputSchema,
			sutOutputSchemas: message.config.sutOutputSchemas,
			caseInputSchemas: message.config.caseInputSchemas,
		});

		// Execute the runs (pass no-op callback - workers don't save checkpoints)
		const results = await executor.execute(suts, cases, () => ({}));

		return {
			results: results.results,
			errors: results.errors,
		};
	}

	/**
	 * Execute using registry manifest mode.
	 * Reconstructs SUT registry from manifest and executes runs.
	 *
	 * This mode enables registry-based SUTs (like GraphBox wrapper classes)
	 * to work with worker thread isolation without requiring standalone files.
	 */
	private async executeBatchRegistry(message: WorkerMessage): Promise<WorkerResponse> {
		if (!message.baseDir || !message.registryManifest) {
			throw new Error("Registry mode requires baseDir and registryManifest in WorkerMessage");
		}

		const { registryManifest } = message;

		// Load executor module
		const executorModule = await this.moduleLoader.loadExecutor();

		// Reconstruct SUTs from registry manifest
		const suts: unknown[] = [];
		const sutMap = new Map<string, unknown>();

		for (const sutMeta of registryManifest.suts) {
			try {
				// Resolve module path from sutModules map
				const modulePath = `${this.projectRoot}/${registryManifest.sutModules[sutMeta.id]}`;

				// Dynamic import the SUT module
				const module = await dynamicImport(modulePath);
				const factory: unknown = module[registryManifest.exportName];

				if (typeof factory !== "function") {
					throw new Error(
						`Export ${registryManifest.exportName} in ${modulePath} is not a function`,
					);
				}

				// Build SutDefinition object with registry metadata
				const sutDefinition = {
					factory,
					registration: {
						...sutMeta,
					},
				};

				suts.push(sutDefinition);
				sutMap.set(sutMeta.id, sutDefinition);
			} catch (error) {
				throw new Error(
					`Failed to load SUT "${sutMeta.id}" from registry: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		}

		// For registry mode, cases must still be provided separately
		// This is a design limitation - full registry support would require case manifests too
		if (!message.cases || message.cases.length === 0) {
			throw new Error("Registry mode requires cases array in WorkerMessage");
		}

		// Load cases using the same logic as serialized mode
		const cases: unknown[] = [];
		const caseMap = new Map<string, unknown>();

		for (const serializedCase of message.cases) {
			const modulePath = `${this.projectRoot}/${serializedCase.module}`;

			try {
				const module = await dynamicImport(modulePath);
				const caseDefinitionFn: unknown = module[serializedCase.exportName];

				if (typeof caseDefinitionFn !== "function") {
					throw new Error(`Export ${serializedCase.exportName} in ${modulePath} is not a function`);
				}

				const caseDefinition = callFactory(caseDefinitionFn);

				if (
					typeof caseDefinition.getInput !== "function" ||
					typeof caseDefinition.getInputs !== "function"
				) {
					throw new Error(
						`Export ${serializedCase.exportName} in ${modulePath} did not return a valid CaseDefinition`,
					);
				}

				cases.push(caseDefinition);
				caseMap.set(serializedCase.caseId, caseDefinition);
			} catch (error) {
				throw new Error(
					`Failed to load case "${serializedCase.caseId}" from ${modulePath}: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		}

		// Create executor with config
		// Force in-process execution since we're already inside a worker thread
		const executor = new executorModule.Executor({
			repetitions: message.config.repetitions,
			seedBase: message.config.seedBase,
			continueOnError: message.config.continueOnError,
			timeoutMs: message.config.timeoutMs,
			collectProvenance: message.config.collectProvenance,
			forceInProcess: true,
			inputSchema: message.config.inputSchema,
			outputSchema: message.config.outputSchema,
			sutOutputSchemas: message.config.sutOutputSchemas,
			caseInputSchemas: message.config.caseInputSchemas,
		});

		// Execute the runs
		const results = await executor.execute(suts, cases, () => ({}));

		return {
			results: results.results,
			errors: results.errors,
		};
	}
}
