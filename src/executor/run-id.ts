/**
 * Deterministic Run ID Generation
 *
 * Generates reproducible run IDs based on canonical inputs.
 * The same inputs will always produce the same run ID, enabling
 * exact result matching across executions.
 */

import { createHash } from "node:crypto";

/**
 * Input components for run ID generation.
 */
export interface RunIdInputs {
	/** SUT identifier */
	sutId: string;

	/** Case identifier */
	caseId: string;

	/** Random seed (if applicable) */
	seed?: number;

	/** Configuration hash (optional) */
	configHash?: string;

	/** Repetition number for statistical runs */
	repetition?: number;
}

/**
 * Generate a deterministic run ID from inputs.
 *
 * The run ID is a SHA-256 hash of the canonical JSON representation
 * of the inputs, truncated to 16 hex characters.
 *
 * @param inputs - Components to hash
 * @returns 16-character hex string
 *
 * @example
 * ```typescript
 * const runId = generateRunId({
 *   sutId: "degree-prioritised-v1.0.0",
 *   caseId: "karate-v1",
 *   seed: 42,
 *   repetition: 1,
 * });
 * // Always returns the same value for the same inputs
 * ```
 */
export const generateRunId = (inputs: RunIdInputs): string => {
	// Sort keys for canonical ordering
	const canonical = JSON.stringify(inputs, Object.keys(inputs).sort());
	return createHash("sha256").update(canonical).digest("hex").slice(0, 16);
};

/**
 * Generate a configuration hash from arbitrary config object.
 *
 * @param config - Configuration object
 * @returns 8-character hex string
 */
export const generateConfigHash = (config: Record<string, unknown>): string => {
	// Sort keys for consistent ordering, then stringify without replacer
	// (using replacer array would filter nested properties)
	const sortedKeys = Object.keys(config).sort();
	const sortedObj: Record<string, unknown> = {};
	for (const key of sortedKeys) {
		sortedObj[key] = config[key];
	}
	const canonical = JSON.stringify(sortedObj);
	return createHash("sha256").update(canonical).digest("hex").slice(0, 8);
};

/**
 * Validate that a run ID matches expected inputs.
 *
 * @param runId - Run ID to validate
 * @param inputs - Expected inputs
 * @returns true if run ID matches
 */
export const validateRunId = (runId: string, inputs: RunIdInputs): boolean =>
	runId === generateRunId(inputs);

/**
 * Parse a run ID into its components.
 * Note: This is not reversible - run IDs are hashes.
 * This function only validates the format.
 *
 * @param runId - Run ID to parse
 * @returns Object with validation info
 */
export const parseRunId = (runId: string): { valid: boolean; length: number } => {
	const isHex = /^[0-9a-f]+$/i.test(runId);
	return {
		valid: isHex && runId.length === 16,
		length: runId.length,
	};
};
