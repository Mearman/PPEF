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
export type EvaluationType = "claims" | "robustness" | "metrics" | "exploratory" | "custom";

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
 * Abstract evaluator interface for registry storage and collections.
 *
 * This non-generic interface uses `unknown` to accommodate any evaluator type.
 * It enables evaluators to be stored in collections without type parameter conflicts.
 *
 * For type-safe operations, use the `Evaluator<TConfig, TInput, TOutput>` type instead.
 */
export interface IEvaluator {
	/** Unique type identifier for this evaluator */
	readonly type: EvaluationType;

	/**
	 * Validate configuration before evaluation.
	 *
	 * @param config - Configuration to validate (unknown for compatibility)
	 * @returns Validation result
	 */
	validateConfig(config: unknown): ValidationResult;

	/**
	 * Perform evaluation.
	 *
	 * @param config - Evaluator configuration (unknown for compatibility)
	 * @param input - Input data for evaluation (unknown for compatibility)
	 * @returns Evaluation output
	 */
	evaluate(config: unknown, input: unknown): EvaluationOutput<unknown>;

	/**
	 * Create a summary of evaluation results.
	 *
	 * @param output - Evaluation output to summarize
	 * @returns Summary statistics
	 */
	summarize(output: EvaluationOutput<unknown>): EvaluationSummary;
}

/**
 * Generic evaluator type for type-safe evaluator implementations.
 *
 * This intersection type combines `IEvaluator` with type-specific method signatures.
 * Classes that implement both interfaces (via structural typing) automatically satisfy
 * this type - no code duplication needed.
 *
 * @template TConfig - Configuration type for this evaluator
 * @template TInput - Input type for evaluation
 * @template TOutput - Output type for evaluation results
 *
 * @example
 * ```ts
 * class MyEvaluator implements Evaluator<MyConfig, MyInput, MyOutput>, IEvaluator {
 *   readonly type = "custom" as const;
 *
 *   // Generic type-safe methods (for Evaluator<>)
 *   validateConfig(config: MyConfig): ValidationResult { ... }
 *   evaluate(config: MyConfig, input: MyInput): EvaluationOutput<MyOutput> { ... }
 *   summarize(output: EvaluationOutput<MyOutput>): EvaluationSummary { ... }
 *
 *   // Unknown methods are automatically satisfied by structural typing
 *   // No need to duplicate - TypeScript treats MyConfig as assignable to unknown
 * }
 * ```
 */
export type Evaluator<TConfig extends EvaluatorConfig, TInput, TOutput> = IEvaluator & {
	validateConfig(config: TConfig): ValidationResult;
	evaluate(config: TConfig, input: TInput): EvaluationOutput<TOutput>;
	summarize(output: EvaluationOutput<TOutput>): EvaluationSummary;
};

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

// ============================================================================
// Exploratory Evaluator Types
// ============================================================================

/**
 * Metric direction for ranking interpretation.
 */
export type MetricDirection = "higher-better" | "lower-better";

/**
 * Ranking of a SUT for a specific metric.
 */
export interface SutMetricRanking {
	/** SUT identifier */
	sut: string;

	/** Mean value for this metric */
	mean: number;

	/** Median value for this metric */
	median: number;

	/** Standard deviation */
	std?: number;

	/** Rank (1 = best based on metric direction) */
	rank: number;

	/** Number of observations */
	n: number;
}

/**
 * Pairwise comparison between two SUTs.
 */
export interface PairwiseComparison {
	/** First SUT identifier */
	sutA: string;

	/** Second SUT identifier */
	sutB: string;

	/** Metric being compared */
	metric: string;

	/** Difference (sutA - sutB) */
	delta: number;

	/** Ratio (sutA / sutB) */
	ratio: number;

	/** p-value from statistical test */
	pValue?: number;

	/** Effect size (Cohen's d or similar) */
	effectSize?: number;

	/** Whether the difference is statistically significant */
	significant: boolean;
}

/**
 * Effect of a case class on SUT performance.
 */
export interface CaseClassEffect {
	/** Case class identifier */
	caseClass: string;

	/** SUT identifier */
	sut: string;

	/** Metric being analyzed */
	metric: string;

	/** Deviation from the SUT's overall mean for this metric */
	deviationFromMean: number;

	/** Percentage deviation from mean */
	percentageDeviation?: number;

	/** Whether the effect is statistically significant */
	significant: boolean;
}

/**
 * Correlation between two metrics.
 */
export interface MetricCorrelation {
	/** First metric */
	metricA: string;

	/** Second metric */
	metricB: string;

	/** Pearson correlation coefficient */
	pearsonR: number;

	/** Spearman rank correlation coefficient */
	spearmanRho?: number;

	/** Human-readable interpretation */
	interpretation: string;
}

/**
 * Configuration for the exploratory evaluator.
 */
export interface ExploratoryEvaluatorConfig extends EvaluatorConfig {
	/** Metrics to analyze (if not specified, all available metrics are used) */
	metrics?: string[];

	/** SUTs to include (if not specified, all available SUTs are used) */
	suts?: string[];

	/** Metric directions for ranking interpretation */
	metricDirections?: Record<string, MetricDirection>;

	/** Significance level for statistical tests (default: 0.05) */
	significanceLevel?: number;

	/** Minimum effect size to consider meaningful */
	minEffectSize?: number;

	/** Whether to compute metric correlations */
	computeCorrelations?: boolean;

	/** Whether to analyze case-class effects */
	analyzeCaseClassEffects?: boolean;
}

/**
 * Summary of exploratory evaluation results.
 */
export interface ExploratoryEvaluationSummary {
	/** Schema version */
	version: string;

	/** Generation timestamp */
	timestamp: string;

	/** SUT rankings per metric */
	rankings: Record<string, SutMetricRanking[]>;

	/** Pairwise comparisons between SUTs */
	pairwiseComparisons: PairwiseComparison[];

	/** Case-class effects (if analyzed) */
	caseClassEffects?: CaseClassEffect[];

	/** Metric correlations (if computed) */
	metricCorrelations?: MetricCorrelation[];

	/** Summary statistics */
	summary: {
		/** Number of SUTs analyzed */
		sutsAnalyzed: number;

		/** Number of metrics analyzed */
		metricsAnalyzed: number;

		/** Number of pairwise comparisons */
		pairwiseComparisonsCount: number;

		/** Number of significant differences found */
		significantDifferences: number;

		/** Number of case classes analyzed */
		caseClassesAnalyzed?: number;

		/** Best SUT per metric */
		bestSutPerMetric: Record<string, string>;
	};
}

/**
 * Data type for exploratory evaluator output.
 */
export type ExploratoryEvaluatorData = ExploratoryEvaluationSummary;
