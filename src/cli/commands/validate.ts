/**
 * Validate Command
 *
 * Validates experiment configuration files without running experiments.
 */

import type { Command } from "commander";

import { loadAndValidateConfig } from "../config-loader.js";
import type { IConfigLoader, ICommandLogger } from "../command-deps.js";

// Note: createLogger imported lazily in action handler to avoid circular dependency

/**
 * Execute validate command with injected dependencies.
 *
 * This function is exported for testing.
 *
 * @param configFile - Path to config file
 * @param dependencies - Injected dependencies
 */
export async function executeValidate(
	configFile: string,
	dependencies: {
		logger: ICommandLogger;
		configLoader: IConfigLoader;
		processExit: (code: number) => never;
	},
): Promise<void> {
	const { logger, configLoader, processExit } = dependencies;

	try {
		logger.header("Configuration Validation");

		const loaded = await configLoader.loadAndValidateConfig(configFile);

		logger.info(`Configuration file: ${loaded.configPath}`);
		logger.info(`Base directory: ${loaded.baseDir}`);
		logger.info(`Experiment: ${loaded.config.experiment.name}`);

		if (loaded.config.experiment.description) {
			logger.info(`Description: ${loaded.config.experiment.description}`);
		}

		if (loaded.config.experiment.version) {
			logger.info(`Version: ${loaded.config.experiment.version}`);
		}

		logger.subheader("SUTs");
		for (const sut of loaded.config.suts) {
			logger.info(`  - ${sut.id} (${sut.registration.name} v${sut.registration.version})`);
			logger.info(`    Module: ${sut.module} -> ${sut.exportName}`);
			logger.info(`    Role: ${sut.registration.role}`);
		}

		logger.subheader("Cases");
		for (const testCase of loaded.config.cases) {
			logger.info(`  - ${testCase.id}`);
			logger.info(`    Module: ${testCase.module} -> ${testCase.exportName}`);
		}

		logger.subheader("Executor");
		const executor = loaded.config.executor;
		logger.info(`  Repetitions: ${executor.repetitions ?? "default"}`);
		logger.info(`  Seed base: ${executor.seedBase ?? "default"}`);
		logger.info(`  Timeout: ${executor.timeoutMs ?? "default"}ms`);
		logger.info(`  Concurrency: ${executor.concurrency ?? "sequential"}`);
		logger.info(`  Continue on error: ${executor.continueOnError ?? "default"}`);
		logger.info(`  Collect provenance: ${executor.collectProvenance ?? "default"}`);

		logger.subheader("Output");
		const output = loaded.config.output;
		logger.info(`  Path: ${output.path ?? "./results"}`);
		logger.info(`  Format: ${output.format ?? "json-pretty"}`);
		logger.info(`  Aggregate: ${output.aggregate ?? "true"}`);

		logger.info("");
		logger.info("Configuration is valid!");
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
 * Register the validate command.
 *
 * @param program - Commander program instance
 */
export function registerValidateCommand(program: Command): void {
	program
		.command("validate")
		.description("Validate an experiment configuration file")
		.argument("<config-file>", "Path to experiment configuration JSON file")
		.action(async (configFile: string) => {
			// Import dependencies lazily to avoid circular imports
			const { createLogger } = await import("../logger.js");
			const logger = createLogger();

			await executeValidate(configFile, {
				logger,
				configLoader: { loadAndValidateConfig },
				processExit: (code: number) => process.exit(code),
			});
		});
}
