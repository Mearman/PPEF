/**
 * System Under Test (SUT) Type Definitions
 *
 * SUTs represent the algorithms being evaluated. Each SUT has a role that
 * determines how its results are interpreted during evaluation:
 *
 * - primary: The algorithm being proposed/evaluated (e.g., Degree-Prioritised)
 * - baseline: Comparison algorithms (e.g., Standard BFS, Frontier-Balanced)
 * - oracle: Ground truth provider for correctness validation
 */

/**
 * Role of the SUT in evaluation.
 *
 * - `primary`: The algorithm being proposed/evaluated
 * - `baseline`: Comparison algorithm for relative evaluation
 * - `oracle`: Ground truth provider for correctness validation
 */
export type SutRole = "primary" | "baseline" | "oracle";

/**
 * Registration information for a System Under Test.
 */
export interface SutRegistration {
	/** Unique identifier (e.g., "degree-prioritised-v1.0.0") */
	id: string;

	/** Human-readable name (e.g., "Degree-Prioritised Expansion") */
	name: string;

	/** Version string for reproducibility */
	version: string;

	/** Role in evaluation */
	role: SutRole;

	/** Configuration parameters (immutable) */
	config: Readonly<Record<string, unknown>>;

	/** Searchable tags for filtering */
	tags: readonly string[];

	/** Optional description for documentation */
	description?: string;
}

/**
 * Universal SUT interface for algorithms that take inputs and produce results.
 *
 * This is the core abstraction - any algorithm can be evaluated if it:
 * 1. Takes INPUTS (what it needs to run)
 * 2. Produces OUTPUTS (what it returns)
 * 3. Can be measured (metrics extraction)
 *
 * @template TInputs - The algorithm-specific inputs type
 * @template TResult - The algorithm result type
 */
export interface SUT<TInputs, TResult> {
	/** Unique identifier */
	readonly id: string;

	/** Immutable configuration */
	readonly config: Readonly<Record<string, unknown>>;

	/**
	 * Execute the algorithm.
	 *
	 * @param inputs - Algorithm-specific inputs
	 * @returns Promise resolving to algorithm result
	 */
	run(inputs: TInputs): Promise<TResult>;
}

/**
 * Factory function type for instantiating SUTs.
 *
 * @template TInputs - The algorithm inputs type
 * @template TResult - The algorithm result type
 */
export type SutFactory<TInputs, TResult> = (
	config?: Record<string, unknown>,
) => SUT<TInputs, TResult>;

/**
 * Runtime instance of a SUT ready for execution.
 * @deprecated Use SUT<TInputs, TResult> directly
 */
export interface SutInstance<TResult> {
	/** Execute the algorithm and return results */
	run(): Promise<TResult>;
}

/**
 * Complete SUT definition including factory and metadata.
 *
 * @template TInputs - The algorithm inputs type
 * @template TResult - The algorithm result type
 */
export interface SutDefinition<TInputs = unknown, TResult = unknown> {
	/** Registration metadata */
	registration: SutRegistration;

	/** Factory for creating SUT instances */
	factory: SutFactory<TInputs, TResult>;
}

/**
 * Universal SUT result structure.
 *
 * Generic outputs allow any algorithm type to be evaluated:
 * - Expansion: paths, nodes, edges
 * - Ranking: ranked paths, scores
 * - Classification: labels, confidences
 *
 * @template TOutputs - The outputs type (generic, not hardcoded)
 */
export interface SUTResult<TOutputs = unknown> {
	/** Unique identifier for this run */
	runId: string;

	/** SUT identifier */
	sutId: string;

	/** SUT version */
	sutVersion: string;

	/** Case identifier */
	caseId: string;

	/** Unix timestamp of execution */
	timestamp: number;

	/** Execution duration in milliseconds */
	duration: number;

	/** Correctness assessment */
	correctness: {
		/** Whether an expected output was defined */
		expectedExists: boolean;

		/** Whether the SUT produced any output */
		producedOutput: boolean;

		/** Whether the output is structurally valid */
		valid: boolean;

		/** Whether the output matches the expected output (null if no expected output) */
		matchesExpected: boolean | null;
	};

	/** SUT outputs - generic, not hardcoded to paths */
	outputs: TOutputs;

	/** Computed metrics */
	metrics: Record<string, number>;
}
