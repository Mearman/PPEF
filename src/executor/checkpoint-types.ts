/**
 * Checkpoint Types
 *
 * Central type definitions for the checkpoint system.
 * Separated from implementation files for clarity and testability.
 */

import type { CheckpointStorage, Lock } from "./checkpoint-storage.js";

// Re-export Lock for convenience

/**
 * Checkpoint manager configuration options.
 */
export interface CheckpointConfig {
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
 * Worker identity for sharded checkpoint execution.
 */
export interface WorkerIdentity {
	/** Index of this worker (0-based) */
	index: number;

	/** Total number of workers */
	total: number;

	/** Human-readable name */
	name: string;
}

/**
 * Checkpoint shard information.
 */
export interface CheckpointShard {
	/** Path to this shard's checkpoint file */
	path: string;

	/** Worker index that owns this shard */
	workerIndex: number;

	/** Number of completed runs in this shard */
	completedCount: number;

	/** Whether this shard exists and is valid */
	valid: boolean;
}

export { type Lock } from "./checkpoint-storage.js";
