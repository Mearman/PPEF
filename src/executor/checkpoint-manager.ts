/**
 * Checkpoint Manager for Experiment Execution
 *
 * Enables resumable experiment execution by:
 * 1. Writing incremental checkpoints after each completed run
 * 2. Detecting configuration changes to invalidate stale checkpoints
 * 3. Skipping completed runs when resuming
 * 4. Supporting sharded checkpoints for parallel workers
 *
 * Supports pluggable storage backends:
 * - FileStorage: JSON files (fast, local)
 * - GitStorage: Git notes (version controlled, shareable)
 *
 * Dependency Injection:
 * - Storage backend can be injected for testing
 * - Lock implementation can be injected for custom concurrency control
 *
 * Usage:
 * ```typescript
 * // Direct instantiation with injected storage
 * const storage = new FileStorage("results/execute/checkpoint.json");
 * const lock = new InMemoryLock();
 * const checkpoint = new CheckpointManager({ storage, lock });
 *
 * // Sharded mode for parallel workers
 * const shardStorage = new FileStorage("results/execute/checkpoint-worker-0.json");
 * const checkpoint = new CheckpointManager({
 *   storage: shardStorage,
 *   lock,
 *   workerIndex: 0,
 *   totalWorkers: 4,
 *   basePath: "results/execute"
 * });
 *
 * await checkpoint.load();
 *
 * if (checkpoint.isStale(suts, cases, config)) {
 *   checkpoint.invalidate();
 * }
 *
 * const remainingRuns = plannedRuns.filter(
 *   run => !checkpoint.isCompleted(run.runId)
 * );
 *
 * executor.execute({...}, {
 *   onResult: (result) => checkpoint.saveIncremental(result)
 * });
 *
 * // After all workers complete, merge shards
 * await checkpoint.mergeShards([
 *   "results/execute/checkpoint-worker-0.json",
 *   "results/execute/checkpoint-worker-1.json",
 *   ...
 * ]);
 * ```
 */

import { createHash } from "node:crypto";

import type { CaseDefinition } from "../types/case.js";
import type { EvaluationResult } from "../types/result.js";
import type { SutDefinition } from "../types/sut.js";
import type { CheckpointStorage, Lock } from "./checkpoint-storage.js";
import { FileStorage, InMemoryLock } from "./checkpoint-storage.js";
import type { ExecutorConfig, PlannedRun } from "./executor.js";

// Re-export types for convenience
export type { CheckpointMode } from "./checkpoint-storage.js";
export type { Lock } from "./checkpoint-storage.js";
export { InMemoryLock } from "./checkpoint-storage.js";

/**
 * Checkpoint file format.
 */
export interface CheckpointData {
	/** Hash of the execution configuration (SUTs, cases, config) */
	configHash: string;

	/** Timestamp when checkpoint was created */
	createdAt: string;

	/** Timestamp of last update */
	updatedAt: string;

	/** IDs of completed runs (for quick lookup) */
	completedRunIds: string[];

	/** Stored results by run ID */
	results: Record<string, EvaluationResult>;

	/** Total number of planned runs */
	totalPlanned: number;

	/** Git commit at checkpoint time (for reproducibility) */
	gitCommit?: string;

	/** Worker index (for sharded checkpoints) */
	workerIndex?: number;

	/** Total workers (for sharded checkpoints) */
	totalWorkers?: number;
}

/**
 * Configuration signature for hashing.
 */
interface ConfigSignature {
	/** SUT identifiers and versions */
	suts: { id: string; version: string }[];

	/** Case identifiers and versions */
	cases: { id: string; version: string }[];

	/** Execution configuration */
	executorConfig: {
		repetitions: number;
		seedBase: number;
		timeoutMs: number;
	};

	/** Total planned runs */
	totalRuns: number;
}

/**
 * Checkpoint manager constructor options.
 */
export interface CheckpointManagerOptions {
	/** Storage backend for checkpoint data */
	storage: CheckpointStorage;

	/** Concurrency lock for checkpoint saves */
	lock?: Lock;

	/** Worker identity for sharded mode */
	workerIndex?: number;

	/** Total number of workers in sharded mode */
	totalWorkers?: number;

	/** Base checkpoint path (for sharding) */
	basePath?: string;
}

/**
 * Checkpoint manager for resumable execution.
 *
 * Uses dependency injection for storage and lock.
 * Enables sharded checkpoints for parallel worker execution.
 */
export class CheckpointManager {
	private readonly storage: CheckpointStorage;
	private readonly lock: Lock;
	private readonly workerIndex?: number;
	private readonly totalWorkers?: number;
	private readonly basePath?: string;
	private data: CheckpointData | null = null;
	private dirty = false;

	/**
	 * Create a new CheckpointManager.
	 *
	 * @param options - CheckpointManagerOptions with injected storage
	 */
	constructor(options: CheckpointManagerOptions) {
		this.storage = options.storage;
		this.lock = options.lock ?? new InMemoryLock();
		this.workerIndex = options.workerIndex;
		this.totalWorkers = options.totalWorkers;
		this.basePath = options.basePath;
	}

	/**
	 * Get the storage backend being used.
	 */
	getStorageType(): string {
		return this.storage.type;
	}

	/**
	 * Load checkpoint from storage if it exists.
	 * @returns true if checkpoint was loaded, false if not found or invalid
	 */
	async load(): Promise<boolean> {
		try {
			const loaded = await this.storage.load();
			if (loaded) {
				this.data = loaded;
				this.dirty = false;
				return true;
			}
			this.data = null;
			this.dirty = false;
			return false;
		} catch {
			this.data = null;
			this.dirty = false;
			return false;
		}
	}

	/**
	 * Save checkpoint to storage.
	 */
	async save(): Promise<void> {
		if (!this.dirty || !this.data) {
			return;
		}

		try {
			await this.storage.save(this.data);
			this.dirty = false;
		} catch (error) {
			console.warn(`Failed to save checkpoint: ${error}`);
		}
	}

	/**
	 * Save checkpoint incrementally (after each result).
	 * Uses the injected lock to prevent concurrent writes.
	 * @param result
	 */
	async saveIncremental(result: EvaluationResult): Promise<void> {
		// Acquire lock to prevent concurrent writes
		await this.lock.acquire();
		try {
			// Always reload from file to get latest state (prevents stale memory corruption)
			const currentData = await this.storage.load();

			// Use loaded data or initialize if empty
			let data: CheckpointData;
			data = currentData
				? currentData
				: {
						configHash: "pending",
						createdAt: new Date().toISOString(),
						updatedAt: new Date().toISOString(),
						completedRunIds: [],
						results: {},
						totalPlanned: 0,
						workerIndex: this.workerIndex,
						totalWorkers: this.totalWorkers,
					};

			// Record the result (only if not already present)
			if (!data.completedRunIds.includes(result.run.runId)) {
				data.completedRunIds.push(result.run.runId);
			}
			data.results[result.run.runId] = result;
			data.updatedAt = new Date().toISOString();

			// Save immediately
			await this.storage.save(data);
		} finally {
			this.lock.release();
		}
	}

	/**
	 * Check if checkpoint exists and is valid.
	 */
	exists(): boolean {
		return this.data !== null;
	}

	/**
	 * Check if a specific run has been completed.
	 * @param runId - Run identifier
	 */
	isCompleted(runId: string): boolean {
		return this.data?.completedRunIds.includes(runId) ?? false;
	}

	/**
	 * Get all completed results.
	 */
	getResults(): EvaluationResult[] {
		if (!this.data) {
			return [];
		}
		return Object.values(this.data.results);
	}

	/**
	 * Get progress information.
	 */
	getProgress(): { completed: number; total: number; percent: number } {
		if (!this.data) {
			return { completed: 0, total: 0, percent: 0 };
		}
		const completed = this.data.completedRunIds.length;
		const total = this.data.totalPlanned;
		const percent = total > 0 ? (completed / total) * 100 : 0;
		return { completed, total, percent: Math.round(percent) };
	}

	/**
	 * Check if checkpoint is stale (configuration has changed).
	 * @param suts - Current SUT definitions
	 * @param cases - Current case definitions
	 * @param config - Current executor config
	 * @param totalRuns - Total planned runs
	 */
	isStale<TExpander, TResult>(
		suts: SutDefinition<TExpander, TResult>[],
		cases: CaseDefinition<TExpander>[],
		config: Partial<ExecutorConfig>,
		totalRuns: number,
	): boolean {
		if (!this.data) {
			return false; // No checkpoint, not stale
		}

		const currentHash = this.computeConfigHash(suts, cases, config, totalRuns);
		return this.data.configHash !== currentHash;
	}

	/**
	 * Invalidate checkpoint (delete and start fresh).
	 */
	invalidate(): void {
		this.data = null;
		this.dirty = true;
	}

	/**
	 * Initialize empty checkpoint data.
	 * @param suts
	 * @param cases
	 * @param config
	 * @param totalRuns
	 * @param gitCommit
	 */
	initializeEmpty<TExpander, TResult>(
		suts?: SutDefinition<TExpander, TResult>[],
		cases?: CaseDefinition<TExpander>[],
		config?: Partial<ExecutorConfig>,
		totalRuns?: number,
		gitCommit?: string,
	): void {
		const configHash =
			suts && cases && config && totalRuns
				? this.computeConfigHash(suts, cases, config, totalRuns)
				: "pending";

		this.data = {
			configHash,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			completedRunIds: [],
			results: {},
			totalPlanned: totalRuns ?? 0,
			gitCommit,
			workerIndex: this.workerIndex,
			totalWorkers: this.totalWorkers,
		};
		this.dirty = true;
	}

	/**
	 * Compute hash of execution configuration.
	 * Used to detect when configuration changes invalidate checkpoint.
	 * @param suts
	 * @param cases
	 * @param config
	 * @param totalRuns
	 */
	private computeConfigHash<TExpander, TResult>(
		suts: SutDefinition<TExpander, TResult>[],
		cases: CaseDefinition<TExpander>[],
		config: Partial<ExecutorConfig>,
		totalRuns: number,
	): string {
		const signature: ConfigSignature = {
			suts: suts.map((s) => ({
				id: s.registration.id,
				version: s.registration.version,
			})),
			cases: cases.map((c) => ({
				id: c.case.caseId,
				version: c.case.version ?? "1.0.0",
			})),
			executorConfig: {
				repetitions: config.repetitions ?? 1,
				seedBase: config.seedBase ?? 42,
				timeoutMs: config.timeoutMs ?? 0,
			},
			totalRuns,
		};

		return createHash("sha256").update(JSON.stringify(signature)).digest("hex").slice(0, 16);
	}

	/**
	 * Get remaining planned runs (excluding completed).
	 * @param plannedRuns - All planned runs
	 */
	filterRemaining<T extends PlannedRun>(plannedRuns: T[]): T[] {
		if (!this.data) {
			return plannedRuns;
		}
		const completedSet = new Set(this.data.completedRunIds);
		return plannedRuns.filter((run) => !completedSet.has(run.runId));
	}

	/**
	 * Merge new results into checkpoint (for batch updates).
	 * @param results - New results to add
	 */
	mergeResults(results: EvaluationResult[]): void {
		if (!this.data) {
			this.initializeEmpty();
		}

		// Guard against null after initialization
		if (!this.data) {
			return;
		}

		for (const result of results) {
			if (!this.data.completedRunIds.includes(result.run.runId)) {
				this.data.completedRunIds.push(result.run.runId);
				this.data.results[result.run.runId] = result;
			}
		}
		this.dirty = true;
	}

	/**
	 * Merge multiple worker checkpoint shards into a single aggregated checkpoint.
	 *
	 * This is called after all parallel workers complete to aggregate their results.
	 * Each worker writes to its own shard file to avoid race conditions.
	 *
	 * @param shardPaths - Array of checkpoint shard file paths
	 * @returns The merged checkpoint data
	 */
	async mergeShards(shardPaths: string[]): Promise<CheckpointData> {
		// Start with main checkpoint data, or empty if no checkpoint exists yet
		const mainData = this.data;
		const merged: CheckpointData = {
			configHash: mainData?.configHash ?? "",
			createdAt: mainData?.createdAt ?? new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			completedRunIds: [...(mainData?.completedRunIds ?? [])],
			results: { ...mainData?.results },
			totalPlanned: mainData?.totalPlanned ?? 0,
			gitCommit: mainData?.gitCommit,
		};

		// Load and merge each shard
		for (const shardPath of shardPaths) {
			const shardStorage = new FileStorage(shardPath);
			const shardData = await shardStorage.load();

			if (shardData) {
				// Merge completed run IDs
				merged.completedRunIds.push(...shardData.completedRunIds);

				// Merge results
				Object.assign(merged.results, shardData.results);

				// Keep the maximum totalPlanned
				if (shardData.totalPlanned > merged.totalPlanned) {
					merged.totalPlanned = shardData.totalPlanned;
				}

				// Keep the earliest createdAt
				if (shardData.createdAt < merged.createdAt) {
					merged.createdAt = shardData.createdAt;
				}

				// Preserve config hash from first valid shard
				if (merged.configHash === "" && shardData.configHash !== "pending") {
					merged.configHash = shardData.configHash;
				}

				// Preserve git commit if available
				if (shardData.gitCommit && !merged.gitCommit) {
					merged.gitCommit = shardData.gitCommit;
				}
			}
		}

		// Deduplicate completedRunIds (in case of any overlap)
		merged.completedRunIds = [...new Set(merged.completedRunIds)];
		merged.updatedAt = new Date().toISOString();

		// Save merged checkpoint
		await this.storage.save(merged);

		// Update internal state
		this.data = merged;
		this.dirty = false;

		return merged;
	}

	/**
	 * Get checkpoint summary for logging.
	 */
	getSummary(): string {
		if (!this.data) {
			return "No checkpoint";
		}

		const progress = this.getProgress();
		return `Checkpoint: ${progress.completed}/${progress.total} runs (${progress.percent}%)`;
	}
}

/**
 * Get git commit hash for reproducibility.
 */
export const getGitCommit = async (): Promise<string | undefined> => {
	try {
		const { execSync } = await import("node:child_process");
		return execSync("git rev-parse HEAD", { encoding: "utf-8" }).trim();
	} catch {
		return undefined;
	}
};

/**
 * Create a checkpoint manager with default file storage.
 *
 * Convenience factory for simple cases.
 *
 * @param path - Checkpoint file path
 * @param lock - Optional lock implementation
 */
export const createFileCheckpointManager = (
	path = "results/execute/checkpoint.json",
	lock?: Lock,
): CheckpointManager => {
	const storage = new FileStorage(path);
	return new CheckpointManager({ storage, lock });
};
