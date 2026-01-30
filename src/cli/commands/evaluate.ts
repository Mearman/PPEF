/**
 * Evaluate Command
 *
 * Evaluates results using the extensible evaluator system.
 * Supports claims, robustness, metrics, and custom evaluators.
 */

import { readFile, writeFile } from "node:fs/promises";

import type { Command } from "commander";

import {
	EvaluatorRegistry,
	ClaimsEvaluator,
	RobustnessEvaluator,
	MetricsEvaluator,
	ExploratoryEvaluator,
} from "../../evaluators/index.js";
import type { ICommandLogger, IFileSystem } from "../command-deps.js";
import type { EvaluationContext, EvaluationType, EvaluationOutput } from "../../types/evaluator.js";
import {
	ClaimsEvaluatorConfigSchema,
	RobustnessEvaluatorConfigSchema,
	MetricsEvaluatorConfigSchema,
	ExploratoryEvaluatorConfigSchema,
} from "../evaluator-schemas.js";
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

		// Load evaluator config as raw JSON (validated per-type in switch below)
		let rawConfig: unknown;
		if (options.config) {
			logger.info(`Loading evaluator config from: ${options.config}`);
			const configContent = await fileSystem.readFile(options.config, "utf-8");
			rawConfig = JSON.parse(configContent);
		} else {
			logger.warn("No evaluator config provided - using default empty config");
			rawConfig = {};
		}

		// Get evaluator from registry using type-safe retrieval
		logger.info(`Evaluator type: ${options.type}`);

		// Type-safe evaluator retrieval and execution
		let output: EvaluationOutput<unknown>;
		let summary: {
			total: number;
			passed?: number;
			failed?: number;
			inconclusive?: number;
			passRate?: number;
			additional?: Record<string, number | string>;
		};

		switch (options.type) {
			case "claims": {
				const evaluator = EvaluatorRegistry.getAs("claims", ClaimsEvaluator);
				if (!evaluator) {
					logger.error(`Evaluator not found for type: claims`);
					processExit(1);
					return; // Type narrowing
				}

				// Validate config with Zod schema
				logger.subheader("Validating evaluator configuration...");
				const parseResult = ClaimsEvaluatorConfigSchema.safeParse(rawConfig);
				if (!parseResult.success) {
					logger.error("Evaluator configuration validation failed:");
					for (const issue of parseResult.error.issues) {
						logger.error(`  - ${issue.path.join(".")}: ${issue.message}`);
					}
					processExit(1);
					return; // Type narrowing
				}
				const claimsConfig = parseResult.data;

				// Also run evaluator's own validation (business logic checks)
				const validation = evaluator.validateConfig(claimsConfig);
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
				const evalOutput = evaluator.evaluate(claimsConfig, context);
				output = evalOutput;
				summary = evaluator.summarize(evalOutput);
				break;
			}
			case "robustness": {
				const evaluator = EvaluatorRegistry.getAs("robustness", RobustnessEvaluator);
				if (!evaluator) {
					logger.error(`Evaluator not found for type: robustness`);
					processExit(1);
					return; // Type narrowing
				}

				// Validate config with Zod schema
				logger.subheader("Validating evaluator configuration...");
				const parseResult = RobustnessEvaluatorConfigSchema.safeParse(rawConfig);
				if (!parseResult.success) {
					logger.error("Evaluator configuration validation failed:");
					for (const issue of parseResult.error.issues) {
						logger.error(`  - ${issue.path.join(".")}: ${issue.message}`);
					}
					processExit(1);
					return; // Type narrowing
				}
				const robustnessConfig = parseResult.data;

				// Also run evaluator's own validation (business logic checks)
				const validation = evaluator.validateConfig(robustnessConfig);
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

				// Robustness evaluator requires raw results, not aggregates
				if (!rawResults || rawResults.length === 0) {
					logger.error("Robustness evaluation requires raw results, but none found");
					processExit(1);
					return; // Type narrowing
				}

				// Run evaluation
				logger.subheader("Running evaluation...");
				const evalOutput = evaluator.evaluate(robustnessConfig, rawResults);
				output = evalOutput;
				summary = evaluator.summarize(evalOutput);
				break;
			}
			case "metrics": {
				const evaluator = EvaluatorRegistry.getAs("metrics", MetricsEvaluator);
				if (!evaluator) {
					logger.error(`Evaluator not found for type: metrics`);
					processExit(1);
					return; // Type narrowing
				}

				// Validate config with Zod schema
				logger.subheader("Validating evaluator configuration...");
				const parseResult = MetricsEvaluatorConfigSchema.safeParse(rawConfig);
				if (!parseResult.success) {
					logger.error("Evaluator configuration validation failed:");
					for (const issue of parseResult.error.issues) {
						logger.error(`  - ${issue.path.join(".")}: ${issue.message}`);
					}
					processExit(1);
					return; // Type narrowing
				}
				const metricsConfig = parseResult.data;

				// Also run evaluator's own validation (business logic checks)
				const validation = evaluator.validateConfig(metricsConfig);
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
				const evalOutput = evaluator.evaluate(metricsConfig, context);
				output = evalOutput;
				summary = evaluator.summarize(evalOutput);
				break;
			}
			case "exploratory": {
				const evaluator = EvaluatorRegistry.getAs("exploratory", ExploratoryEvaluator);
				if (!evaluator) {
					logger.error(`Evaluator not found for type: exploratory`);
					processExit(1);
					return; // Type narrowing
				}

				// Validate config with Zod schema
				logger.subheader("Validating evaluator configuration...");
				const parseResult = ExploratoryEvaluatorConfigSchema.safeParse(rawConfig);
				if (!parseResult.success) {
					logger.error("Evaluator configuration validation failed:");
					for (const issue of parseResult.error.issues) {
						logger.error(`  - ${issue.path.join(".")}: ${issue.message}`);
					}
					processExit(1);
					return; // Type narrowing
				}
				const exploratoryConfig = parseResult.data;

				// Also run evaluator's own validation (business logic checks)
				const validation = evaluator.validateConfig(exploratoryConfig);
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
				const evalOutput = evaluator.evaluate(exploratoryConfig, context);
				output = evalOutput;
				summary = evaluator.summarize(evalOutput);
				break;
			}
			default:
				logger.error(`Unsupported evaluator type: ${options.type}`);
				processExit(1);
				return; // Type narrowing
		}

		logger.info(`Evaluation complete: ${output.type}`);

		// Display summary
		if (options.verbose) {
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
			await fileSystem.writeFile(outputFilename, outputContent, "utf-8");
		} else {
			// JSON output
			outputContent =
				format === "json-pretty" ? JSON.stringify(output, null, 2) : JSON.stringify(output);
			outputFilename = outputPath.endsWith(".json") ? outputPath : `${outputPath}.json`;
			await fileSystem.writeFile(outputFilename, outputContent, "utf-8");
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
						writeFile: (path: string, data: string, encoding: string) =>
							writeFile(path, data, encoding as BufferEncoding),
					},
					processExit: (code: number) => process.exit(code),
				},
			);
		});
}
