/**
 * Aggregated Result Type Definitions
 *
 * Aggregated results summarise multiple evaluation runs with statistical
 * measures. This is the intermediate format between raw results and
 * final rendered output (LaTeX tables, etc.).
 */

import type { Primitive } from "./case.js";
import type { SutRole } from "./sut.js";

/**
 * Summary statistics for a numeric metric.
 */
export interface SummaryStats {
	/** Number of observations */
	n: number;

	/** Arithmetic mean */
	mean: number;

	/** Median (50th percentile) */
	median: number;

	/** Minimum value */
	min: number;

	/** Maximum value */
	max: number;

	/** Standard deviation (sample) */
	std?: number;

	/** 95% confidence interval [lower, upper] */
	confidence95?: [number, number];

	/** Sum of all values */
	sum?: number;

	/** 25th percentile */
	p25?: number;

	/** 75th percentile */
	p75?: number;
}

/**
 * Comparison metrics between primary and baseline SUTs.
 */
export interface ComparisonMetrics {
	/** Absolute deltas (primary - baseline) */
	deltas: Record<string, number>;

	/** Ratios (primary / baseline) */
	ratios: Record<string, number>;

	/** Win rate (% of cases where primary beats baseline) */
	betterRate?: number;

	/** Mann-Whitney U statistic */
	uStatistic?: number;

	/** Statistical significance (p-value) */
	pValue?: number;

	/** Effect size (Cohen's d) */
	effectSize?: number;
}

/**
 * Coverage information for the aggregation.
 */
export interface CoverageMetrics {
	/** Fraction of cases covered */
	caseCoverage: number;

	/** Metric availability (metric name -> coverage fraction) */
	metricCoverage: Record<string, number>;

	/** Missing case IDs */
	missingCases?: string[];
}

/**
 * Aggregated result for a SUT (optionally grouped by case class).
 */
export interface AggregatedResult {
	/** SUT identifier */
	sut: string;

	/** SUT role */
	sutRole: SutRole;

	/** Case class (if grouped) */
	caseClass?: string;

	/** Grouping information */
	group: {
		/** Number of runs in this aggregate */
		runCount: number;

		/** Number of unique cases */
		caseCount: number;

		/** Hash of configuration (for homogeneity check) */
		configHash?: string;
	};

	/** Correctness summary */
	correctness: {
		/** Fraction of runs that produced valid output */
		validRate: number;

		/** Fraction of runs that produced any output */
		producedOutputRate: number;

		/** Fraction of runs matching expected (if oracle available) */
		matchesExpectedRate?: number;

		/** Breakdown of failure types */
		failureBreakdown?: Record<string, number>;
	};

	/** Aggregated metrics (metric name -> summary stats) */
	metrics: Record<string, SummaryStats>;

	/** Comparisons with baselines (baseline SUT id -> comparison) */
	comparisons?: Record<string, ComparisonMetrics>;

	/** Coverage information */
	coverage?: CoverageMetrics;

	/** Additional metadata */
	metadata?: Record<string, Primitive>;
}

/**
 * Complete aggregation output.
 */
export interface AggregationOutput {
	/** Schema version */
	version: string;

	/** Generation timestamp */
	timestamp: string;

	/** Aggregated results */
	aggregates: AggregatedResult[];

	/** Global metadata */
	metadata?: {
		/** Total runs processed */
		totalRuns: number;

		/** Total unique cases */
		totalCases: number;

		/** SUTs included */
		sutsIncluded: string[];

		/** Case classes included */
		caseClassesIncluded?: string[];
	};
}
