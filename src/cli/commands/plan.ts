/**
 * Plan Command
 *
 * Shows execution plan without running experiments.
 */

import type { Command } from "commander";

import { Executor } from "../../executor/index.js";
import { loadAndValidateConfig } from "../config-loader.js";
import { createLogger } from "../logger.js";
import { loadCaseDefinition, loadSutFactory } from "../module-loader.js";

/**
 * Register the plan command.
 *
 * @param program - Commander program instance
 */
export function registerPlanCommand(program: Command): void {
	program
		.command("plan")
		.description("Show execution plan without running experiments")
		.argument("<config-file>", "Path to experiment configuration JSON file")
		.action(async (configFile: string) => {
			const logger = createLogger();

			try {
				logger.header("Execution Plan");

				const loaded = await loadAndValidateConfig(configFile);
				const { config, baseDir } = loaded;

				// Load SUTs
				logger.subheader("Loading SUTs...");
				const sutDefinitions = await Promise.all(
					config.suts.map((sutConfig) =>
						loadSutFactory(
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
						),
					),
				);

				// Load cases
				logger.subheader("Loading cases...");
				const caseDefinitions = await Promise.all(
					config.cases.map((caseConfig) =>
						loadCaseDefinition(caseConfig.module, caseConfig.exportName, baseDir),
					),
				);

				// Create executor and plan runs
				const executor = new Executor(config.executor);

				logger.subheader("Planning runs...");
				const plannedRuns = executor.plan(sutDefinitions, caseDefinitions);

				// Group and display plan
				logger.info("");
				logger.info(`Total planned runs: ${plannedRuns.length}`);
				logger.info("");

				// Group by SUT
				const bySut = new Map<string, typeof plannedRuns>();
				for (const run of plannedRuns) {
					const existing = bySut.get(run.sutId) ?? [];
					existing.push(run);
					bySut.set(run.sutId, existing);
				}

				for (const [sutId, runs] of bySut) {
					const sutDef = sutDefinitions.find((s) => s.registration.id === sutId);
					logger.subheader(`${sutDef?.registration.name ?? sutId} (${sutId})`);

					// Group by case class
					const byCaseClass = new Map<string, typeof runs>();
					for (const run of runs) {
						const caseDef = caseDefinitions.find((c) => c.case.caseId === run.caseId);
						const caseClass = caseDef?.case.caseClass ?? "uncategorized";
						const existing = byCaseClass.get(caseClass) ?? [];
						existing.push(run);
						byCaseClass.set(caseClass, existing);
					}

					for (const [caseClass, classRuns] of byCaseClass) {
						logger.info(`  ${caseClass}: ${classRuns.length} runs`);
					}
				}

				logger.info("");
				logger.info("Execution plan validated successfully!");
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
