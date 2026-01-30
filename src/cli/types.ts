/**
 * CLI Type Definitions
 *
 * Types for the JSON experiment configuration and CLI options.
 * Config types use Zod schemas for runtime validation + inferred TypeScript types.
 * Schema metadata (.describe / .meta) flows into the generated ppef.schema.json.
 */

import { z } from "zod";

import { EvaluatorEntrySchema } from "./evaluator-schemas.js";

/**
 * SUT role enum for JSON validation.
 * Values match the SutRole string literal union in types/sut.ts.
 */
export const SutRoleSchema = z
	.enum(["primary", "baseline", "oracle"])
	.describe("Role of the SUT in evaluation");

/**
 * Experiment metadata.
 */
export const ExperimentMeta = z
	.object({
		name: z.string().min(1).describe("Human-readable experiment name"),
		description: z.string().optional().describe("Experiment description"),
		version: z.string().optional().describe("Experiment version string"),
	})
	.meta({ title: "ExperimentMeta", description: "Experiment metadata" });
export type ExperimentMeta = z.infer<typeof ExperimentMeta>;

/**
 * Executor configuration from JSON.
 */
export const ExecutorConfig = z
	.object({
		continueOnError: z.boolean().optional().describe("Continue execution if a single run fails"),
		repetitions: z.number().int().min(1).optional().describe("Number of repetitions per case"),
		seedBase: z.number().int().min(0).optional().describe("Random seed base"),
		timeoutMs: z
			.number()
			.int()
			.min(0)
			.optional()
			.describe("Timeout per run in milliseconds (0 = no timeout)"),
		collectProvenance: z.boolean().optional().describe("Whether to collect provenance information"),
		concurrency: z.number().int().min(1).optional().describe("Number of concurrent runs"),
	})
	.meta({ title: "ExecutorConfig", description: "Executor configuration" });
export type ExecutorConfig = z.infer<typeof ExecutorConfig>;

/**
 * SUT registration metadata.
 */
export const SutRegistration = z
	.object({
		name: z.string().min(1).describe("Human-readable SUT name"),
		version: z.string().min(1).describe("SUT version string"),
		role: SutRoleSchema,
		tags: z.array(z.string()).optional().describe("Searchable tags"),
		description: z.string().optional().describe("Optional SUT description"),
	})
	.meta({ title: "SutRegistration", description: "SUT registration metadata" });
export type SutRegistration = z.infer<typeof SutRegistration>;

/**
 * SUT configuration from JSON.
 */
export const SutConfig = z
	.object({
		id: z.string().min(1).describe("Unique SUT identifier"),
		module: z.string().min(1).describe("Path to module file (relative to config file)"),
		exportName: z.string().min(1).describe("Name of the export to use as factory"),
		config: z
			.record(z.string(), z.unknown())
			.optional()
			.describe("Optional configuration to pass to factory"),
		type: z
			.enum(["module", "binary"])
			.optional()
			.describe('SUT type: "module" (default) or "binary"'),
		binaryCommand: z.string().optional().describe('Command to execute (when type="binary")'),
		binaryArgs: z.array(z.string()).optional().describe("Arguments to pass to binary command"),
		binaryInputFormat: z
			.enum(["json", "raw", "lines"])
			.optional()
			.describe("How to serialize inputs to stdin"),
		binaryOutputFormat: z
			.enum(["json", "raw", "lines"])
			.optional()
			.describe("How to deserialize stdout"),
		binaryTimeout: z
			.number()
			.int()
			.min(0)
			.optional()
			.describe("Binary SUT timeout per run in milliseconds"),
		registration: SutRegistration,
	})
	.meta({ title: "SutConfig", description: "System Under Test configuration" });
export type SutConfig = z.infer<typeof SutConfig>;

/**
 * Case configuration from JSON.
 */
export const CaseConfig = z
	.object({
		id: z.string().min(1).describe("Unique case identifier"),
		module: z.string().min(1).describe("Path to module file (relative to config file)"),
		exportName: z.string().min(1).describe("Name of the export to use as case factory"),
	})
	.meta({ title: "CaseConfig", description: "Test case configuration" });
export type CaseConfig = z.infer<typeof CaseConfig>;

/**
 * Metrics extractor configuration from JSON.
 */
export const MetricsExtractorConfig = z
	.object({
		module: z.string().min(1).describe("Path to module file (relative to config file)"),
		exportName: z.string().min(1).describe("Name of the export to use as metrics extractor"),
	})
	.meta({ title: "MetricsExtractorConfig", description: "Metrics extractor configuration" });
export type MetricsExtractorConfig = z.infer<typeof MetricsExtractorConfig>;

/**
 * Output configuration from JSON.
 */
export const OutputConfig = z
	.object({
		path: z.string().optional().describe("Output directory path"),
		format: z.enum(["json", "json-pretty"]).optional().describe("Output format"),
		aggregate: z.boolean().optional().describe("Whether to aggregate results"),
	})
	.meta({ title: "OutputConfig", description: "Output configuration" });
export type OutputConfig = z.infer<typeof OutputConfig>;

/**
 * Complete experiment configuration from JSON.
 */
export const ExperimentConfig = z
	.object({
		experiment: ExperimentMeta.describe("Experiment metadata"),
		executor: ExecutorConfig.describe("Executor configuration"),
		suts: z.array(SutConfig).describe("Systems Under Test to evaluate"),
		cases: z.array(CaseConfig).describe("Test cases to run"),
		metricsExtractor: MetricsExtractorConfig.describe("Metrics extractor configuration"),
		output: OutputConfig.describe("Output configuration"),
		evaluators: z
			.array(EvaluatorEntrySchema)
			.optional()
			.describe("Evaluator configurations to run after experiment completion"),
	})
	.superRefine((data, ctx) => {
		// Check for duplicate SUT IDs
		const sutIds = new Set<string>();
		for (const sut of data.suts) {
			if (sutIds.has(sut.id)) {
				ctx.addIssue({
					code: "custom",
					message: `Duplicate SUT ID: ${sut.id}`,
					path: ["suts"],
				});
			}
			sutIds.add(sut.id);
		}

		// Check for duplicate case IDs
		const caseIds = new Set<string>();
		for (const testCase of data.cases) {
			if (caseIds.has(testCase.id)) {
				ctx.addIssue({
					code: "custom",
					message: `Duplicate case ID: ${testCase.id}`,
					path: ["cases"],
				});
			}
			caseIds.add(testCase.id);
		}
	})
	.meta({
		title: "ExperimentConfig",
		description: "PPEF experiment configuration",
	});
export type ExperimentConfig = z.infer<typeof ExperimentConfig>;

/**
 * CLI command options.
 */
export interface CliOptions {
	/** Path to config file */
	config?: string;

	/** Output directory override */
	output?: string;

	/** Output format */
	format?: "json" | "json-pretty";

	/** Skip aggregation */
	noAggregate?: boolean;

	/** Override concurrency */
	jobs?: number;

	/** Verbose logging */
	verbose?: boolean;

	/** Suppress output */
	quiet?: boolean;

	/** Dry run (plan without executing) */
	dryRun?: boolean;

	/**
	 * Run in-process without worker thread isolation.
	 *
	 * WARNING: This is unsafe and should only be used for debugging.
	 * SUT crashes can crash the CLI process.
	 */
	unsafeInProcess?: boolean;
}

/**
 * Validation result.
 */
export interface ValidationResult {
	/** Whether validation passed */
	valid: boolean;

	/** Validation errors */
	errors: string[];

	/** Validation warnings */
	warnings: string[];
}

/**
 * Loaded and validated experiment configuration.
 */
export interface LoadedConfig {
	/** Parsed experiment configuration */
	config: ExperimentConfig;

	/** Directory containing the config file (for resolving module paths) */
	baseDir: string;

	/** Absolute path to config file */
	configPath: string;
}

/**
 * Module export types for dynamic loading.
 */
export type SutFactoryExport = (config?: Record<string, unknown>) => {
	id: string;
	config?: Record<string, unknown>;
	run: (inputs: unknown) => Promise<unknown>;
};

export type CaseDefinitionExport = () => {
	case: {
		caseId: string;
		name?: string;
		caseClass?: string;
		inputs: unknown;
		expectedOutput?: unknown;
		version?: string;
		tags?: readonly string[];
	};
	getInput: () => Promise<unknown>;
	getInputs: () => unknown;
};

export type MetricsExtractorExport = (result: unknown) => Record<string, number>;
