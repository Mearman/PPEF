#!/usr/bin/env node
/**
 * PPEF CLI Entry Point
 *
 * This shim loads the CLI module and executes the command.
 * Using .mjs extension ensures ESM compatibility.
 */

import { runCli } from "../dist/cli/index.js";

// Run the CLI and exit with appropriate code
runCli().then(
	(code) => {
		process.exit(code);
	},
	(error) => {
		console.error("Fatal error:", error);
		process.exit(1);
	},
);
