/**
 * Evaluate Command
 *
 * Evaluates results using the extensible evaluator system.
 * Supports claims, robustness, metrics, and custom evaluators.
 */

import { readFile, writeFile } from "node:fs/promises";

import type { Command } from "commander";

import { EvaluatorRegistry } from "../../evaluators/index.js";
import type { ICommandLogger, IFileSystem } from "../command-deps.js";
import type {
	EvaluationContext,
	EvaluatorConfig,
	EvaluationType,
	ClaimsEvaluatorConfig,
	RobustnessEvaluatorConfig,
	MetricsEvaluatorConfig,
} from "../../types/evaluator.js";
import type { AggregatedResult } from "../../types/aggregate.js";
import type { EvaluationResult } from "../../types/result.js";
import { LaTeXRenderer } from "../../renderers/latex-renderer.js";

/**
 * Supported output formats.
 */
type OutputFormat = "json" | "json-pretty" | "latex" | "markdown";

/**
 * Execute evaluate command with injected dependencies.
 *
 * This function is exported for testing.
 *
 * @param aggregatesFile - Path to aggregates JSON file
 * @param options - Command options
 * @param dependencies - Injected dependencies
 */
export async function executeEvaluate(
	aggregatesFile: string,
	options: {
		type: EvaluationType;
		config?: string;
		output?: string;
		format?: OutputFormat;
		verbose?: boolean;
	},
	dependencies: {
		logger: ICommandLogger;
		fileSystem: IFileSystem;
		processExit: (code: number) => never;
	},
): Promise<void> {
	const { logger, fileSystem, processExit } = dependencies;

	try {
		logger.header("Evaluating Results");

		// Load aggregates
		logger.info(`Reading aggregates from: ${aggregatesFile}`);
		const content = await fileSystem.readFile(aggregatesFile, "utf-8");
		const data = JSON.parse(content) as { aggregates?: unknown[]; results?: unknown[] };

		// Determine if file has aggregates or raw results
		const hasAggregates = data.aggregates && Array.isArray(data.aggregates);
		const hasResults = data.results && Array.isArray(data.results);

		let aggregates: AggregatedResult[];
		let rawResults: EvaluationResult[] | undefined;

		if (hasAggregates) {
			aggregates = data.aggregates as AggregatedResult[];
			logger.info(`Found ${aggregates.length} aggregated results`);
		} else if (hasResults) {
			// Need to aggregate first
			logger.info(`Found ${data.results?.length ?? 0} raw results - need to aggregate first`);
			logger.error(
				"Please run 'ppef aggregate' on the results file first, or use an aggregates file",
			);
			processExit(1);
			return; // Type narrowing
		} else {
			throw new Error("Invalid file: must contain 'aggregates' or 'results' array");
		}

		// Load evaluator config
		let evaluatorConfig: EvaluatorConfig;
		if (options.config) {
			logger.info(`Loading evaluator config from: ${options.config}`);
			const configContent = await fileSystem.readFile(options.config, "utf-8");
			evaluatorConfig = JSON.parse(configContent) as EvaluatorConfig;
		} else {
			logger.warn("No evaluator config provided - using default empty config");
			evaluatorConfig = {};
		}

		// Get evaluator from registry
		logger.info(`Evaluator type: ${options.type}`);
		const evaluator = EvaluatorRegistry.getOrThrow(options.type);

		// Validate config
		logger.subheader("Validating evaluator configuration...");
		const validation = evaluator.validateConfig(
			evaluatorConfig as ClaimsEvaluatorConfig & RobustnessEvaluatorConfig & MetricsEvaluatorConfig,
		);

		if (!validation.valid) {
			logger.error("Evaluator configuration validation failed:");
			for (const error of validation.errors ?? []) {
				logger.error(`  - ${error}`);
			}
			processExit(1);
			return; // Type narrowing
		}

		if (validation.warnings && validation.warnings.length > 0) {
			logger.warn("Configuration warnings:");
			for (const warning of validation.warnings) {
				logger.warn(`  - ${warning}`);
			}
		}
		logger.info("Configuration valid");

		// Prepare evaluation context
		const context: EvaluationContext = {
			aggregates,
			rawResults,
			metadata: {
				source: aggregatesFile,
			},
		};

		// Run evaluation
		logger.subheader("Running evaluation...");
		const output = evaluator.evaluate(
			evaluatorConfig as ClaimsEvaluatorConfig & RobustnessEvaluatorConfig & MetricsEvaluatorConfig,
			context,
		);

		logger.info(`Evaluation complete: ${output.type}`);

		// Display summary
		if (options.verbose) {
			const summary = evaluator.summarize(output);
			logger.subheader("Evaluation Summary");
			logger.info(`Total items: ${summary.total}`);
			if (summary.passed !== undefined) {
				logger.info(`Passed: ${summary.passed}`);
			}
			if (summary.failed !== undefined) {
				logger.info(`Failed: ${summary.failed}`);
			}
			if (summary.inconclusive !== undefined) {
				logger.info(`Inconclusive: ${summary.inconclusive}`);
			}
			if (summary.passRate !== undefined) {
				logger.info(`Pass rate: ${(summary.passRate * 100).toFixed(1)}%`);
			}
			if (summary.additional) {
				logger.info(`Additional:`);
				for (const [key, value] of Object.entries(summary.additional)) {
					logger.info(`  ${key}: ${value}`);
				}
			}
		}

		// Determine output path
		const format = options.format ?? "json-pretty";
		const defaultOutputName = aggregatesFile.replace(/-aggregates/, `-evaluation-${options.type}`);
		const outputPath = options.output ?? defaultOutputName;

		// Format and write output
		logger.subheader("Writing output...");
		let outputContent: string;
		let outputFilename: string;

		if (format === "latex") {
			// Use LaTeX renderer
			const renderer = new LaTeXRenderer();
			const rendered = renderer.renderEvaluation(output);
			outputContent = rendered.content;
			outputFilename = rendered.filename;
			if (options.output) {
				outputFilename = options.output;
			}
			await writeFile(outputFilename, outputContent, "utf-8");
		} else {
			// JSON output
			outputContent =
				format === "json-pretty" ? JSON.stringify(output, null, 2) : JSON.stringify(output);
			outputFilename = outputPath.endsWith(".json") ? outputPath : `${outputPath}.json`;
			await writeFile(outputFilename, outputContent, "utf-8");
		}

		logger.info(`Output written to: ${outputFilename}`);
		logger.info("");
		logger.info("Evaluation completed successfully!");
	} catch (error) {
		if (error instanceof Error) {
			logger.error(error.message);
			if (options.verbose && error.stack) {
				logger.debug(error.stack);
			}
		} else {
			logger.error(String(error));
		}
		processExit(1);
	}
}

/**
 * Register the evaluate command.
 *
 * @param program - Commander program instance
 */
export function registerEvaluateCommand(program: Command): void {
	program
		.command("evaluate")
		.description("Evaluate results using the extensible evaluator system")
		.argument("<aggregates-file>", "Path to aggregates JSON file")
		.requiredOption("-t, --type <type>", "Evaluation type (claims|robustness|metrics|custom)")
		.option("-c, --config <path>", "Evaluator configuration JSON file")
		.option("-o, --output <path>", "Output file path")
		.option(
			"-f, --format <format>",
			"Output format (json|json-pretty|latex|markdown)",
			"json-pretty",
		)
		.option("-v, --verbose", "Verbose output with summary statistics")
		.action(async (aggregatesFile: string, options: Record<string, unknown>) => {
			const { createLogger } = await import("../logger.js");

			const logger = createLogger();

			await executeEvaluate(
				aggregatesFile,
				{
					type: options.type as EvaluationType,
					config: options.config as string | undefined,
					output: options.output as string | undefined,
					format: options.format as OutputFormat | undefined,
					verbose: options.verbose as boolean | undefined,
				},
				{
					logger,
					fileSystem: {
						readFile: (path: string, encoding: string) =>
							readFile(path, encoding as BufferEncoding),
					},
					processExit: (code: number) => process.exit(code),
				},
			);
		});
}
