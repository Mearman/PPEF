/**
 * Experiment Executor
 *
 * Orchestrates experiment execution across SUTs and cases.
 * Handles error isolation, progress reporting, and result collection.
 */

import { execSync } from "node:child_process";
import { arch, platform, version as nodeVersion } from "node:process";

import type { CaseDefinition, Primitive } from "../types/case.js";
import type { CorrectnessResult, EvaluationResult, Provenance } from "../types/result.js";
import type { SutDefinition } from "../types/sut.js";
import { MemoryMonitor, MemoryWarningLevel } from "./memory-monitor.js";
import { generateRunId } from "./run-id.js";

/**
 * Configuration for experiment execution.
 */
export interface ExecutorConfig {
	/** Continue execution if a single run fails */
	continueOnError: boolean;

	/** Number of repetitions per case (for statistical analysis) */
	repetitions: number;

	/** Random seed base (incremented per repetition) */
	seedBase: number;

	/** Timeout per run in milliseconds (0 = no timeout) */
	timeoutMs: number;

	/** Whether to collect provenance information */
	collectProvenance: boolean;

	/** Number of concurrent runs (1 = sequential) */
	concurrency?: number;

	/** Progress callback */
	onProgress?: (progress: ExecutionProgress) => void;

	/** Per-run callback (can be async) */
	onResult?: (result: EvaluationResult) => void | Promise<void>;

	/** Enable memory monitoring (default: true) */
	monitorMemory?: boolean;

	/** Memory warning threshold in MB (default: 1024) */
	memoryWarningThresholdMb?: number;

	/** Memory critical threshold in MB (default: 2048) */
	memoryCriticalThresholdMb?: number;

	/** Abort execution at critical memory level (default: false) */
	abortOnMemoryCritical?: boolean;
}

/**
 * Default executor configuration.
 */
export const DEFAULT_EXECUTOR_CONFIG: ExecutorConfig = {
	continueOnError: true,
	repetitions: 1,
	seedBase: 42,
	timeoutMs: 0,
	collectProvenance: true,
};

/**
 * Execution progress report.
 */
export interface ExecutionProgress {
	/** Total planned runs */
	total: number;

	/** Completed runs */
	completed: number;

	/** Failed runs */
	failed: number;

	/** Current SUT */
	currentSut?: string;

	/** Current case */
	currentCase?: string;

	/** Current repetition */
	currentRepetition?: number;

	/** Elapsed time in milliseconds */
	elapsedMs: number;
}

/**
 * Execution summary returned after completion.
 */
export interface ExecutionSummary {
	/** Total runs attempted */
	totalRuns: number;

	/** Successful runs */
	successfulRuns: number;

	/** Failed runs */
	failedRuns: number;

	/** Total elapsed time */
	elapsedMs: number;

	/** Results collected */
	results: EvaluationResult[];

	/** Errors encountered */
	errors: { runId: string; error: string }[];
}

/**
 * Execution plan for a single run.
 */
export interface PlannedRun {
	/** Deterministic run ID */
	runId: string;

	/** SUT to execute */
	sutId: string;

	/** Case to run against */
	caseId: string;

	/** Repetition number */
	repetition: number;

	/** Random seed */
	seed: number;

	/** Configuration overrides */
	config?: Record<string, unknown>;
}

/**
 * Get provenance information for reproducibility.
 * @param collectProvenance
 */
const getProvenance = (collectProvenance: boolean): Provenance => {
	if (!collectProvenance) {
		return {
			runtime: {
				platform: platform,
				arch: arch,
				nodeVersion: nodeVersion,
			},
		};
	}

	let gitCommit: string | undefined;
	let dirty = false;

	try {
		gitCommit = execSync("git rev-parse HEAD", { encoding: "utf-8", env: undefined }).trim();
		const status = execSync("git status --porcelain", { encoding: "utf-8", env: undefined });
		dirty = status.length > 0;
	} catch {
		// Git not available or not a git repo
	}

	return {
		runtime: {
			platform: platform,
			arch: arch,
			nodeVersion: nodeVersion,
		},
		gitCommit,
		dirty,
		timestamp: new Date().toISOString(),
	};
};

/**
 * Experiment executor.
 *
 * @template TInput - The resource type (e.g., Graph, Dataset)
 * @template TInputs - The algorithm inputs type
 * @template TResult - The algorithm result type
 */
export class Executor<TInput = unknown, TInputs = unknown, TResult = unknown> {
	private readonly config: ExecutorConfig;
	private readonly inputCache: Map<string, TInput>;
	private readonly memoryMonitor?: MemoryMonitor;

	constructor(config: Partial<ExecutorConfig> = {}) {
		this.config = {
			...DEFAULT_EXECUTOR_CONFIG,
			monitorMemory: true,
			...config,
		};
		this.inputCache = new Map();

		// Initialize memory monitor if enabled
		if (this.config.monitorMemory) {
			this.memoryMonitor = new MemoryMonitor({
				warningThresholdMb: this.config.memoryWarningThresholdMb,
				criticalThresholdMb: this.config.memoryCriticalThresholdMb,
				verbose: true,
				onWarningLevelChange: (level, stats) => {
					if (level === MemoryWarningLevel.CRITICAL && this.config.abortOnMemoryCritical) {
						throw new Error(
							`Memory critical threshold exceeded (${stats.rssMb.toFixed(1)}MB). Aborting execution.`,
						);
					}
				},
			});
		}
	}

	/**
	 * Plan execution runs without executing.
	 *
	 * @param suts - SUTs to execute
	 * @param cases - Cases to run against
	 * @returns Array of planned runs
	 */
	plan(
		suts: SutDefinition<TInputs, TResult>[],
		cases: CaseDefinition<TInput, TInputs>[],
	): PlannedRun[] {
		const runs: PlannedRun[] = [];

		for (const sutDef of suts) {
			for (const caseDef of cases) {
				for (let rep = 0; rep < this.config.repetitions; rep++) {
					const seed = this.config.seedBase + rep;
					const runId = generateRunId({
						sutId: sutDef.registration.id,
						caseId: caseDef.case.caseId,
						seed,
						repetition: rep,
					});

					runs.push({
						runId,
						sutId: sutDef.registration.id,
						caseId: caseDef.case.caseId,
						repetition: rep,
						seed,
					});
				}
			}
		}

		return runs;
	}

	/**
	 * Execute all planned runs.
	 *
	 * @param suts - SUTs to execute
	 * @param cases - Cases to run against
	 * @param metricsExtractor - Function to extract metrics from result
	 * @param plannedRuns - Optional pre-filtered planned runs (for parallel workers)
	 * @returns Execution summary with all results
	 */
	async execute(
		suts: SutDefinition<TInputs, TResult>[],
		cases: CaseDefinition<TInput, TInputs>[],
		metricsExtractor: (result: TResult) => Record<string, number>,
		plannedRuns?: PlannedRun[],
	): Promise<ExecutionSummary> {
		const startTime = performance.now();

		const effectivePlannedRuns = plannedRuns ?? this.plan(suts, cases);
		const sutMap = new Map(suts.map((s) => [s.registration.id, s]));
		const caseMap = new Map(cases.map((c) => [c.case.caseId, c]));

		// Use concurrency limit if specified, otherwise sequential
		const concurrency = this.config.concurrency ?? 1;

		if (concurrency <= 1) {
			// Sequential execution (original behavior)
			return this.executeSequential(
				effectivePlannedRuns,
				sutMap,
				caseMap,
				metricsExtractor,
				startTime,
			);
		}

		// Parallel execution with concurrency limit
		return this.executeParallel(
			effectivePlannedRuns,
			sutMap,
			caseMap,
			metricsExtractor,
			startTime,
			concurrency,
		);
	}

	/**
	 * Execute runs sequentially (original behavior).
	 * @param plannedRuns
	 * @param sutMap
	 * @param caseMap
	 * @param metricsExtractor
	 * @param startTime
	 * @internal
	 */
	private async executeSequential(
		plannedRuns: PlannedRun[],
		sutMap: Map<string, SutDefinition<TInputs, TResult>>,
		caseMap: Map<string, CaseDefinition<TInput, TInputs>>,
		metricsExtractor: (result: TResult) => Record<string, number>,
		startTime: number,
	): Promise<ExecutionSummary> {
		const results: EvaluationResult[] = [];
		const errors: { runId: string; error: string }[] = [];
		let completed = 0;
		let failed = 0;

		for (const run of plannedRuns) {
			const sutDef = sutMap.get(run.sutId);
			const caseDef = caseMap.get(run.caseId);

			if (!sutDef || !caseDef) {
				errors.push({ runId: run.runId, error: "SUT or case not found" });
				failed++;
				continue;
			}

			// Report progress
			if (this.config.onProgress) {
				this.config.onProgress({
					total: plannedRuns.length,
					completed,
					failed,
					currentSut: run.sutId,
					currentCase: run.caseId,
					currentRepetition: run.repetition,
					elapsedMs: performance.now() - startTime,
				});
			}

			try {
				const result = await this.executeRun(run, sutDef, caseDef, metricsExtractor);
				results.push(result);

				// Call onResult callback and await if it returns a promise
				if (this.config.onResult) {
					const callbackResult = this.config.onResult(result);
					if (callbackResult instanceof Promise) {
						await callbackResult;
					}
				}

				completed++;
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error);
				errors.push({ runId: run.runId, error: errorMessage });
				failed++;

				if (!this.config.continueOnError) {
					throw error;
				}
			}
		}

		return {
			totalRuns: plannedRuns.length,
			successfulRuns: completed,
			failedRuns: failed,
			elapsedMs: performance.now() - startTime,
			results,
			errors,
		};
	}

	/**
	 * Execute runs in parallel with a concurrency limit.
	 * @param plannedRuns
	 * @param sutMap
	 * @param caseMap
	 * @param metricsExtractor
	 * @param startTime
	 * @param concurrency
	 * @internal
	 */
	private async executeParallel(
		plannedRuns: PlannedRun[],
		sutMap: Map<string, SutDefinition<TInputs, TResult>>,
		caseMap: Map<string, CaseDefinition<TInput, TInputs>>,
		metricsExtractor: (result: TResult) => Record<string, number>,
		startTime: number,
		concurrency: number,
	): Promise<ExecutionSummary> {
		const results: EvaluationResult[] = [];
		const errors: { runId: string; error: string }[] = [];

		// Thread-safe counters
		let completed = 0;
		let failed = 0;
		const mutex = { locked: false };
		const lockQueue: (() => void)[] = [];

		const acquireLock = () => {
			return new Promise<void>((resolve) => {
				if (mutex.locked) {
					lockQueue.push(resolve);
				} else {
					mutex.locked = true;
					resolve();
				}
			});
		};

		const releaseLock = () => {
			const next = lockQueue.shift();
			if (next) {
				next();
			} else {
				mutex.locked = false;
			}
		};

		// Process a single run
		const processRun = async (run: PlannedRun): Promise<void> => {
			const sutDef = sutMap.get(run.sutId);
			const caseDef = caseMap.get(run.caseId);

			if (!sutDef || !caseDef) {
				await acquireLock();
				errors.push({ runId: run.runId, error: "SUT or case not found" });
				failed++;
				releaseLock();
				return;
			}

			try {
				const result = await this.executeRun(run, sutDef, caseDef, metricsExtractor);

				await acquireLock();
				results.push(result);
				completed++;

				// Call onResult callback (checkpoint save)
				if (this.config.onResult) {
					await this.config.onResult(result);
				}

				// Report progress
				if (this.config.onProgress) {
					this.config.onProgress({
						total: plannedRuns.length,
						completed,
						failed,
						currentSut: run.sutId,
						currentCase: run.caseId,
						currentRepetition: run.repetition,
						elapsedMs: performance.now() - startTime,
					});
				}
				releaseLock();
			} catch (error) {
				await acquireLock();
				const errorMessage = error instanceof Error ? error.message : String(error);
				errors.push({ runId: run.runId, error: errorMessage });
				failed++;
				releaseLock();

				if (!this.config.continueOnError) {
					throw error;
				}
			}
		};

		// Worker pool: process runs in batches
		for (let index = 0; index < plannedRuns.length; index += concurrency) {
			const batch = plannedRuns.slice(index, index + concurrency);
			await Promise.all(batch.map(processRun));
		}

		return {
			totalRuns: plannedRuns.length,
			successfulRuns: completed,
			failedRuns: failed,
			elapsedMs: performance.now() - startTime,
			results,
			errors,
		};
	}

	/**
	 * Execute a single run.
	 * @param run
	 * @param sutDef
	 * @param caseDef
	 * @param metricsExtractor
	 */
	private async executeRun(
		run: PlannedRun,
		sutDef: SutDefinition<TInputs, TResult>,
		caseDef: CaseDefinition<TInput, TInputs>,
		metricsExtractor: (result: TResult) => Record<string, number>,
	): Promise<EvaluationResult> {
		const runStartTime = performance.now();
		let peakMemoryBytes = 0;

		// Check memory before execution
		if (this.memoryMonitor) {
			const initialLevel = this.memoryMonitor.check();
			if (initialLevel === MemoryWarningLevel.EMERGENCY) {
				throw new Error("Memory at emergency level before execution. Aborting.");
			}
		}

		// Load or reuse input resource for this case (cached to avoid reloading)
		const cacheKey = caseDef.case.caseId;
		let input = this.inputCache.get(cacheKey);
		if (!input) {
			// Apply timeout to resource loading (large graphs can hang during loading)
			input = await (this.config.timeoutMs > 0
				? Promise.race([
						caseDef.getInput(),
						new Promise<never>((_, reject) =>
							setTimeout(() => {
								reject(new Error(`Resource loading timeout after ${this.config.timeoutMs}ms`));
							}, this.config.timeoutMs),
						),
					])
				: caseDef.getInput());
			this.inputCache.set(cacheKey, input);

			// Check memory after resource loading
			if (this.memoryMonitor) {
				const stats = this.memoryMonitor.getStats();
				peakMemoryBytes = Math.max(peakMemoryBytes, stats.rssBytes);
			}
		}

		// Get algorithm inputs for this case
		const inputs = caseDef.getInputs();

		// Create SUT instance (factory now takes only config)
		const sut = sutDef.factory(run.config);

		// Execute with timeout if configured
		const sutResult = await (this.config.timeoutMs > 0
			? Promise.race([
					sut.run({ ...inputs, input }),
					new Promise<never>((_, reject) =>
						setTimeout(() => {
							reject(new Error(`Timeout after ${this.config.timeoutMs}ms`));
						}, this.config.timeoutMs),
					),
				])
			: sut.run({ ...inputs, input }));

		const executionTimeMs = performance.now() - runStartTime;

		// Check memory after execution
		let finalMemoryBytes = 0;
		if (this.memoryMonitor) {
			const stats = this.memoryMonitor.getStats();
			peakMemoryBytes = Math.max(peakMemoryBytes, stats.rssBytes);
			finalMemoryBytes = stats.rssBytes;
		}

		// Extract metrics
		const metrics = metricsExtractor(sutResult);

		// Build correctness result (basic - can be extended)
		const correctness: CorrectnessResult = {
			expectedExists: caseDef.case.expectedOutput !== undefined,
			producedOutput: true,
			valid: true, // Assume valid if no exception
			matchesExpected: null, // Would need comparison logic
		};

		// Build provenance
		const provenance = getProvenance(this.config.collectProvenance);
		provenance.executionTimeMs = executionTimeMs;

		// Add memory stats if monitoring is enabled
		if (this.memoryMonitor && this.config.collectProvenance) {
			provenance.peakMemoryBytes = peakMemoryBytes;
			provenance.finalMemoryBytes = finalMemoryBytes;
		}

		return {
			run: {
				runId: run.runId,
				sut: run.sutId,
				sutRole: sutDef.registration.role,
				sutVersion: sutDef.registration.version,
				caseId: run.caseId,
				caseClass: caseDef.case.caseClass,
				config: run.config as Record<string, Primitive> | undefined,
				seed: run.seed,
				repetition: run.repetition,
			},
			correctness,
			outputs: {
				summary: {
					// Could extract from sutResult
				},
			},
			metrics: {
				numeric: metrics,
			},
			provenance,
		};
	}
}

/**
 * Create a default executor with standard configuration.
 * @param config
 */
export const createExecutor = <TInput = unknown, TInputs = unknown, TResult = unknown>(
	config?: Partial<ExecutorConfig>,
): Executor<TInput, TInputs, TResult> => new Executor(config);
