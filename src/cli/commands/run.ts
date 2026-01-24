/**
 * Run Command
 *
 * Executes experiments based on JSON configuration.
 */

import type { Command } from "commander";

import { aggregateResults, createAggregationOutput } from "../../aggregation/index.js";
import { Executor } from "../../executor/index.js";
import type { CliOptions } from "../types.js";
import { loadAndValidateConfig } from "../config-loader.js";
import { createLogger } from "../logger.js";
import { loadCaseDefinition, loadMetricsExtractor, loadSutFactory } from "../module-loader.js";
import { generateOutputFilename, writeAggregates, writeResults } from "../output-writer.js";

/**
 * Register the run command.
 *
 * @param program - Commander program instance
 */
export function registerRunCommand(program: Command): void {
	program
		.command("run")
		.description("Run experiments from a configuration file")
		.argument("<config-file>", "Path to experiment configuration JSON file")
		.option("-o, --output <path>", "Output directory")
		.option("-f, --format <format>", "Output format (json or json-pretty)", "json-pretty")
		.option("--no-aggregate", "Skip aggregation")
		.option("-j, --jobs <number>", "Override concurrency", (value) => Number.parseInt(value, 10))
		.option("-v, --verbose", "Verbose logging")
		.option("-q, --quiet", "Suppress output")
		.option("--dry-run", "Plan without running")
		.action(async (configFile: string, options: CliOptions) => {
			const logger = createLogger(options);

			try {
				logger.header(`Experiment: ${options.dryRun ? "Dry Run" : "Execution"}`);

				// Load and validate configuration
				const loaded = await loadAndValidateConfig(configFile);
				const { config, baseDir } = loaded;

				logger.info(`Configuration: ${loaded.configPath}`);
				logger.info(`Experiment: ${config.experiment.name}`);
				if (config.experiment.description) {
					logger.info(`Description: ${config.experiment.description}`);
				}

				// Apply CLI overrides
				const executorConfig = { ...config.executor };
				if (options.jobs !== undefined) {
					executorConfig.concurrency = options.jobs;
					logger.debug(`Concurrency overridden to ${options.jobs}`);
				}

				// Load SUTs
				logger.subheader("Loading SUTs...");
				const sutDefinitions = await Promise.all(
					config.suts.map(async (sutConfig) => {
						logger.debug(`Loading SUT: ${sutConfig.id} from ${sutConfig.module}`);
						return loadSutFactory(
							sutConfig.module,
							sutConfig.exportName,
							baseDir,
							{
								id: sutConfig.id,
								name: sutConfig.registration.name,
								version: sutConfig.registration.version,
								role: sutConfig.registration.role,
								config: sutConfig.config ?? {},
								tags: sutConfig.registration.tags ?? [],
								description: sutConfig.registration.description,
							},
							sutConfig.config,
						);
					}),
				);
				logger.info(`Loaded ${sutDefinitions.length} SUTs`);

				// Load cases
				logger.subheader("Loading cases...");
				const caseDefinitions = await Promise.all(
					config.cases.map(async (caseConfig) => {
						logger.debug(`Loading case: ${caseConfig.id} from ${caseConfig.module}`);
						return loadCaseDefinition(caseConfig.module, caseConfig.exportName, baseDir);
					}),
				);
				logger.info(`Loaded ${caseDefinitions.length} cases`);

				// Load metrics extractor
				logger.subheader("Loading metrics extractor...");
				const metricsExtractor = await loadMetricsExtractor(
					config.metricsExtractor.module,
					config.metricsExtractor.exportName,
					baseDir,
				);
				logger.info(`Metrics extractor loaded from ${config.metricsExtractor.module}`);

				// Create executor
				const executor = new Executor(executorConfig);

				// Plan runs
				logger.subheader("Planning execution...");
				const plannedRuns = executor.plan(sutDefinitions, caseDefinitions);
				logger.info(`Planned ${plannedRuns.length} runs`);

				// Dry run - just show plan and exit
				if (options.dryRun) {
					logger.info("");
					logger.subheader("Dry run - not executing");
					logger.info(`SUTs: ${sutDefinitions.map((s) => s.registration.id).join(", ")}`);
					logger.info(`Cases: ${caseDefinitions.map((c) => c.case.caseId).join(", ")}`);
					logger.info(`Total runs: ${plannedRuns.length}`);
					return;
				}

				// Execute
				logger.subheader("Executing...");
				logger.setProgress(true);

				const startTime = Date.now();
				const summary = await executor.execute(
					sutDefinitions,
					caseDefinitions,
					metricsExtractor,
					undefined,
				);
				const elapsed = Date.now() - startTime;

				logger.setProgress(false);
				logger.info("");

				// Report results
				logger.subheader("Execution Summary");
				logger.info(`Total runs: ${summary.totalRuns}`);
				logger.info(`Successful: ${summary.successfulRuns}`);
				logger.info(`Failed: ${summary.failedRuns}`);
				logger.info(`Elapsed time: ${(elapsed / 1000).toFixed(2)}s`);

				if (summary.errors.length > 0) {
					logger.warn(`Errors encountered: ${summary.errors.length}`);
					for (const error of summary.errors.slice(0, 5)) {
						logger.warn(`  - ${error.runId}: ${error.error}`);
					}
					if (summary.errors.length > 5) {
						logger.warn(`  ... and ${summary.errors.length - 5} more`);
					}
				}

				// Determine output settings
				const outputPath = options.output ?? config.output.path ?? "./results";
				const format = options.format ?? config.output.format ?? "json-pretty";
				const shouldAggregate = options.noAggregate !== true && config.output.aggregate !== false;

				// Write results
				logger.subheader("Writing results...");
				const resultsFilename = generateOutputFilename(config.experiment.name, "results");
				const resultsPath = `${outputPath}/${resultsFilename}`;
				await writeResults(summary.results, resultsPath, format);
				logger.info(`Results written to: ${resultsPath}`);

				// Aggregate if requested
				if (shouldAggregate && summary.results.length > 0) {
					logger.subheader("Aggregating results...");
					const aggregates = aggregateResults(summary.results, {
						groupByCaseClass: true,
						computeComparisons: true,
					});
					const aggregationOutput = createAggregationOutput(aggregates, summary.results);

					const aggregatesFilename = generateOutputFilename(config.experiment.name, "aggregates");
					const aggregatesPath = `${outputPath}/${aggregatesFilename}`;
					await writeAggregates(aggregationOutput, aggregatesPath, format);
					logger.info(`Aggregates written to: ${aggregatesPath}`);

					logger.info("");
					logger.subheader("Aggregation Summary");
					for (const agg of aggregates) {
						const caseClassSuffix = agg.caseClass ? ` (${agg.caseClass})` : "";
						logger.info(`${agg.sut}${caseClassSuffix}:`);
						logger.info(`  Runs: ${agg.group.runCount}`);
						logger.info(`  Cases: ${agg.group.caseCount}`);
						for (const [metric, stats] of Object.entries(agg.metrics)) {
							const std = stats.std ?? 0;
							logger.info(`  ${metric}: mean=${stats.mean.toFixed(2)}, std=${std.toFixed(2)}`);
						}
					}
				}

				logger.info("");
				logger.info("Experiment completed successfully!");
			} catch (error) {
				logger.setProgress(false);

				if (error instanceof Error) {
					logger.error(error.message);
					if (options.verbose) {
						console.error(error.stack);
					}
				} else {
					logger.error(String(error));
				}
				process.exit(1);
			}
		});
}
