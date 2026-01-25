/**
 * Run Command
 *
 * Executes experiments based on JSON configuration.
 */

import type { Command } from "commander";
import { resolve } from "node:path";

import { aggregateResults, createAggregationOutput } from "../../aggregation/index.js";
import { Executor } from "../../executor/index.js";
import type { CheckpointData } from "../../executor/checkpoint-manager.js";
import type {
	IAggregator,
	ICommandLogger,
	IConfigLoader,
	IExecutor,
	IModuleLoader,
	IOutputWriter,
} from "../command-deps.js";
import type { CliOptions } from "../types.js";
import { loadAndValidateConfig } from "../config-loader.js";
import { loadCaseDefinition, loadMetricsExtractor, loadSutFactory } from "../module-loader.js";
import { generateOutputFilename, writeAggregates, writeResults } from "../output-writer.js";

/**
 * Merge checkpoint shards from worker threads.
 *
 * After worker threads complete execution, each worker has its own checkpoint shard.
 * This function merges all shards into a single checkpoint file.
 *
 * @param baseDir - Base directory for checkpoints
 * @param logger - Command logger
 */
async function mergeCheckpointShards(baseDir: string, logger: ICommandLogger): Promise<void> {
	const { readdir, unlink } = await import("node:fs/promises");
	const { FileStorage } = await import("../../executor/checkpoint-storage.js");

	const checkpointDir = resolve(baseDir, "results/execute");

	try {
		const files = await readdir(checkpointDir);
		const shards = files.filter((f) => f.startsWith("checkpoint-worker-") && f.endsWith(".json"));

		if (shards.length === 0) {
			// No shards found - nothing to merge
			return;
		}

		logger.info(`Merging ${shards.length} checkpoint shards...`);

		// Load and merge all shards
		const mergedData: CheckpointData = {
			configHash: "merged",
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			completedRunIds: [],
			results: {},
			totalPlanned: 0,
		};

		for (const shard of shards) {
			const shardPath = resolve(checkpointDir, shard);
			const storage = new FileStorage(shardPath);
			const data = await storage.load();

			if (data?.completedRunIds) {
				// Merge run IDs into the array
				for (const runId of data.completedRunIds) {
					if (!mergedData.completedRunIds.includes(runId)) {
						mergedData.completedRunIds.push(runId);
					}
				}
			}

			// Merge results if present
			if (data?.results) {
				Object.assign(mergedData.results, data.results);
			}

			// Update total planned from first shard
			if (data?.totalPlanned && mergedData.totalPlanned === 0) {
				mergedData.totalPlanned = data.totalPlanned;
			}
		}

		// Write merged checkpoint
		const mainStorage = new FileStorage(resolve(checkpointDir, "checkpoint.json"));
		await mainStorage.save(mergedData);

		logger.info("Checkpoint shards merged successfully");

		// Clean up shard files
		for (const shard of shards) {
			const shardPath = resolve(checkpointDir, shard);
			await unlink(shardPath).catch(() => {
				// Ignore errors during cleanup
			});
		}

		logger.debug(`Cleaned up ${shards.length} shard files`);
	} catch (error) {
		// Checkpoint directory doesn't exist or other error - log and continue
		logger.debug(
			`Checkpoint merge skipped: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

/**
 * Execute run command with injected dependencies.
 *
 * This function is exported for testing.
 *
 * @param configFile - Path to config file
 * @param options - Command options
 * @param dependencies - Injected dependencies
 */
export async function executeRun(
	configFile: string,
	options: CliOptions,
	dependencies: {
		logger: ICommandLogger;
		configLoader: IConfigLoader;
		moduleLoader: IModuleLoader;
		createExecutor: (config: unknown) => IExecutor;
		aggregator: IAggregator;
		outputWriter: IOutputWriter;
		processExit: (code: number) => never;
	},
): Promise<void> {
	const {
		logger,
		configLoader,
		moduleLoader,
		createExecutor,
		aggregator,
		outputWriter,
		processExit,
	} = dependencies;

	try {
		logger.header(`Experiment: ${options.dryRun ? "Dry Run" : "Execution"}`);

		// Load and validate configuration
		const loaded = await configLoader.loadAndValidateConfig(configFile);
		const { config, baseDir } = loaded;

		logger.info(`Configuration: ${loaded.configPath}`);
		logger.info(`Experiment: ${config.experiment.name}`);
		if (config.experiment.description) {
			logger.info(`Description: ${config.experiment.description}`);
		}

		// Apply CLI overrides
		const executorConfig = { ...config.executor };
		if (options.jobs !== undefined) {
			(executorConfig as Record<string, unknown>).concurrency = options.jobs;
			logger.debug(`Concurrency overridden to ${options.jobs}`);
		}

		// Handle unsafe in-process flag
		if (options.unsafeInProcess) {
			(executorConfig as Record<string, unknown>).forceInProcess = true;
			logger.warn("Running in-process without worker thread isolation (SUT crashes can crash CLI)");
		}

		// Load SUTs
		logger.subheader("Loading SUTs...");
		const sutDefinitions = await Promise.all(
			config.suts.map(async (sutConfig) => {
				logger.debug(`Loading SUT: ${sutConfig.id} from ${sutConfig.module}`);

				// Build binary config if this is a binary SUT
				const binaryConfig =
					sutConfig.type === "binary" && sutConfig.binaryCommand
						? {
								type: "binary" as const,
								command: sutConfig.binaryCommand,
								args: sutConfig.binaryArgs,
								inputFormat: sutConfig.binaryInputFormat,
								outputFormat: sutConfig.binaryOutputFormat,
								timeout: sutConfig.binaryTimeout,
								successExitCode: undefined, // Could add to SutConfig if needed
							}
						: undefined;

				return moduleLoader.loadSutFactory(
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
					binaryConfig,
				);
			}),
		);
		logger.info(`Loaded ${sutDefinitions.length} SUTs`);

		// Load cases
		logger.subheader("Loading cases...");
		const caseDefinitions = await Promise.all(
			config.cases.map(async (caseConfig) => {
				logger.debug(`Loading case: ${caseConfig.id} from ${caseConfig.module}`);
				return moduleLoader.loadCaseDefinition(caseConfig.module, caseConfig.exportName, baseDir);
			}),
		);
		logger.info(`Loaded ${caseDefinitions.length} cases`);

		// Load metrics extractor
		logger.subheader("Loading metrics extractor...");
		const metricsExtractor = await moduleLoader.loadMetricsExtractor(
			config.metricsExtractor.module,
			config.metricsExtractor.exportName,
			baseDir,
		);
		logger.info(`Metrics extractor loaded from ${config.metricsExtractor.module}`);

		// Create executor
		const executor = createExecutor(executorConfig);

		// Plan runs
		logger.subheader("Planning execution...");
		const plannedRuns = executor.plan(sutDefinitions, caseDefinitions);
		logger.info(`Planned ${plannedRuns.length} runs`);

		// Dry run - just show plan and exit
		if (options.dryRun) {
			logger.info("");
			logger.subheader("Dry run - not executing");
			logger.info(`SUTs: ${sutDefinitions.map((s) => s.id).join(", ")}`);
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

		// Merge checkpoint shards from workers if not in unsafe in-process mode
		if (!options.unsafeInProcess) {
			await mergeCheckpointShards(baseDir, logger);
		}

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
		const resultsFilename = outputWriter.generateOutputFilename(config.experiment.name, "results");
		const resultsPath = `${outputPath}/${resultsFilename}`;
		await outputWriter.writeResults(summary.results, resultsPath, format);
		logger.info(`Results written to: ${resultsPath}`);

		// Aggregate if requested
		if (shouldAggregate && summary.results.length > 0) {
			logger.subheader("Aggregating results...");
			const aggregates = aggregator.aggregateResults(summary.results, {
				groupByCaseClass: true,
				computeComparisons: true,
			});
			const aggregationOutput = aggregator.createAggregationOutput(aggregates, summary.results);

			const aggregatesFilename = outputWriter.generateOutputFilename(
				config.experiment.name,
				"aggregates",
			);
			const aggregatesPath = `${outputPath}/${aggregatesFilename}`;
			await outputWriter.writeAggregates(aggregationOutput, aggregatesPath, format);
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
		processExit(1);
	}
}

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
		.option(
			"--unsafe-in-process",
			"Run in-process without worker thread isolation (SUT crashes can crash CLI)",
		)
		.action(async (configFile: string, options: CliOptions) => {
			const { createLogger } = await import("../logger.js");

			const logger = createLogger(options);

			await executeRun(configFile, options, {
				logger,
				configLoader: { loadAndValidateConfig },
				moduleLoader: { loadSutFactory, loadCaseDefinition, loadMetricsExtractor } as never,
				createExecutor: (config: unknown) =>
					new Executor(
						config as Partial<import("../../executor/executor.js").ExecutorConfig>,
					) as unknown as IExecutor,
				aggregator: { aggregateResults, createAggregationOutput },
				outputWriter: { generateOutputFilename, writeResults, writeAggregates },
				processExit: (code: number) => process.exit(code),
			});
		});
}
