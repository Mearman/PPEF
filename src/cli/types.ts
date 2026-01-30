/**
 * CLI Type Definitions
 *
 * Types for the JSON experiment configuration and CLI options.
 * Config types use Zod schemas for runtime validation + inferred TypeScript types.
 */

import { z } from "zod";

/**
 * SUT role enum for JSON validation.
 * Values match the SutRole string literal union in types/sut.ts.
 */
export const SutRoleSchema = z.enum(["primary", "baseline", "oracle"]);

/**
 * Experiment metadata.
 */
export const ExperimentMeta = z.object({
	/** Experiment name */
	name: z.string().min(1),
	/** Experiment description */
	description: z.string().optional(),
	/** Version string */
	version: z.string().optional(),
});
export type ExperimentMeta = z.infer<typeof ExperimentMeta>;

/**
 * Executor configuration from JSON.
 */
export const ExecutorConfig = z.object({
	/** Continue execution if a single run fails */
	continueOnError: z.boolean().optional(),
	/** Number of repetitions per case */
	repetitions: z.number().int().min(1).optional(),
	/** Random seed base */
	seedBase: z.number().int().min(0).optional(),
	/** Timeout per run in milliseconds (0 = no timeout) */
	timeoutMs: z.number().int().min(0).optional(),
	/** Whether to collect provenance information */
	collectProvenance: z.boolean().optional(),
	/** Number of concurrent runs */
	concurrency: z.number().int().min(1).optional(),
});
export type ExecutorConfig = z.infer<typeof ExecutorConfig>;

/**
 * SUT registration metadata.
 */
export const SutRegistration = z.object({
	/** Human-readable name */
	name: z.string().min(1),
	/** Version string */
	version: z.string().min(1),
	/** Role in evaluation */
	role: SutRoleSchema,
	/** Searchable tags */
	tags: z.array(z.string()).optional(),
	/** Optional description */
	description: z.string().optional(),
});
export type SutRegistration = z.infer<typeof SutRegistration>;

/**
 * SUT configuration from JSON.
 */
export const SutConfig = z.object({
	/** Unique SUT identifier */
	id: z.string().min(1),
	/** Path to module file (relative to config file) */
	module: z.string().min(1),
	/** Name of the export to use as factory */
	exportName: z.string().min(1),
	/** Optional configuration to pass to factory */
	config: z.record(z.string(), z.unknown()).optional(),
	/** SUT type: "module" (default) or "binary" */
	type: z.enum(["module", "binary"]).optional(),
	/** Binary SUT: command to execute (when type="binary") */
	binaryCommand: z.string().optional(),
	/** Binary SUT: arguments to pass to command */
	binaryArgs: z.array(z.string()).optional(),
	/** Binary SUT: how to serialize inputs to stdin */
	binaryInputFormat: z.enum(["json", "raw", "lines"]).optional(),
	/** Binary SUT: how to deserialize stdout */
	binaryOutputFormat: z.enum(["json", "raw", "lines"]).optional(),
	/** Binary SUT: timeout per run in milliseconds */
	binaryTimeout: z.number().int().min(0).optional(),
	/** SUT registration metadata */
	registration: SutRegistration,
});
export type SutConfig = z.infer<typeof SutConfig>;

/**
 * Case configuration from JSON.
 */
export const CaseConfig = z.object({
	/** Unique case identifier */
	id: z.string().min(1),
	/** Path to module file (relative to config file) */
	module: z.string().min(1),
	/** Name of the export to use as case factory */
	exportName: z.string().min(1),
});
export type CaseConfig = z.infer<typeof CaseConfig>;

/**
 * Metrics extractor configuration from JSON.
 */
export const MetricsExtractorConfig = z.object({
	/** Path to module file (relative to config file) */
	module: z.string().min(1),
	/** Name of the export to use as metrics extractor */
	exportName: z.string().min(1),
});
export type MetricsExtractorConfig = z.infer<typeof MetricsExtractorConfig>;

/**
 * Output configuration from JSON.
 */
export const OutputConfig = z.object({
	/** Output directory path */
	path: z.string().optional(),
	/** Output format: "json" or "json-pretty" */
	format: z.enum(["json", "json-pretty"]).optional(),
	/** Whether to aggregate results */
	aggregate: z.boolean().optional(),
});
export type OutputConfig = z.infer<typeof OutputConfig>;

/**
 * Complete experiment configuration from JSON.
 */
export const ExperimentConfig = z
	.object({
		/** Experiment metadata */
		experiment: ExperimentMeta,
		/** Executor configuration */
		executor: ExecutorConfig,
		/** SUTs to evaluate */
		suts: z.array(SutConfig),
		/** Test cases to run */
		cases: z.array(CaseConfig),
		/** Metrics extractor configuration */
		metricsExtractor: MetricsExtractorConfig,
		/** Output configuration */
		output: OutputConfig,
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
