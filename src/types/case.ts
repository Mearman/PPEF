/**
 * Evaluation Case Type Definitions
 *
 * A case represents a single evaluation scenario with:
 * - Deterministic inputs (graph, seeds, etc.)
 * - Expected behavior or ground truth (if applicable)
 * - Grouping metadata for aggregation
 */

/**
 * Primitive types allowed in case summaries.
 */
export type Primitive = string | number | boolean | null;

/**
 * Reference to an external artefact (graph file, path set, etc.).
 */
export interface ArtefactReference {
	/** Type of artefact */
	type: "graph" | "path-set" | "subgraph" | "embedding" | "other";

	/** URI or path to artefact */
	uri: string;

	/** Content hash for integrity verification */
	hash?: string;

	/** Optional metadata */
	metadata?: Record<string, Primitive>;
}

/**
 * Input specification for an evaluation case.
 */
export interface CaseInputs {
	/** Scalar summary values (e.g., { nodes: 100, seeds: ["a", "b"] }) */
	summary?: Record<string, Primitive | Primitive[]>;

	/** References to external artefacts */
	artefacts?: ArtefactReference[];
}

/**
 * A single evaluation case.
 *
 * The caseId should be a deterministic hash of the canonical inputs
 * to ensure reproducibility across runs.
 */
export interface EvaluationCase {
	/** Deterministic ID (SHA-256 of canonical inputs) */
	caseId: string;

	/** Human-readable name */
	name?: string;

	/** Grouping label for aggregation (e.g., "scale-free", "bidirectional") */
	caseClass?: string;

	/** Input specification */
	inputs: CaseInputs;

	/** Optional expected output for oracle-based evaluation */
	expectedOutput?: {
		/** Expected summary values */
		summary?: Record<string, Primitive | Primitive[]>;

		/** Expected labels */
		labels?: Record<string, Primitive>;

		/** Expected ranking (for ranking tasks) */
		ranking?: { itemId: string; score: number }[];
	};

	/** Version of this case definition */
	version?: string;

	/** Tags for filtering */
	tags?: readonly string[];
}

/**
 * Complete case definition with universal input factories.
 *
 * The framework doesn't need to know what "expander" or "seeds" mean.
 * It only needs:
 * 1. getInput() - Load whatever resource the algorithm needs (graph, dataset, API client, etc.)
 * 2. getInputs() - Get algorithm-specific inputs from the case
 *
 * @template TInput - The resource type (e.g., Graph, Dataset, API client)
 * @template TInputs - The algorithm inputs type
 */
export interface CaseDefinition<TInput = unknown, TInputs = unknown> {
	/** The case specification */
	case: EvaluationCase;

	/** Original module path (relative to experiment config), used for worker serialization */
	sourceModule?: string;

	/** Original export name, used for worker serialization */
	sourceExportName?: string;

	/**
	 * Load the primary resource needed by the algorithm.
	 * This is called once per case and cached.
	 *
	 * Examples:
	 * - Expansion: Load a benchmark graph
	 * - Ranking: Load a graph with source/target metadata
	 * - ML: Load training dataset
	 *
	 * @returns Promise resolving to the resource
	 */
	getInput(): Promise<TInput>;

	/**
	 * Get algorithm-specific inputs for this case.
	 *
	 * Examples:
	 * - Expansion: { seeds: ["node1", "node2"] }
	 * - Ranking: { source: "node1", target: "node2", maxPaths: 10 }
	 * - Classification: { labels: ["cat", "dog"], threshold: 0.5 }
	 *
	 * @returns Algorithm inputs
	 */
	getInputs(): TInputs;
}
