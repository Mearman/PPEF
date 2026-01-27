/**
 * Evaluation Result Type Definitions
 *
 * The canonical schema for individual evaluation results. Each result
 * captures everything needed for reproducibility and auditing:
 * - Deterministic run identity
 * - Correctness assessment
 * - Output artefacts and metrics
 * - Provenance information
 */

import type { ArtefactReference, Primitive } from "./case.js";
import type { SutRole } from "./sut.js";

/**
 * Categories of evaluation failure.
 */
export type FailureType =
	| "no_output" // Algorithm produced no output
	| "invalid_structure" // Output has wrong structure
	| "constraint_violation" // Output violates constraints
	| "exception" // Algorithm threw an exception
	| "oracle_mismatch" // Output doesn't match oracle
	| "timeout"; // Algorithm exceeded time limit

/**
 * Run identity and context.
 */
export interface RunContext {
	/** Deterministic run ID (hash of inputs) */
	runId: string;

	/** SUT identifier */
	sut: string;

	/** SUT role (primary/baseline/oracle) */
	sutRole: SutRole;

	/** SUT version for reproducibility */
	sutVersion?: string;

	/** Case identifier */
	caseId: string;

	/** Case class for grouping */
	caseClass?: string;

	/** Configuration overrides for this run */
	config?: Record<string, Primitive>;

	/** Random seed if applicable */
	seed?: number;

	/** Repetition number for statistical runs */
	repetition?: number;
}

/**
 * Correctness assessment.
 */
export interface CorrectnessResult {
	/** Whether expected output exists (oracle available) */
	expectedExists: boolean;

	/** Whether the SUT produced any output */
	producedOutput: boolean;

	/** Whether output is structurally valid */
	valid: boolean;

	/** Whether output matches expected (null if no oracle) */
	matchesExpected: boolean | null;

	/** Failure classification if applicable */
	failureType?: FailureType;

	/** Human-readable failure notes */
	notes?: string[];
}

/**
 * A ranked item for ranking tasks.
 */
export interface RankedItem {
	/** Item identifier */
	itemId: string;

	/** Score or rank value */
	score: number;

	/** Optional additional metadata */
	metadata?: Record<string, Primitive>;
}

/**
 * Output artefacts and summaries.
 */
export interface ResultOutputs {
	/** Scalar summary values */
	summary?: Record<string, Primitive | Primitive[]>;

	/** Classification labels */
	labels?: Record<string, Primitive>;

	/** Ranking results */
	ranking?: RankedItem[];

	/** References to generated artefacts */
	artefacts?: ArtefactReference[];

	/** Additional untyped outputs */
	extra?: Record<string, unknown>;
}

/**
 * Numeric metrics collected during evaluation.
 */
export interface ResultMetrics {
	/** Primary numeric metrics */
	numeric: Record<string, number>;

	/** Additional metrics (overflow) */
	extra?: Record<string, number>;

	/** Allow arbitrary number properties for scenario-specific metrics */
	[key: string]: number | Record<string, number> | undefined;
}

/**
 * Provenance information for reproducibility.
 */
export interface Provenance {
	/** Execution environment */
	runtime: {
		platform: string;
		arch: string;
		nodeVersion: string;
	};

	/** Git commit hash */
	gitCommit?: string;

	/** Whether working directory had uncommitted changes */
	dirty?: boolean;

	/** Hash of package-lock.json for dependency pinning */
	dependencyLockHash?: string;

	/** Parent run IDs (for derived results) */
	parentRunIds?: string[];

	/** Execution timestamp */
	timestamp?: string;

	/** Wall-clock execution time in milliseconds */
	executionTimeMs?: number;

	/** Peak memory usage during execution (bytes) */
	peakMemoryBytes?: number;

	/** Memory usage at completion (bytes) */
	finalMemoryBytes?: number;
}

/**
 * Complete evaluation result.
 *
 * This is the canonical schema for all evaluation outputs. Every experiment
 * produces results in this format for consistent aggregation and rendering.
 */
export interface EvaluationResult {
	/** Run identity and context */
	run: RunContext;

	/** Correctness assessment */
	correctness: CorrectnessResult;

	/** Output artefacts and summaries */
	outputs: ResultOutputs;

	/** Numeric metrics */
	metrics: ResultMetrics;

	/** Provenance for reproducibility */
	provenance: Provenance;
}

/**
 * Batch of evaluation results.
 */
export interface ResultBatch {
	/** Schema version */
	version: string;

	/** Generation timestamp */
	timestamp: string;

	/** All results in this batch */
	results: EvaluationResult[];

	/** Optional batch-level metadata */
	metadata?: Record<string, Primitive>;
}
