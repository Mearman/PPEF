/**
 * Deterministic Run ID Generation
 *
 * Generates reproducible run IDs based on canonical inputs.
 * The same inputs will always produce the same run ID, enabling
 * exact result matching across executions.
 *
 * Canonicalization follows RFC 8785 (JSON Canonicalization Scheme / JCS).
 * This ensures cross-language determinism: Python, Rust, Go, etc. all
 * have JCS libraries that produce identical byte output.
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
 * Serialize a value to RFC 8785 (JCS) canonical JSON.
 *
 * Rules:
 * - Object keys are sorted lexicographically (by UTF-16 code units)
 * - No whitespace
 * - Undefined values and undefined object properties are omitted
 * - Numbers use ECMAScript toString() (which matches RFC 8785 for finite numbers)
 * - Strings use minimal JSON escaping
 *
 * @param value - Value to canonicalize
 * @returns Canonical JSON string
 */
export const canonicalize = (value: unknown): string => {
	if (value === null || value === undefined) {
		return "null";
	}

	if (typeof value === "boolean") {
		return value ? "true" : "false";
	}

	if (typeof value === "number") {
		if (!Number.isFinite(value)) {
			return "null";
		}
		// ECMAScript Number.toString() matches RFC 8785 for finite numbers
		return Object.is(value, -0) ? "0" : String(value);
	}

	if (typeof value === "string") {
		return JSON.stringify(value);
	}

	if (Array.isArray(value)) {
		const items = value.map((item) => canonicalize(item));
		return `[${items.join(",")}]`;
	}

	if (typeof value === "object") {
		const obj = Object.entries(value);
		const keys = obj
			.filter(([, v]) => v !== undefined)
			.map(([k]) => k)
			.sort();
		const entries = Object.fromEntries(obj);
		const pairs = keys.map((k) => `${JSON.stringify(k)}:${canonicalize(entries[k])}`);
		return `{${pairs.join(",")}}`;
	}

	return "null";
};

/**
 * Generate a deterministic run ID from inputs.
 *
 * The run ID is a SHA-256 hash of the RFC 8785 (JCS) canonical JSON
 * representation of the inputs, truncated to 16 hex characters.
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
	const canonical = canonicalize(inputs);
	return createHash("sha256").update(canonical).digest("hex").slice(0, 16);
};

/**
 * Generate a configuration hash from arbitrary config object.
 *
 * @param config - Configuration object
 * @returns 8-character hex string
 */
export const generateConfigHash = (config: Record<string, unknown>): string => {
	const canonical = canonicalize(config);
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
