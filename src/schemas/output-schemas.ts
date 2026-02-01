/**
 * Output Type Zod Schemas
 *
 * Zod schemas for all PPEF output types. These are used by the JSON Schema
 * generation pipeline to produce $defs in ppef.schema.json, enabling
 * cross-language validation of PPEF output files.
 *
 * These schemas mirror the TypeScript interfaces in src/types/ but provide
 * runtime validation and JSON Schema generation capabilities.
 */

import { z } from "zod";

import { SutRoleSchema } from "../cli/types.js";
import { ComparisonDirectionSchema, ValidityScopeSchema } from "../cli/evaluator-schemas.js";

// ============================================================================
// Shared Primitives
// ============================================================================

const PrimitiveSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const PrimitiveArraySchema = z.union([PrimitiveSchema, z.array(PrimitiveSchema)]);

// ============================================================================
// Result Types (src/types/result.ts)
// ============================================================================

/**
 * Failure type enum.
 */
export const FailureTypeSchema = z
	.enum([
		"no_output",
		"invalid_structure",
		"constraint_violation",
		"exception",
		"oracle_mismatch",
		"timeout",
	])
	.describe("Category of evaluation failure");

/**
 * Run identity and context.
 */
export const RunContextSchema = z
	.object({
		runId: z.string().describe("Deterministic run ID (hash of inputs)"),
		sut: z.string().describe("SUT identifier"),
		sutRole: SutRoleSchema,
		sutVersion: z.string().optional().describe("SUT version for reproducibility"),
		caseId: z.string().describe("Case identifier"),
		caseClass: z.string().optional().describe("Case class for grouping"),
		config: z
			.record(z.string(), PrimitiveSchema)
			.optional()
			.describe("Configuration overrides for this run"),
		seed: z.number().optional().describe("Random seed if applicable"),
		repetition: z.number().int().optional().describe("Repetition number for statistical runs"),
	})
	.meta({ title: "RunContext", description: "Run identity and context" });

/**
 * Correctness assessment.
 */
export const CorrectnessResultSchema = z
	.object({
		expectedExists: z.boolean().describe("Whether expected output exists (oracle available)"),
		producedOutput: z.boolean().describe("Whether the SUT produced any output"),
		valid: z.boolean().describe("Whether output is structurally valid"),
		matchesExpected: z
			.union([z.boolean(), z.null()])
			.describe("Whether output matches expected (null if no oracle)"),
		failureType: FailureTypeSchema.optional().describe("Failure classification if applicable"),
		notes: z.array(z.string()).optional().describe("Human-readable failure notes"),
	})
	.meta({ title: "CorrectnessResult", description: "Correctness assessment" });

/**
 * A ranked item for ranking tasks.
 */
export const RankedItemSchema = z
	.object({
		itemId: z.string().describe("Item identifier"),
		score: z.number().describe("Score or rank value"),
		metadata: z
			.record(z.string(), PrimitiveSchema)
			.optional()
			.describe("Optional additional metadata"),
	})
	.meta({ title: "RankedItem", description: "A ranked item for ranking tasks" });

/**
 * Artefact reference.
 */
const ArtefactReferenceSchema = z
	.object({
		type: z.enum(["graph", "path-set", "subgraph", "embedding", "other"]),
		uri: z.string(),
		hash: z.string().optional(),
		metadata: z.record(z.string(), PrimitiveSchema).optional(),
	})
	.meta({ title: "ArtefactReference", description: "Reference to an external artefact" });

/**
 * Output artefacts and summaries.
 */
export const ResultOutputsSchema = z
	.object({
		summary: z
			.record(z.string(), PrimitiveArraySchema)
			.optional()
			.describe("Scalar summary values"),
		labels: z.record(z.string(), PrimitiveSchema).optional().describe("Classification labels"),
		ranking: z.array(RankedItemSchema).optional().describe("Ranking results"),
		artefacts: z
			.array(ArtefactReferenceSchema)
			.optional()
			.describe("References to generated artefacts"),
		extra: z.record(z.string(), z.unknown()).optional().describe("Additional untyped outputs"),
	})
	.meta({ title: "ResultOutputs", description: "Output artefacts and summaries" });

/**
 * Numeric metrics collected during evaluation.
 */
export const ResultMetricsSchema = z
	.object({
		numeric: z.record(z.string(), z.number()).describe("Primary numeric metrics"),
		extra: z.record(z.string(), z.number()).optional().describe("Additional metrics (overflow)"),
	})
	.catchall(z.union([z.number(), z.record(z.string(), z.number())]))
	.meta({ title: "ResultMetrics", description: "Numeric metrics collected during evaluation" });

/**
 * Provenance information for reproducibility.
 */
export const ProvenanceSchema = z
	.object({
		runtime: z
			.object({
				platform: z.string().describe("Operating system platform"),
				arch: z.string().describe("CPU architecture"),
			})
			.catchall(z.string())
			.describe(
				"Execution environment (platform and arch required; additional fields are language-specific)",
			),
		gitCommit: z.string().optional().describe("Git commit hash"),
		dirty: z.boolean().optional().describe("Whether working directory had uncommitted changes"),
		dependencyLockHash: z
			.string()
			.optional()
			.describe("Hash of package-lock.json for dependency pinning"),
		parentRunIds: z.array(z.string()).optional().describe("Parent run IDs (for derived results)"),
		timestamp: z.string().optional().describe("Execution timestamp"),
		executionTimeMs: z.number().optional().describe("Wall-clock execution time in milliseconds"),
		peakMemoryBytes: z.number().optional().describe("Peak memory usage during execution (bytes)"),
		finalMemoryBytes: z.number().optional().describe("Memory usage at completion (bytes)"),
	})
	.meta({ title: "Provenance", description: "Provenance information for reproducibility" });

/**
 * Complete evaluation result.
 */
export const EvaluationResultSchema = z
	.object({
		run: RunContextSchema.describe("Run identity and context"),
		correctness: CorrectnessResultSchema.describe("Correctness assessment"),
		outputs: ResultOutputsSchema.describe("Output artefacts and summaries"),
		metrics: ResultMetricsSchema.describe("Numeric metrics"),
		provenance: ProvenanceSchema.describe("Provenance for reproducibility"),
		error: z.string().optional().describe("Error message if the run failed"),
	})
	.meta({ title: "EvaluationResult", description: "Complete evaluation result" });

/**
 * Batch of evaluation results.
 */
export const ResultBatchSchema = z
	.object({
		version: z.string().describe("Schema version"),
		timestamp: z.string().describe("Generation timestamp"),
		results: z.array(EvaluationResultSchema).describe("All results in this batch"),
		metadata: z
			.record(z.string(), PrimitiveSchema)
			.optional()
			.describe("Optional batch-level metadata"),
	})
	.meta({ title: "ResultBatch", description: "Batch of evaluation results" });

// ============================================================================
// Aggregate Types (src/types/aggregate.ts)
// ============================================================================

/**
 * Summary statistics for a numeric metric.
 */
export const SummaryStatsSchema = z
	.object({
		n: z.number().int().describe("Number of observations"),
		mean: z.number().describe("Arithmetic mean"),
		median: z.number().describe("Median (50th percentile)"),
		min: z.number().describe("Minimum value"),
		max: z.number().describe("Maximum value"),
		std: z.number().optional().describe("Standard deviation (sample)"),
		confidence95: z
			.tuple([z.number(), z.number()])
			.optional()
			.describe("95% confidence interval [lower, upper]"),
		sum: z.number().optional().describe("Sum of all values"),
		p25: z.number().optional().describe("25th percentile"),
		p75: z.number().optional().describe("75th percentile"),
	})
	.meta({ title: "SummaryStats", description: "Summary statistics for a numeric metric" });

/**
 * Comparison metrics between primary and baseline SUTs.
 */
export const ComparisonMetricsSchema = z
	.object({
		deltas: z.record(z.string(), z.number()).describe("Absolute deltas (primary - baseline)"),
		ratios: z.record(z.string(), z.number()).describe("Ratios (primary / baseline)"),
		betterRate: z
			.number()
			.optional()
			.describe("Win rate (% of cases where primary beats baseline)"),
		uStatistic: z.number().optional().describe("Mann-Whitney U statistic"),
		pValue: z.number().optional().describe("Statistical significance (p-value)"),
		effectSize: z.number().optional().describe("Effect size (Cohen's d)"),
	})
	.meta({
		title: "ComparisonMetrics",
		description: "Comparison metrics between primary and baseline SUTs",
	});

/**
 * Coverage information for the aggregation.
 */
export const CoverageMetricsSchema = z
	.object({
		caseCoverage: z.number().describe("Fraction of cases covered"),
		metricCoverage: z
			.record(z.string(), z.number())
			.describe("Metric availability (metric name -> coverage fraction)"),
		missingCases: z.array(z.string()).optional().describe("Missing case IDs"),
	})
	.meta({ title: "CoverageMetrics", description: "Coverage information for the aggregation" });

/**
 * Aggregated result for a SUT.
 */
export const AggregatedResultSchema = z
	.object({
		sut: z.string().describe("SUT identifier"),
		sutRole: SutRoleSchema,
		caseClass: z.string().optional().describe("Case class (if grouped)"),
		group: z.object({
			runCount: z.number().int().describe("Number of runs in this aggregate"),
			caseCount: z.number().int().describe("Number of unique cases"),
			configHash: z.string().optional().describe("Hash of configuration"),
		}),
		correctness: z.object({
			validRate: z.number().describe("Fraction of runs that produced valid output"),
			producedOutputRate: z.number().describe("Fraction of runs that produced any output"),
			matchesExpectedRate: z.number().optional().describe("Fraction of runs matching expected"),
			failureBreakdown: z
				.record(z.string(), z.number())
				.optional()
				.describe("Breakdown of failure types"),
		}),
		metrics: z
			.record(z.string(), SummaryStatsSchema)
			.describe("Aggregated metrics (metric name -> summary stats)"),
		comparisons: z
			.record(z.string(), ComparisonMetricsSchema)
			.optional()
			.describe("Comparisons with baselines"),
		coverage: CoverageMetricsSchema.optional().describe("Coverage information"),
		metadata: z.record(z.string(), PrimitiveSchema).optional().describe("Additional metadata"),
	})
	.meta({ title: "AggregatedResult", description: "Aggregated result for a SUT" });

/**
 * Complete aggregation output.
 */
export const AggregationOutputSchema = z
	.object({
		version: z.string().describe("Schema version"),
		timestamp: z.string().describe("Generation timestamp"),
		aggregates: z.array(AggregatedResultSchema).describe("Aggregated results"),
		metadata: z
			.object({
				totalRuns: z.number().int().describe("Total runs processed"),
				totalCases: z.number().int().describe("Total unique cases"),
				sutsIncluded: z.array(z.string()).describe("SUTs included"),
				caseClassesIncluded: z.array(z.string()).optional().describe("Case classes included"),
			})
			.optional()
			.describe("Global metadata"),
	})
	.meta({ title: "AggregationOutput", description: "Complete aggregation output" });

// ============================================================================
// Claims Types (src/types/claims.ts)
// ============================================================================

/**
 * Evidence supporting a claim evaluation.
 */
export const ClaimEvidenceSchema = z
	.object({
		primaryValue: z.number().describe("Primary SUT metric value"),
		baselineValue: z.number().describe("Baseline SUT metric value"),
		delta: z.number().describe("Absolute delta (primary - baseline)"),
		ratio: z.number().describe("Ratio (primary / baseline)"),
		pValue: z.number().optional().describe("P-value from statistical test"),
		effectSize: z.number().optional().describe("Effect size (Cohen's d)"),
		n: z.number().int().optional().describe("Number of observations"),
		deltaCI95: z
			.tuple([z.number(), z.number()])
			.optional()
			.describe("95% confidence interval for delta"),
	})
	.meta({ title: "ClaimEvidence", description: "Evidence supporting a claim evaluation" });

/**
 * Claim status.
 */
export const ClaimStatusSchema = z
	.enum(["satisfied", "violated", "inconclusive"])
	.describe("Status of a claim evaluation");

/**
 * An evaluation claim (hypothesis) — output form.
 */
export const EvaluationClaimOutputSchema = z
	.object({
		claimId: z.string().describe("Unique identifier for this claim"),
		description: z.string().describe("Human-readable description"),
		sut: z.string().describe("Primary SUT being evaluated"),
		baseline: z.string().describe("Baseline SUT for comparison"),
		metric: z.string().describe("Metric being compared"),
		direction: ComparisonDirectionSchema,
		threshold: z.number().optional().describe("Optional threshold for the difference"),
		scope: ValidityScopeSchema,
		scopeConstraints: z
			.record(z.string(), z.union([PrimitiveSchema, z.array(PrimitiveSchema)]))
			.optional()
			.describe("Scope constraints"),
		significanceLevel: z.number().optional().describe("Required significance level"),
		minEffectSize: z.number().optional().describe("Minimum effect size"),
		tags: z.array(z.string()).optional().describe("Tags for filtering"),
		citation: z.string().optional().describe("Citation/reference for the claim"),
	})
	.meta({ title: "EvaluationClaimOutput", description: "An evaluation claim (hypothesis)" });

/**
 * Result of evaluating a single claim.
 */
export const ClaimEvaluationSchema = z
	.object({
		claim: EvaluationClaimOutputSchema.describe("The claim being evaluated"),
		status: ClaimStatusSchema,
		evidence: ClaimEvidenceSchema.describe("Supporting evidence"),
		inconclusiveReason: z.string().optional().describe("Reason for inconclusive status"),
		notes: z.array(z.string()).optional().describe("Additional notes"),
	})
	.meta({ title: "ClaimEvaluation", description: "Result of evaluating a single claim" });

/**
 * Summary of all claim evaluations.
 */
export const ClaimEvaluationSummarySchema = z
	.object({
		version: z.string().describe("Schema version"),
		timestamp: z.string().describe("Generation timestamp"),
		evaluations: z.array(ClaimEvaluationSchema).describe("Individual claim evaluations"),
		summary: z.object({
			total: z.number().int().describe("Total claims evaluated"),
			satisfied: z.number().int().describe("Claims satisfied"),
			violated: z.number().int().describe("Claims violated"),
			inconclusive: z.number().int().describe("Claims inconclusive"),
			satisfactionRate: z
				.number()
				.describe("Satisfaction rate (satisfied / (satisfied + violated))"),
		}),
	})
	.meta({
		title: "ClaimEvaluationSummary",
		description: "Summary of all claim evaluations",
	});

// ============================================================================
// Metrics Evaluator Output Types (src/types/evaluator.ts)
// ============================================================================

/**
 * Metrics criterion type.
 */
const MetricsCriterionTypeSchema = z
	.enum(["threshold", "baseline", "target-range"])
	.describe("Type of metrics criterion");

/**
 * Threshold operator.
 */
const ThresholdOperatorSchema = z
	.enum(["gt", "gte", "lt", "lte", "eq"])
	.describe("Comparison operator");

/**
 * A single metrics criterion (output form).
 */
export const MetricsCriterionOutputSchema = z
	.object({
		criterionId: z.string().describe("Unique identifier"),
		description: z.string().describe("Human-readable description"),
		type: MetricsCriterionTypeSchema,
		metric: z.string().describe("Metric to evaluate"),
		sut: z.string().describe('SUT to evaluate (or "*" for all SUTs)'),
		threshold: z
			.object({
				operator: ThresholdOperatorSchema,
				value: z.number(),
			})
			.optional(),
		baseline: z
			.object({
				sut: z.string(),
				operator: ThresholdOperatorSchema,
			})
			.optional(),
		targetRange: z
			.object({
				min: z.number().optional(),
				max: z.number().optional(),
				minInclusive: z.boolean().optional(),
				maxInclusive: z.boolean().optional(),
			})
			.optional(),
		scopeConstraints: z
			.object({
				caseClass: z.union([z.string(), z.array(z.string())]).optional(),
			})
			.optional(),
		tags: z.array(z.string()).optional(),
	})
	.meta({
		title: "MetricsCriterionOutput",
		description: "A metrics evaluation criterion",
	});

/**
 * Result of evaluating a single metrics criterion.
 */
export const MetricsCriterionResultSchema = z
	.object({
		criterion: MetricsCriterionOutputSchema,
		status: z.enum(["pass", "fail", "inconclusive"]),
		observed: z.array(
			z.object({
				sut: z.string(),
				value: z.number(),
			}),
		),
		expected: z.object({
			type: MetricsCriterionTypeSchema,
			threshold: z.number().optional(),
			baselineValue: z.number().optional(),
			targetRange: z.object({ min: z.number().optional(), max: z.number().optional() }).optional(),
		}),
		inconclusiveReason: z.string().optional(),
	})
	.meta({
		title: "MetricsCriterionResult",
		description: "Result of evaluating a single metrics criterion",
	});

/**
 * Summary of metrics evaluation.
 */
export const MetricsEvaluationSummarySchema = z
	.object({
		version: z.string().describe("Schema version"),
		timestamp: z.string().describe("Generation timestamp"),
		results: z.array(MetricsCriterionResultSchema).describe("Individual criterion results"),
		summary: z.object({
			total: z.number().int().describe("Total criteria evaluated"),
			passed: z.number().int().describe("Criteria passed"),
			failed: z.number().int().describe("Criteria failed"),
			inconclusive: z.number().int().describe("Criteria inconclusive"),
			passRate: z.number().describe("Overall pass rate"),
			passRateBySut: z.record(z.string(), z.number()).describe("Pass rate by SUT"),
		}),
	})
	.meta({
		title: "MetricsEvaluationSummary",
		description: "Summary of metrics evaluation",
	});

// ============================================================================
// Robustness Types (src/types/perturbation.ts)
// ============================================================================

/**
 * Robustness metrics.
 */
export const RobustnessMetricsSchema = z
	.object({
		varianceUnderPerturbation: z.number(),
		stdUnderPerturbation: z.number(),
		coefficientOfVariation: z.number(),
		rankingStability: z.number().optional(),
		degradationCurve: z
			.array(
				z.object({
					perturbationLevel: z.number(),
					metricValue: z.number(),
					stdDev: z.number().optional(),
				}),
			)
			.optional(),
		breakpoint: z.number().optional(),
	})
	.meta({ title: "RobustnessMetrics", description: "Robustness analysis metrics" });

/**
 * Result of robustness analysis for a single SUT.
 */
export const RobustnessAnalysisResultSchema = z
	.object({
		sut: z.string(),
		caseClass: z.string().optional(),
		perturbation: z.string(),
		metric: z.string(),
		robustness: RobustnessMetricsSchema,
		baselineValue: z.number(),
		runCount: z.number().int(),
	})
	.meta({
		title: "RobustnessAnalysisResult",
		description: "Result of robustness analysis for a single SUT",
	});

/**
 * Complete robustness analysis output.
 */
export const RobustnessAnalysisOutputSchema = z
	.object({
		version: z.string().describe("Schema version"),
		timestamp: z.string().describe("Generation timestamp"),
		results: z.array(RobustnessAnalysisResultSchema).describe("Individual analysis results"),
		config: z.object({
			perturbations: z.array(z.string()).describe("Perturbations applied"),
			metrics: z.array(z.string()).describe("Metrics analyzed"),
			intensityLevels: z.array(z.number()).optional().describe("Intensity levels tested"),
			runsPerLevel: z.number().int().describe("Runs per perturbation level"),
		}),
	})
	.meta({
		title: "RobustnessAnalysisOutput",
		description: "Complete robustness analysis output",
	});

// ============================================================================
// Exploratory Evaluator Output Types (src/types/evaluator.ts)
// ============================================================================

/**
 * Ranking of a SUT for a specific metric.
 */
export const SutMetricRankingSchema = z
	.object({
		sut: z.string(),
		mean: z.number(),
		median: z.number(),
		std: z.number().optional(),
		rank: z.number().int(),
		n: z.number().int(),
	})
	.meta({ title: "SutMetricRanking", description: "Ranking of a SUT for a specific metric" });

/**
 * Pairwise comparison between two SUTs.
 */
export const PairwiseComparisonSchema = z
	.object({
		sutA: z.string(),
		sutB: z.string(),
		metric: z.string(),
		delta: z.number(),
		ratio: z.number(),
		pValue: z.number().optional(),
		effectSize: z.number().optional(),
		significant: z.boolean(),
	})
	.meta({
		title: "PairwiseComparison",
		description: "Pairwise comparison between two SUTs",
	});

/**
 * Effect of a case class on SUT performance.
 */
export const CaseClassEffectSchema = z
	.object({
		caseClass: z.string(),
		sut: z.string(),
		metric: z.string(),
		deviationFromMean: z.number(),
		percentageDeviation: z.number().optional(),
		significant: z.boolean(),
	})
	.meta({
		title: "CaseClassEffect",
		description: "Effect of a case class on SUT performance",
	});

/**
 * Correlation between two metrics.
 */
export const MetricCorrelationSchema = z
	.object({
		metricA: z.string(),
		metricB: z.string(),
		pearsonR: z.number(),
		spearmanRho: z.number().optional(),
		interpretation: z.string(),
	})
	.meta({ title: "MetricCorrelation", description: "Correlation between two metrics" });

/**
 * Summary of exploratory evaluation results.
 */
export const ExploratoryEvaluationSummarySchema = z
	.object({
		version: z.string().describe("Schema version"),
		timestamp: z.string().describe("Generation timestamp"),
		rankings: z
			.record(z.string(), z.array(SutMetricRankingSchema))
			.describe("SUT rankings per metric"),
		pairwiseComparisons: z
			.array(PairwiseComparisonSchema)
			.describe("Pairwise comparisons between SUTs"),
		caseClassEffects: z.array(CaseClassEffectSchema).optional().describe("Case-class effects"),
		metricCorrelations: z.array(MetricCorrelationSchema).optional().describe("Metric correlations"),
		summary: z.object({
			sutsAnalyzed: z.number().int(),
			metricsAnalyzed: z.number().int(),
			pairwiseComparisonsCount: z.number().int(),
			significantDifferences: z.number().int(),
			caseClassesAnalyzed: z.number().int().optional(),
			bestSutPerMetric: z.record(z.string(), z.string()),
		}),
	})
	.meta({
		title: "ExploratoryEvaluationSummary",
		description: "Summary of exploratory evaluation results",
	});
