/**
 * PPEF CLI
 *
 * Command-line interface for the Portable Programmatic Evaluation Framework.
 */

import { Command } from "commander";

import { registerAggregateCommand } from "./commands/aggregate.js";
import { registerEvaluateCommand } from "./commands/evaluate.js";
import { registerPlanCommand } from "./commands/plan.js";
import { registerRunCommand } from "./commands/run.js";
import { registerValidateCommand } from "./commands/validate.js";

/**
 * Create and configure the CLI program.
 *
 * This function is exported for testing purposes.
 *
 * @returns Configured Commander program
 */
export function createCliProgram(): Command {
	const program = new Command();

	program
		.name("ppef")
		.description("Portable Programmatic Evaluation Framework - CLI for experiment execution")
		.version("1.0.1")
		.argument(
			"[config-file]",
			"Path to experiment configuration JSON file (shorthand for 'ppef run')",
		)
		.action(async (configFile?: string) => {
			if (!configFile) {
				program.help();
				return;
			}

			// Delegate to the run command logic
			const { executeRunFromConfigFile } = await import("./commands/run.js");
			await executeRunFromConfigFile(configFile, {});
		});

	// Register commands
	registerRunCommand(program);
	registerValidateCommand(program);
	registerPlanCommand(program);
	registerAggregateCommand(program);
	registerEvaluateCommand(program);

	return program;
}

/**
 * Run the CLI and return exit code.
 *
 * @returns Exit code (0 for success, 1 for error)
 */
export async function runCli(): Promise<number> {
	const program = createCliProgram();

	try {
		await program.parseAsync(process.argv);
		return 0;
	} catch {
		return 1;
	}
}

/**
 * Run CLI when executed directly (for development/testing).
 */
if (import.meta.url === `file://${process.argv[1]}`) {
	runCli().then(
		(code) => {
			process.exit(code);
		},
		(error) => {
			console.error("Fatal error:", error);
			process.exit(1);
		},
	);
}

export {
	registerAggregateCommand,
	registerEvaluateCommand,
	registerPlanCommand,
	registerRunCommand,
	registerValidateCommand,
};
