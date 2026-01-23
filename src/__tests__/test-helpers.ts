/**
 * Test Helpers for Framework Tests
 *
 * Factory functions for creating mock evaluation results, aggregates,
 * and claims for testing the evaluation framework.
 */

import type { AggregatedResult, SummaryStats } from "../types/aggregate.js";
import type {
	ClaimEvaluation,
	ClaimEvidence,
	ClaimStatus,
	EvaluationClaim,
} from "../types/claims.js";
import type {
	CorrectnessResult,
	EvaluationResult,
	Provenance,
	ResultMetrics,
	ResultOutputs,
	RunContext,
} from "../types/result.js";
import type { SutRole } from "../types/sut.js";

/**
 * Create a mock EvaluationResult with sensible defaults.
 *
 * @param overrides - Partial fields to override defaults
 * @returns A complete EvaluationResult
 */
export const createMockResult = (overrides?: Partial<EvaluationResult>): EvaluationResult => {
	const defaultRun: RunContext = {
		runId: "mock-run-001",
		sut: "test-sut-v1.0.0",
		sutRole: "primary",
		caseId: "test-case-001",
		caseClass: "test-class",
	};

	const defaultCorrectness: CorrectnessResult = {
		expectedExists: true,
		producedOutput: true,
		valid: true,
		matchesExpected: true,
	};

	const defaultOutputs: ResultOutputs = {
		summary: {},
	};

	const defaultMetrics: ResultMetrics = {
		numeric: {
			"execution-time": 100,
			"nodes-expanded": 50,
			"path-diversity": 0.75,
		},
	};

	const defaultProvenance: Provenance = {
		runtime: {
			platform: "darwin",
			arch: "arm64",
			nodeVersion: "20.0.0",
		},
		timestamp: new Date().toISOString(),
	};

	return {
		run: { ...defaultRun, ...overrides?.run },
		correctness: { ...defaultCorrectness, ...overrides?.correctness },
		outputs: { ...defaultOutputs, ...overrides?.outputs },
		metrics: { ...defaultMetrics, ...overrides?.metrics },
		provenance: { ...defaultProvenance, ...overrides?.provenance },
	};
};

/**
 * Create multiple mock results for a specific SUT.
 *
 * @param count - Number of results to create
 * @param sut - SUT identifier
 * @param role - SUT role (default: "primary")
 * @param caseClass - Optional case class
 * @returns Array of EvaluationResults
 */
export const createMockResults = (
	count: number,
	sut: string,
	role: SutRole = "primary",
	caseClass?: string,
): EvaluationResult[] =>
	Array.from({ length: count }, (_, index) =>
		createMockResult({
			run: {
				runId: `${sut}-run-${index.toString().padStart(3, "0")}`,
				sut,
				sutRole: role,
				caseId: `case-${index.toString().padStart(3, "0")}`,
				caseClass,
			},
			metrics: {
				numeric: {
					"execution-time": 100 + Math.random() * 50,
					"nodes-expanded": 50 + Math.floor(Math.random() * 20),
					"path-diversity": 0.5 + Math.random() * 0.4,
				},
			},
		}),
	);

/**
 * Create mock SummaryStats.
 *
 * @param values - Array of values to compute stats from
 * @returns SummaryStats
 */
export const createMockSummaryStats = (values: number[]): SummaryStats => {
	if (values.length === 0) {
		return {
			n: 0,
			mean: Number.NaN,
			median: Number.NaN,
			min: Number.NaN,
			max: Number.NaN,
		};
	}

	const sorted = [...values].sort((a, b) => a - b);
	const n = values.length;
	const sum = values.reduce((accumulator, v) => accumulator + v, 0);
	const mean = sum / n;
	const midIndex = Math.floor(n / 2);
	const median = n % 2 === 0 ? (sorted[midIndex - 1] + sorted[midIndex]) / 2 : sorted[midIndex];

	let std: number | undefined;
	if (n > 1) {
		const variance =
			values.map((v) => (v - mean) ** 2).reduce((accumulator, v) => accumulator + v, 0) / (n - 1);
		std = Math.sqrt(variance);
	}

	return {
		n,
		mean,
		median,
		min: sorted[0],
		max: sorted[n - 1],
		std,
		sum,
	};
};

/**
 * Create mock AggregatedResult.
 *
 * @param sut - SUT identifier
 * @param role - SUT role
 * @param caseClass - Optional case class
 * @param metrics - Optional metrics map
 * @returns AggregatedResult
 */
export const createMockAggregate = (
	sut: string,
	role: SutRole = "primary",
	caseClass?: string,
	metrics?: Record<string, SummaryStats>,
): AggregatedResult => {
	const defaultMetrics: Record<string, SummaryStats> = {
		"execution-time": createMockSummaryStats([100, 110, 105, 115, 120]),
		"nodes-expanded": createMockSummaryStats([50, 55, 52, 58, 60]),
		"path-diversity": createMockSummaryStats([0.7, 0.75, 0.72, 0.78, 0.8]),
	};

	return {
		sut,
		sutRole: role,
		caseClass,
		group: {
			runCount: 5,
			caseCount: 5,
		},
		correctness: {
			validRate: 1,
			producedOutputRate: 1,
			matchesExpectedRate: 1,
		},
		metrics: metrics ?? defaultMetrics,
	};
};

/**
 * Create mock aggregates for testing comparisons.
 *
 * @returns Array with primary and baseline aggregates
 */
export const createMockAggregates = (): AggregatedResult[] => [
	createMockAggregate("degree-prioritised-v1.0.0", "primary", "scale-free", {
		"execution-time": createMockSummaryStats([80, 85, 82, 88, 90]),
		"nodes-expanded": createMockSummaryStats([40, 45, 42, 48, 50]),
	}),
	createMockAggregate("standard-bfs-v1.0.0", "baseline", "scale-free", {
		"execution-time": createMockSummaryStats([120, 125, 122, 128, 130]),
		"nodes-expanded": createMockSummaryStats([70, 75, 72, 78, 80]),
	}),
	createMockAggregate("frontier-balanced-v1.0.0", "baseline", "scale-free", {
		"execution-time": createMockSummaryStats([100, 105, 102, 108, 110]),
		"nodes-expanded": createMockSummaryStats([60, 65, 62, 68, 70]),
	}),
];

/**
 * Create a mock EvaluationClaim.
 *
 * @param overrides - Partial fields to override defaults
 * @returns EvaluationClaim
 */
export const createMockClaim = (overrides?: Partial<EvaluationClaim>): EvaluationClaim => ({
	claimId: "C001",
	description: "Primary SUT is faster than baseline",
	sut: "degree-prioritised-v1.0.0",
	baseline: "standard-bfs-v1.0.0",
	metric: "execution-time",
	direction: "less",
	scope: "global",
	...overrides,
});

/**
 * Create mock ClaimEvidence.
 *
 * @param overrides - Partial fields to override defaults
 * @returns ClaimEvidence
 */
export const createMockEvidence = (overrides?: Partial<ClaimEvidence>): ClaimEvidence => ({
	primaryValue: 85,
	baselineValue: 125,
	delta: -40,
	ratio: 0.68,
	pValue: 0.01,
	effectSize: 1.5,
	n: 10,
	...overrides,
});

/**
 * Create mock ClaimEvaluation.
 *
 * @param status - Claim status
 * @param claim - Optional claim
 * @param evidence - Optional evidence
 * @returns ClaimEvaluation
 */
export const createMockClaimEvaluation = (
	status: ClaimStatus = "satisfied",
	claim?: Partial<EvaluationClaim>,
	evidence?: Partial<ClaimEvidence>,
): ClaimEvaluation => ({
	claim: createMockClaim(claim),
	status,
	evidence: createMockEvidence(evidence),
});

/**
 * Create an array of mock results with varying metrics.
 * Useful for testing aggregation and statistics.
 *
 * @param executionTimes - Array of execution times
 * @param sut - SUT identifier
 * @param role - SUT role
 * @returns Array of EvaluationResults
 */
export const createMockResultsWithMetrics = (
	executionTimes: number[],
	sut: string,
	role: SutRole = "primary",
): EvaluationResult[] =>
	executionTimes.map((time, index) =>
		createMockResult({
			run: {
				runId: `${sut}-run-${index.toString().padStart(3, "0")}`,
				sut,
				sutRole: role,
				caseId: `case-${index.toString().padStart(3, "0")}`,
			},
			metrics: {
				numeric: {
					"execution-time": time,
				},
			},
		}),
	);

/**
 * Create a minimal valid result for validation tests.
 * Returns the bare minimum fields required by the schema.
 */
export const createMinimalValidResult = (): EvaluationResult => ({
	run: {
		runId: "minimal-001",
		sut: "test-sut",
		sutRole: "primary",
		caseId: "test-case",
	},
	correctness: {
		expectedExists: false,
		producedOutput: true,
		valid: true,
		matchesExpected: null,
	},
	outputs: {},
	metrics: {
		numeric: {},
	},
	provenance: {
		runtime: {
			platform: "test",
			arch: "test",
			nodeVersion: "20.0.0",
		},
	},
});

/**
 * Create an invalid result missing required fields.
 * Useful for testing validation logic.
 */
export const createInvalidResult = (): unknown => ({
	run: {
		// Missing runId, sut, sutRole, caseId
	},
	// Missing correctness, metrics, provenance
});
