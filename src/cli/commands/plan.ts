/**
 * Plan Command
 *
 * Shows execution plan without running experiments.
 */

import type { Command } from "commander";

import { Executor } from "../../executor/index.js";
import type {
	ICaseDefinition,
	ICommandLogger,
	IConfigLoader,
	IModuleLoader,
	ISutFactory,
} from "../command-deps.js";
import { loadAndValidateConfig } from "../config-loader.js";
import { loadCaseDefinition, loadSutFactory } from "../module-loader.js";

// Note: createLogger is imported in the action handler to avoid circular dependency with logger.ts

/**
 * Execute plan command with injected dependencies.
 *
 * This function is exported for testing.
 *
 * @param configFile - Path to config file
 * @param dependencies - Injected dependencies
 */
export async function executePlan(
	configFile: string,
	dependencies: {
		logger: ICommandLogger;
		configLoader: IConfigLoader;
		moduleLoader: IModuleLoader;
		executor: {
			plan: (
				suts: ISutFactory[],
				cases: ICaseDefinition[],
			) => {
				sutId: string;
				caseId: string;
				repetition: number;
				seed: number;
			}[];
		};
		processExit: (code: number) => never;
	},
): Promise<void> {
	const { logger, configLoader, moduleLoader, executor, processExit } = dependencies;

	try {
		logger.header("Execution Plan");

		const loaded = await configLoader.loadAndValidateConfig(configFile);
		const { config, baseDir } = loaded;

		// Load SUTs
		logger.subheader("Loading SUTs...");
		const sutDefinitions = await Promise.all(
			config.suts.map((sutConfig) =>
				moduleLoader.loadSutFactory(
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
				moduleLoader.loadCaseDefinition(caseConfig.module, caseConfig.exportName, baseDir),
			),
		);

		// Plan runs
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
			const sutDef = sutDefinitions.find((s) => s.id === sutId);
			logger.subheader(sutDef?.id ?? sutId);

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

		// Show schema validation status
		const hasInputSchema = !!config.schemas?.input;
		const hasOutputSchema = !!config.schemas?.output;
		const sutOverrides = config.suts.filter((s) => s.outputSchema).length;
		const caseOverrides = config.cases.filter((c) => c.inputSchema).length;

		if (hasInputSchema || hasOutputSchema || sutOverrides > 0 || caseOverrides > 0) {
			logger.subheader("Schema Validation");
			const parts: string[] = [];
			if (hasInputSchema) {
				const props = config.schemas?.input?.properties;
				const propCount =
					typeof props === "object" && props !== null ? Object.keys(props).length : 0;
				parts.push(`input (${propCount} properties)`);
			}
			if (hasOutputSchema) {
				const props = config.schemas?.output?.properties;
				const propCount =
					typeof props === "object" && props !== null ? Object.keys(props).length : 0;
				parts.push(`output (${propCount} properties)`);
			}
			if (parts.length > 0) {
				logger.info(`  Experiment-level: ${parts.join(", ")}`);
			}
			if (sutOverrides > 0) {
				logger.info(`  Per-SUT output overrides: ${sutOverrides}`);
			}
			if (caseOverrides > 0) {
				logger.info(`  Per-case input overrides: ${caseOverrides}`);
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
		processExit(1);
	}
}

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
			const { createLogger } = await import("../logger.js");
			const { loadMetricsExtractor } = await import("../module-loader.js");

			const logger = createLogger();
			const executor = new Executor({});

			await executePlan(configFile, {
				logger,
				configLoader: { loadAndValidateConfig },
				moduleLoader: {
					loadSutFactory,
					loadCaseDefinition,
					loadMetricsExtractor,
				} as never,
				executor: executor as never,
				processExit: (code: number) => process.exit(code),
			});
		});
}
