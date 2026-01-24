/**
 * Evaluator Type Definitions
 *
 * Core abstractions for the extensible evaluation system.
 * All evaluators implement the Evaluator interface, enabling
 * a unified API for claims, robustness, metrics, and custom evaluations.
 */

import type { AggregatedResult } from "./aggregate.js";
import type { EvaluationResult } from "./result.js";

/**
 * Built-in evaluation types.
 * Custom types can be registered at runtime.
 */
export type EvaluationType = "claims" | "robustness" | "metrics" | "custom";

/**
 * Base configuration for any evaluator.
 */
export interface EvaluatorConfig {
	/** Human-readable name for this evaluator */
	name?: string;

	/** Optional description */
	description?: string;

	/** Additional evaluator-specific options */
	options?: Record<string, unknown>;
}

/**
 * Result of validating evaluator configuration.
 */
export interface ValidationResult {
	/** Whether the configuration is valid */
	valid: boolean;

	/** Error messages if invalid */
	errors?: string[];

	/** Warnings for non-fatal issues */
	warnings?: string[];
}

/**
 * Generic evaluator interface.
 *
 * @template TConfig - Configuration type for this evaluator
 * @template TInput - Input type for evaluation
 * @template TOutput - Output type for evaluation results
 */
export interface Evaluator<TConfig extends EvaluatorConfig, TInput, TOutput> {
	/** Unique type identifier for this evaluator */
	readonly type: EvaluationType;

	/**
	 * Validate configuration before evaluation.
	 *
	 * @param config - Configuration to validate
	 * @returns Validation result
	 */
	validateConfig(config: TConfig): ValidationResult;

	/**
	 * Perform evaluation.
	 *
	 * @param config - Evaluator configuration
	 * @param input - Input data for evaluation
	 * @returns Evaluation output
	 */
	evaluate(config: TConfig, input: TInput): EvaluationOutput<TOutput>;

	/**
	 * Create a summary of evaluation results.
	 *
	 * @param output - Evaluation output to summarize
	 * @returns Summary statistics
	 */
	summarize(output: EvaluationOutput<TOutput>): EvaluationSummary;
}

/**
 * Generic evaluation output wrapper.
 *
 * All evaluators produce output in this format, providing
 * a consistent shape for the renderer layer.
 *
 * @template T - Type-specific data
 */
export interface EvaluationOutput<T> {
	/** Evaluator type that produced this output */
	type: EvaluationType;

	/** Schema version for this output format */
	version: string;

	/** Generation timestamp */
	timestamp: string;

	/** Type-specific evaluation data */
	data: T;

	/** Optional metadata */
	metadata?: {
		/** Input file or source */
		inputSource?: string;

		/** Configuration used */
		config?: EvaluatorConfig;

		/** Additional metadata */
		[key: string]: unknown;
	};
}

/**
 * Generic evaluation summary.
 */
export interface EvaluationSummary {
	/** Total number of items evaluated */
	total: number;

	/** Number of items that passed criteria */
	passed?: number;

	/** Number of items that failed criteria */
	failed?: number;

	/** Number of items with inconclusive results */
	inconclusive?: number;

	/** Pass rate (passed / total) */
	passRate?: number;

	/** Additional summary metrics */
	additional?: Record<string, number | string>;
}

/**
 * Evaluation context for evaluators that work with aggregates.
 */
export interface EvaluationContext {
	/** Aggregated results */
	aggregates: AggregatedResult[];

	/** Optional raw results for more detailed analysis */
	rawResults?: EvaluationResult[];

	/** Metadata about the evaluation */
	metadata?: {
		/** Source of the aggregates */
		source?: string;

		/** Configuration hash for reproducibility */
		configHash?: string;

		/** Timestamp when aggregates were generated */
		aggregatesTimestamp?: string;

		/** Additional metadata */
		[key: string]: unknown;
	};
}

// ============================================================================
// Claims Evaluator Types
// ============================================================================

import type { ClaimEvaluationSummary, EvaluationClaim } from "./claims.js";

/**
 * Configuration for the claims evaluator.
 */
export interface ClaimsEvaluatorConfig extends EvaluatorConfig {
	/** Claims to evaluate */
	claims: EvaluationClaim[];

	/** Optional significance level override */
	significanceLevel?: number;

	/** Optional minimum effect size override */
	minEffectSize?: number;
}

/**
 * Data type for claims evaluator output.
 */
export type ClaimsEvaluatorData = ClaimEvaluationSummary;

// ============================================================================
// Robustness Evaluator Types
// ============================================================================

import type { RobustnessAnalysisOutput } from "./perturbation.js";

/**
 * Configuration for the robustness evaluator.
 */
export interface RobustnessEvaluatorConfig extends EvaluatorConfig {
	/** Metrics to analyze */
	metrics: string[];

	/** Perturbations applied */
	perturbations: string[];

	/** Intensity levels tested (if applicable) */
	intensityLevels?: number[];

	/** Number of runs per perturbation level */
	runsPerLevel?: number;
}

/**
 * Data type for robustness evaluator output.
 */
export type RobustnessEvaluatorData = RobustnessAnalysisOutput;

// ============================================================================
// Metrics Evaluator Types
// ============================================================================

/**
 * Criterion type for metrics evaluation.
 */
export type MetricsCriterionType = "threshold" | "baseline" | "target-range";

/**
 * A single metrics evaluation criterion.
 */
export interface MetricsCriterion {
	/** Unique identifier */
	criterionId: string;

	/** Human-readable description */
	description: string;

	/** Type of criterion */
	type: MetricsCriterionType;

	/** Metric to evaluate */
	metric: string;

	/** SUT to evaluate (or "*" for all SUTs) */
	sut: string;

	/** For threshold: operator and value */
	threshold?: {
		operator: "gt" | "gte" | "lt" | "lte" | "eq";
		value: number;
	};

	/** For baseline: baseline SUT and comparison */
	baseline?: {
		sut: string;
		operator: "gt" | "gte" | "lt" | "lte" | "eq";
	};

	/** For target-range: min and max values */
	targetRange?: {
		min?: number;
		max?: number;
		minInclusive?: boolean;
		maxInclusive?: boolean;
	};

	/** Optional scope constraints */
	scopeConstraints?: {
		caseClass?: string | string[];
	};

	/** Tags for filtering */
	tags?: readonly string[];
}

/**
 * Result of evaluating a single metrics criterion.
 */
export interface MetricsCriterionResult {
	/** The criterion being evaluated */
	criterion: MetricsCriterion;

	/** Pass/fail status */
	status: "pass" | "fail" | "inconclusive";

	/** Actual value(s) observed */
	observed: {
		sut: string;
		value: number;
	}[];

	/** Expected value or range */
	expected: {
		type: MetricsCriterionType;
		threshold?: number;
		baselineValue?: number;
		targetRange?: { min?: number; max?: number };
	};

	/** Reason for inconclusive status (if applicable) */
	inconclusiveReason?: string;
}

/**
 * Summary of metrics evaluation.
 */
export interface MetricsEvaluationSummary {
	/** Schema version */
	version: string;

	/** Generation timestamp */
	timestamp: string;

	/** Individual criterion results */
	results: MetricsCriterionResult[];

	/** Summary statistics */
	summary: {
		/** Total criteria evaluated */
		total: number;

		/** Criteria passed */
		passed: number;

		/** Criteria failed */
		failed: number;

		/** Criteria inconclusive */
		inconclusive: number;

		/** Overall pass rate */
		passRate: number;

		/** Pass rate by SUT */
		passRateBySut: Record<string, number>;
	};
}

/**
 * Configuration for the metrics evaluator.
 */
export interface MetricsEvaluatorConfig extends EvaluatorConfig {
	/** Criteria to evaluate */
	criteria: MetricsCriterion[];
}

/**
 * Data type for metrics evaluator output.
 */
export type MetricsEvaluatorData = MetricsEvaluationSummary;

// ============================================================================
// Custom Evaluator Types
// ============================================================================

/**
 * Configuration for a custom evaluator.
 * Users can extend this with their own properties.
 */
export interface CustomEvaluatorConfig extends EvaluatorConfig {
	/** Custom evaluator type name */
	customType: string;

	/** Additional custom properties */
	[key: string]: unknown;
}

/**
 * Data type for custom evaluator output.
 * Users can define their own output structure.
 */
export type CustomEvaluatorData = Record<string, unknown>;
