/**
 * Aggregate Command
 *
 * Aggregates existing results from a JSON file.
 */

import { readFile } from "node:fs/promises";

import type { Command } from "commander";

import { aggregateResults, createAggregationOutput } from "../../aggregation/index.js";
import type { EvaluationResult } from "../../types/result.js";
import { createLogger } from "../logger.js";
import { writeAggregates } from "../output-writer.js";

/**
 * Register the aggregate command.
 *
 * @param program - Commander program instance
 */
export function registerAggregateCommand(program: Command): void {
	program
		.command("aggregate")
		.description("Aggregate existing results from a JSON file")
		.argument("<results-file>", "Path to results JSON file")
		.option("-o, --output <path>", "Output file path")
		.option("-f, --format <format>", "Output format (json or json-pretty)", "json-pretty")
		.option("--group-by-case-class", "Group results by case class", true)
		.option("--compute-comparisons", "Compute comparisons with baselines", true)
		.action(async (resultsFile: string, options: Record<string, unknown>) => {
			const logger = createLogger();

			try {
				logger.header("Aggregating Results");

				// Read results file
				logger.info(`Reading results from: ${resultsFile}`);
				const content = await readFile(resultsFile, "utf-8");
				const data = JSON.parse(content) as { results?: unknown[] };

				if (!data.results || !Array.isArray(data.results)) {
					throw new Error("Invalid results file: missing or invalid 'results' array");
				}

				logger.info(`Found ${data.results.length} results`);

				// Aggregate
				logger.subheader("Computing aggregations...");
				const results = data.results as EvaluationResult[];
				const aggregates = aggregateResults(results, {
					groupByCaseClass: options.groupByCaseClass as boolean,
					computeComparisons: options.computeComparisons as boolean,
				});
				const aggregationOutput = createAggregationOutput(aggregates, results);

				// Determine output path
				const outputPath =
					(options.output as string | undefined) ??
					resultsFile.replace("-results-", "-aggregates-");
				const format = (options.format as "json" | "json-pretty" | undefined) ?? "json-pretty";

				// Write aggregates
				logger.subheader("Writing aggregates...");
				await writeAggregates(aggregationOutput, outputPath, format);
				logger.info(`Aggregates written to: ${outputPath}`);

				// Display summary
				logger.info("");
				logger.subheader("Aggregation Summary");
				for (const agg of aggregates) {
					const caseClassSuffix = agg.caseClass ? ` (${agg.caseClass})` : "";
					logger.info(`${agg.sut}${caseClassSuffix}:`);
					logger.info(`  Runs: ${agg.group.runCount}`);
					logger.info(`  Cases: ${agg.group.caseCount}`);

					if (Object.keys(agg.metrics).length > 0) {
						logger.info(`  Metrics:`);
						for (const [metric, stats] of Object.entries(agg.metrics)) {
							const std = stats.std ?? 0;
							logger.info(
								`    ${metric}: mean=${stats.mean.toFixed(2)}, ` +
									`median=${stats.median.toFixed(2)}, ` +
									`std=${std.toFixed(2)}`,
							);
						}
					}

					if (agg.comparisons && Object.keys(agg.comparisons).length > 0) {
						logger.info(`  Comparisons:`);
						for (const [baseline, comparison] of Object.entries(agg.comparisons)) {
							logger.info(`    vs ${baseline}:`);
							if (comparison.pValue !== undefined) {
								logger.info(`      p-value: ${comparison.pValue.toFixed(4)}`);
							}
							if (comparison.effectSize !== undefined) {
								logger.info(`      effect size: ${comparison.effectSize.toFixed(4)}`);
							}
						}
					}
				}

				logger.info("");
				logger.info("Aggregation completed successfully!");
			} catch (error) {
				if (error instanceof Error) {
					logger.error(error.message);
				} else {
					logger.error(String(error));
				}
				process.exit(1);
			}
		});
}
