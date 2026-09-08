/**
 * Evaluator Configuration Zod Schemas
 *
 * Runtime-validated schemas for all evaluator config types.
 * Existing interfaces in types/evaluator.ts remain for class implementations;
 * these schemas are used by the CLI for config validation and JSON schema generation.
 */

import { z } from "zod";

// ============================================================================
// Shared Enums
// ============================================================================

/**
 * Built-in evaluation types.
 */
export const EvaluationTypeSchema = z
	.enum(["claims", "robustness", "metrics", "exploratory", "custom"])
	.describe("Evaluation type");
export type EvaluationTypeSchema = z.infer<typeof EvaluationTypeSchema>;

/**
 * Direction of comparison for claims.
 */
export const ComparisonDirectionSchema = z
	.enum(["greater", "less", "equal"])
	.describe("Expected direction of difference");
export type ComparisonDirectionSchema = z.infer<typeof ComparisonDirectionSchema>;

/**
 * Scope of claim validity.
 */
export const ValidityScopeSchema = z
	.enum(["global", "caseClass", "parameterRange", "localStructure"])
	.describe("Scope of claim validity");
export type ValidityScopeSchema = z.infer<typeof ValidityScopeSchema>;

/**
 * Metric direction for ranking interpretation.
 */
export const MetricDirectionSchema = z
	.enum(["higher-better", "lower-better"])
	.describe("Metric direction for ranking");
export type MetricDirectionSchema = z.infer<typeof MetricDirectionSchema>;

/**
 * Criterion type for metrics evaluation.
 */
export const MetricsCriterionTypeSchema = z
	.enum(["threshold", "baseline", "target-range"])
	.describe("Type of metrics criterion");
export type MetricsCriterionTypeSchema = z.infer<typeof MetricsCriterionTypeSchema>;

/**
 * Threshold comparison operator.
 */
export const ThresholdOperatorSchema = z
	.enum(["gt", "gte", "lt", "lte", "eq"])
	.describe("Comparison operator");
export type ThresholdOperatorSchema = z.infer<typeof ThresholdOperatorSchema>;

// ============================================================================
// Base Config
// ============================================================================

/**
 * Base configuration shared by all evaluators.
 */
export const EvaluatorConfigBase = z.object({
	name: z.string().optional().describe("Human-readable evaluator name"),
	description: z.string().optional().describe("Evaluator description"),
	options: z
		.record(z.string(), z.unknown())
		.optional()
		.describe("Additional evaluator-specific options"),
});

// ============================================================================
// Claims Evaluator
// ============================================================================

/**
 * Primitive value type for scope constraints.
 */
const PrimitiveSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

/**
 * A single evaluation claim (hypothesis).
 */
export const EvaluationClaimSchema = z
	.object({
		claimId: z.string().min(1).describe("Unique claim identifier"),
		description: z.string().min(1).describe("Human-readable claim description"),
		sut: z.string().min(1).describe("Primary SUT being evaluated"),
		baseline: z.string().min(1).describe("Baseline SUT for comparison"),
		metric: z.string().min(1).describe("Metric being compared"),
		direction: ComparisonDirectionSchema,
		threshold: z.number().optional().describe("Optional threshold for the difference"),
		scope: ValidityScopeSchema,
		scopeConstraints: z
			.record(z.string(), z.union([PrimitiveSchema, z.array(PrimitiveSchema)]))
			.optional()
			.describe("Scope constraints"),
		significanceLevel: z
			.number()
			.min(0)
			.max(1)
			.optional()
			.describe("Required significance level (default: 0.05)"),
		minEffectSize: z.number().min(0).optional().describe("Minimum effect size (Cohen's d)"),
		tags: z.array(z.string()).optional().describe("Tags for filtering"),
		citation: z.string().optional().describe("Citation/reference for the claim"),
	})
	.meta({
		title: "EvaluationClaim",
		description: "An evaluation claim (hypothesis)",
	});
export type EvaluationClaimSchema = z.infer<typeof EvaluationClaimSchema>;

/**
 * Claims evaluator configuration.
 */
export const ClaimsEvaluatorConfigSchema = EvaluatorConfigBase.extend({
	claims: z.array(EvaluationClaimSchema).min(1).describe("Claims to evaluate"),
	significanceLevel: z
		.number()
		.min(0)
		.max(1)
		.optional()
		.describe("Global significance level override"),
	minEffectSize: z.number().min(0).optional().describe("Global minimum effect size override"),
}).meta({
	title: "ClaimsEvaluatorConfig",
	description: "Configuration for the claims evaluator",
});
export type ClaimsEvaluatorConfigSchema = z.infer<typeof ClaimsEvaluatorConfigSchema>;

// ============================================================================
// Metrics Evaluator
// ============================================================================

/**
 * A single metrics evaluation criterion.
 *
 * Uses superRefine to enforce that the correct sub-fields are present
 * for each criterion type (threshold requires threshold field, etc.).
 */
export const MetricsCriterionSchema = z
	.object({
		criterionId: z.string().min(1).describe("Unique criterion identifier"),
		description: z.string().min(1).describe("Human-readable description"),
		type: MetricsCriterionTypeSchema,
		metric: z.string().min(1).describe("Metric to evaluate"),
		sut: z.string().min(1).describe('SUT to evaluate (or "*" for all SUTs)'),
		threshold: z
			.object({
				operator: ThresholdOperatorSchema,
				value: z.number().describe("Threshold value"),
			})
			.optional()
			.describe("Threshold operator and value (required when type is threshold)"),
		baseline: z
			.object({
				sut: z.string().min(1).describe("Baseline SUT identifier"),
				operator: ThresholdOperatorSchema,
			})
			.optional()
			.describe("Baseline comparison (required when type is baseline)"),
		targetRange: z
			.object({
				min: z.number().optional().describe("Minimum value"),
				max: z.number().optional().describe("Maximum value"),
				minInclusive: z.boolean().optional().describe("Whether min is inclusive"),
				maxInclusive: z.boolean().optional().describe("Whether max is inclusive"),
			})
			.optional()
			.describe("Target range (required when type is target-range)"),
		scopeConstraints: z
			.object({
				caseClass: z
					.union([z.string(), z.array(z.string())])
					.optional()
					.describe("Case class filter"),
			})
			.optional()
			.describe("Optional scope constraints"),
		tags: z.array(z.string()).optional().describe("Tags for filtering"),
	})
	.superRefine((data, ctx) => {
		if (data.type === "threshold" && !data.threshold) {
			ctx.addIssue({
				code: "custom",
				message: 'Criterion type "threshold" requires the "threshold" field',
				path: ["threshold"],
			});
		}
		if (data.type === "baseline" && !data.baseline) {
			ctx.addIssue({
				code: "custom",
				message: 'Criterion type "baseline" requires the "baseline" field',
				path: ["baseline"],
			});
		}
		if (data.type === "target-range" && !data.targetRange) {
			ctx.addIssue({
				code: "custom",
				message: 'Criterion type "target-range" requires the "targetRange" field',
				path: ["targetRange"],
			});
		}
	})
	.meta({
		title: "MetricsCriterion",
		description: "A metrics evaluation criterion",
	});
export type MetricsCriterionSchema = z.infer<typeof MetricsCriterionSchema>;

/**
 * Metrics evaluator configuration.
 */
export const MetricsEvaluatorConfigSchema = EvaluatorConfigBase.extend({
	criteria: z.array(MetricsCriterionSchema).min(1).describe("Criteria to evaluate"),
}).meta({
	title: "MetricsEvaluatorConfig",
	description: "Configuration for the metrics evaluator",
});
export type MetricsEvaluatorConfigSchema = z.infer<typeof MetricsEvaluatorConfigSchema>;

// ============================================================================
// Robustness Evaluator
// ============================================================================

/**
 * Robustness evaluator configuration.
 */
export const RobustnessEvaluatorConfigSchema = EvaluatorConfigBase.extend({
	metrics: z.array(z.string().min(1)).min(1).describe("Metrics to analyze"),
	perturbations: z.array(z.string().min(1)).min(1).describe("Perturbations applied"),
	intensityLevels: z.array(z.number()).optional().describe("Intensity levels tested"),
	runsPerLevel: z
		.number()
		.int()
		.min(1)
		.optional()
		.describe("Number of runs per perturbation level"),
}).meta({
	title: "RobustnessEvaluatorConfig",
	description: "Configuration for the robustness evaluator",
});
export type RobustnessEvaluatorConfigSchema = z.infer<typeof RobustnessEvaluatorConfigSchema>;

// ============================================================================
// Exploratory Evaluator
// ============================================================================

/**
 * Exploratory evaluator configuration.
 */
export const ExploratoryEvaluatorConfigSchema = EvaluatorConfigBase.extend({
	metrics: z
		.array(z.string().min(1))
		.optional()
		.describe("Metrics to analyze (all if not specified)"),
	suts: z.array(z.string().min(1)).optional().describe("SUTs to include (all if not specified)"),
	metricDirections: z
		.record(z.string(), MetricDirectionSchema)
		.optional()
		.describe("Metric directions for ranking interpretation"),
	significanceLevel: z
		.number()
		.min(0)
		.max(1)
		.optional()
		.describe("Significance level for statistical tests (default: 0.05)"),
	minEffectSize: z
		.number()
		.min(0)
		.optional()
		.describe("Minimum effect size to consider meaningful"),
	computeCorrelations: z.boolean().optional().describe("Whether to compute metric correlations"),
	analyzeCaseClassEffects: z.boolean().optional().describe("Whether to analyze case-class effects"),
}).meta({
	title: "ExploratoryEvaluatorConfig",
	description: "Configuration for the exploratory evaluator",
});
export type ExploratoryEvaluatorConfigSchema = z.infer<typeof ExploratoryEvaluatorConfigSchema>;

// ============================================================================
// Custom Evaluator
// ============================================================================

/**
 * Custom evaluator configuration.
 * Uses catchall to allow arbitrary additional properties.
 */
export const CustomEvaluatorConfigSchema = EvaluatorConfigBase.extend({
	customType: z.string().min(1).describe("Custom evaluator type name"),
})
	.catchall(z.unknown())
	.meta({
		title: "CustomEvaluatorConfig",
		description: "Configuration for a custom evaluator",
	});
export type CustomEvaluatorConfigSchema = z.infer<typeof CustomEvaluatorConfigSchema>;

// ============================================================================
// Evaluator Entry (for ExperimentConfig.evaluators array)
// ============================================================================

/**
 * A single evaluator entry combining type discriminant with config.
 */
export const EvaluatorEntrySchema = z
	.object({
		type: EvaluationTypeSchema,
		config: z.union([
			ClaimsEvaluatorConfigSchema,
			MetricsEvaluatorConfigSchema,
			RobustnessEvaluatorConfigSchema,
			ExploratoryEvaluatorConfigSchema,
			CustomEvaluatorConfigSchema,
		]),
	})
	.meta({
		title: "EvaluatorEntry",
		description: "An evaluator configuration entry",
	});
export type EvaluatorEntrySchema = z.infer<typeof EvaluatorEntrySchema>;
