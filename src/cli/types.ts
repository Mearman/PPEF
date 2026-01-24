/**
 * CLI Type Definitions
 *
 * Types for the JSON experiment configuration and CLI options.
 */

import type { SutRole } from "../types/sut.js";

/**
 * Experiment metadata.
 */
export interface ExperimentMeta {
	/** Experiment name */
	name: string;

	/** Experiment description */
	description?: string;

	/** Version string */
	version?: string;
}

/**
 * Executor configuration from JSON.
 */
export interface ExecutorConfig {
	/** Continue execution if a single run fails */
	continueOnError?: boolean;

	/** Number of repetitions per case */
	repetitions?: number;

	/** Random seed base */
	seedBase?: number;

	/** Timeout per run in milliseconds (0 = no timeout) */
	timeoutMs?: number;

	/** Whether to collect provenance information */
	collectProvenance?: boolean;

	/** Number of concurrent runs */
	concurrency?: number;
}

/**
 * SUT configuration from JSON.
 */
export interface SutConfig {
	/** Unique SUT identifier */
	id: string;

	/** Path to module file (relative to config file) */
	module: string;

	/** Name of the export to use as factory */
	exportName: string;

	/** Optional configuration to pass to factory */
	config?: Record<string, unknown>;

	/** SUT registration metadata */
	registration: {
		/** Human-readable name */
		name: string;

		/** Version string */
		version: string;

		/** Role in evaluation */
		role: SutRole;

		/** Searchable tags */
		tags?: string[];

		/** Optional description */
		description?: string;
	};
}

/**
 * Case configuration from JSON.
 */
export interface CaseConfig {
	/** Unique case identifier */
	id: string;

	/** Path to module file (relative to config file) */
	module: string;

	/** Name of the export to use as case factory */
	exportName: string;
}

/**
 * Metrics extractor configuration from JSON.
 */
export interface MetricsExtractorConfig {
	/** Path to module file (relative to config file) */
	module: string;

	/** Name of the export to use as metrics extractor */
	exportName: string;
}

/**
 * Output configuration from JSON.
 */
export interface OutputConfig {
	/** Output directory path */
	path?: string;

	/** Output format: "json" or "json-pretty" */
	format?: "json" | "json-pretty";

	/** Whether to aggregate results */
	aggregate?: boolean;
}

/**
 * Complete experiment configuration from JSON.
 */
export interface ExperimentConfig {
	/** Experiment metadata */
	experiment: ExperimentMeta;

	/** Executor configuration */
	executor: ExecutorConfig;

	/** SUTs to evaluate */
	suts: SutConfig[];

	/** Test cases to run */
	cases: CaseConfig[];

	/** Metrics extractor configuration */
	metricsExtractor: MetricsExtractorConfig;

	/** Output configuration */
	output: OutputConfig;
}

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
