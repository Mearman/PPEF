/**
 * Command dependencies interface for dependency injection.
 *
 * This allows commands to be tested with mocked dependencies.
 */

import type { EvaluationResult } from "../types/result.js";
import type { AggregationOutput } from "../types/aggregate.js";
import type { LoadedConfig } from "./types.js";

/**
 * Logger interface for output handling.
 */
export interface ICommandLogger {
	header(message: string): void;
	subheader(message: string): void;
	info(message: string): void;
	debug(message: string): void;
	error(message: string): void;
	warn(message: string): void;
	setProgress(enabled: boolean): void;
}

/**
 * Configuration loader interface.
 */
export interface IConfigLoader {
	loadAndValidateConfig(configPath: string): Promise<LoadedConfig>;
}

/**
 * SUT factory interface.
 */
export interface ISutFactory {
	id: string;
	config: unknown;
	run: (input: unknown) => Promise<unknown>;
}

/**
 * Case definition interface.
 */
export interface ICaseDefinition {
	caseId: string;
	getInput: () => Promise<unknown>;
	getInputs?: () => unknown[];
}

/**
 * Metrics extractor interface.
 */
export interface IMetricsExtractor {
	extract: (result: unknown, input: unknown) => Record<string, number>;
}

/**
 * Module loader interface for dynamic imports.
 */
export interface IModuleLoader {
	loadSutFactory(
		module: string,
		exportName: string,
		baseDir: string,
		registration: {
			id: string;
			name: string;
			version: string;
			role: string;
			config: unknown;
			tags: string[];
			description?: string;
		},
		sutConfig: unknown,
	): Promise<ISutFactory>;

	loadCaseDefinition(module: string, exportName: string, baseDir: string): Promise<ICaseDefinition>;

	loadMetricsExtractor(
		module: string,
		exportName: string,
		baseDir: string,
	): Promise<IMetricsExtractor>;
}

/**
 * Output writer interface.
 */
export interface IOutputWriter {
	generateOutputFilename(experimentName: string, type: "results" | "aggregates"): string;
	writeResults(
		results: EvaluationResult[],
		outputPath: string,
		format: "json" | "json-pretty",
	): Promise<void>;
	writeAggregates(
		aggregates: AggregationOutput,
		outputPath: string,
		format: "json" | "json-pretty",
	): Promise<void>;
}

/**
 * Executor interface.
 */
export interface IExecutor {
	execute(
		sutDefinitions: ISutFactory[],
		caseDefinitions: ICaseDefinition[],
		metricsExtractor: IMetricsExtractor,
		onResult?: (result: EvaluationResult) => void,
	): Promise<{ results: EvaluationResult[]; errors: { runId: string; error: string }[] }>;
}

/**
 * Aggregator interface.
 */
export interface IAggregator {
	aggregateResults(results: EvaluationResult[]): AggregationOutput;
}

/**
 * Command dependencies container.
 */
export interface ICommandDependencies {
	logger: ICommandLogger;
	configLoader: IConfigLoader;
	moduleLoader: IModuleLoader;
	outputWriter: IOutputWriter;
	executor: new (config: unknown) => IExecutor;
	aggregator: IAggregator;
	processExit: (code: number) => never;
}
