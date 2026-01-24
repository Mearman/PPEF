/**
 * Unit tests for CLI Index
 *
 * Tests CLI entry point functionality including:
 * - runCli function
 * - command registration
 * - program configuration
 */

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { Command } from "commander";

import { runCli } from "../index.js";

describe("CLI index", () => {
	describe("runCli", () => {
		it("should create and configure commander program", () => {
			const program = runCli();

			assert.ok(program instanceof Command);
			assert.strictEqual(program.name(), "ppef");
		});

		it("should register all commands", () => {
			const program = runCli();
			// eslint-disable-next-line @typescript-eslint/no-unsafe-call
			const commandNames = program.commands.map((cmd: Command) => cmd.name());

			// eslint-disable-next-line @typescript-eslint/no-unsafe-call
			assert.ok(commandNames.includes("run"));
			// eslint-disable-next-line @typescript-eslint/no-unsafe-call
			assert.ok(commandNames.includes("validate"));
			// eslint-disable-next-line @typescript-eslint/no-unsafe-call
			assert.ok(commandNames.includes("plan"));
			// eslint-disable-next-line @typescript-eslint/no-unsafe-call
			assert.ok(commandNames.includes("aggregate"));
		});

		it("should have correct program description", () => {
			const program = runCli();

			// The program should have a description
			// eslint-disable-next-line @typescript-eslint/no-unsafe-call
			assert.ok(program.description());
		});
	});

	describe("command options", () => {
		it("run command should have expected options", () => {
			const program = runCli();
			// eslint-disable-next-line @typescript-eslint/no-unsafe-call
			const runCommand = program.commands.find((cmd: Command) => cmd.name() === "run");

			assert.ok(runCommand, "run command should be registered");
			const options = runCommand.options;

			// Check for expected options
			// eslint-disable-next-line @typescript-eslint/no-unsafe-call
			const optionFlags = options.map((opt: unknown) => {
				const option = opt as { long?: string; short?: string };
				return option.long ?? option.short ?? "";
			});
			// eslint-disable-next-line @typescript-eslint/no-unsafe-call
			assert.ok(optionFlags.includes("output"));
			// eslint-disable-next-line @typescript-eslint/no-unsafe-call
			assert.ok(optionFlags.includes("format") ?? optionFlags.includes("f"));
		});

		it("validate command should be registered", () => {
			const program = runCli();
			// eslint-disable-next-line @typescript-eslint/no-unsafe-call
			const validateCommand = program.commands.find((cmd: Command) => cmd.name() === "validate");

			assert.ok(validateCommand, "validate command should be registered");
		});

		it("plan command should be registered", () => {
			const program = runCli();
			// eslint-disable-next-line @typescript-eslint/no-unsafe-call
			const planCommand = program.commands.find((cmd: Command) => cmd.name() === "plan");

			assert.ok(planCommand, "plan command should be registered");
		});

		it("aggregate command should be registered", () => {
			const program = runCli();
			// eslint-disable-next-line @typescript-eslint/no-unsafe-call
			const aggregateCommand = program.commands.find((cmd: Command) => cmd.name() === "aggregate");

			assert.ok(aggregateCommand, "aggregate command should be registered");
		});
	});
});
