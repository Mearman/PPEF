/**
 * Perturbation Type Definitions
 *
 * Perturbations modify evaluation cases to test algorithm robustness.
 * They enable sensitivity analysis by measuring how metrics change
 * under controlled variations of the input.
 */

import type { EvaluationCase, Primitive } from "./case.js";

/**
 * A perturbation that modifies an evaluation case.
 */
export interface Perturbation {
	/** Unique identifier */
	id: string;

	/** Human-readable name */
	name: string;

	/** Description of what the perturbation does */
	description: string;

	/** Type of perturbation */
	type: "structural" | "seed" | "noise" | "parameter";

	/** Perturbation intensity (0-1 scale) */
	intensity?: number;

	/** Apply the perturbation to a case */
	apply(evaluationCase: EvaluationCase, seed?: number): EvaluationCase;
}

/**
 * Built-in perturbation types.
 */
export type PerturbationType =
	| "edge-removal" // Remove random edges
	| "edge-addition" // Add random edges
	| "seed-shift" // Move seed nodes to neighbors
	| "node-removal" // Remove random nodes
	| "degree-rewiring" // Rewire to change degree distribution
	| "weight-noise"; // Add noise to edge weights

/**
 * Configuration for a perturbation.
 */
export interface PerturbationConfig {
	/** Perturbation type */
	type: PerturbationType;

	/** Intensity (e.g., fraction of edges to remove) */
	intensity: number;

	/** Random seed for reproducibility */
	seed?: number;

	/** Additional type-specific parameters */
	params?: Record<string, Primitive>;
}

/**
 * Metrics for robustness analysis.
 */
export interface RobustnessMetrics {
	/** Variance of metric under perturbation */
	varianceUnderPerturbation: number;

	/** Standard deviation */
	stdUnderPerturbation: number;

	/** Coefficient of variation */
	coefficientOfVariation: number;

	/** Ranking stability (Kendall's tau between perturbed rankings) */
	rankingStability?: number;

	/** Degradation curve: metric value at each perturbation level */
	degradationCurve?: {
		perturbationLevel: number;
		metricValue: number;
		stdDev?: number;
	}[];

	/** Breakpoint: intensity where metric degrades significantly */
	breakpoint?: number;
}

/**
 * Result of robustness analysis for a single SUT.
 */
export interface RobustnessAnalysisResult {
	/** SUT identifier */
	sut: string;

	/** Case class (if grouped) */
	caseClass?: string;

	/** Perturbation applied */
	perturbation: string;

	/** Metric being analyzed */
	metric: string;

	/** Robustness metrics */
	robustness: RobustnessMetrics;

	/** Baseline (unperturbed) value */
	baselineValue: number;

	/** Number of perturbation runs */
	runCount: number;
}

/**
 * Complete robustness analysis output.
 */
export interface RobustnessAnalysisOutput {
	/** Schema version */
	version: string;

	/** Generation timestamp */
	timestamp: string;

	/** Individual analysis results */
	results: RobustnessAnalysisResult[];

	/** Configuration used */
	config: {
		/** Perturbations applied */
		perturbations: string[];

		/** Metrics analyzed */
		metrics: string[];

		/** Intensity levels tested */
		intensityLevels?: number[];

		/** Runs per perturbation level */
		runsPerLevel: number;
	};
}
