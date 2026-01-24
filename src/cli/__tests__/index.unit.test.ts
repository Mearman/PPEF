/**
 * Unit tests for CLI Index
 *
 * Tests CLI entry point functionality including:
 * - createCliProgram function
 * - command registration
 * - program configuration
 */

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { Command } from "commander";

import { createCliProgram } from "../index.js";

describe("CLI index", () => {
	describe("createCliProgram", () => {
		it("should create and configure commander program", () => {
			const program = createCliProgram();

			assert.ok(program instanceof Command);
			assert.strictEqual(program.name(), "ppef");
		});

		it("should register all commands", () => {
			const program = createCliProgram();

			const commandNames = program.commands.map((cmd: Command) => cmd.name());

			assert.ok(commandNames.includes("run"));

			assert.ok(commandNames.includes("validate"));

			assert.ok(commandNames.includes("plan"));

			assert.ok(commandNames.includes("aggregate"));
		});

		it("should have correct program description", () => {
			const program = createCliProgram();

			// The program should have a description

			assert.ok(program.description());
		});
	});

	describe("command options", () => {
		it("run command should have expected options", () => {
			const program = createCliProgram();

			const runCommand = program.commands.find((cmd: Command) => cmd.name() === "run");

			assert.ok(runCommand, "run command should be registered");
			const options = runCommand.options;

			// Check for expected options (Commander returns flags like --output, -f, etc.)

			const optionFlags = options.map((opt: unknown) => {
				const option = opt as { long?: string; short?: string };
				return option.long ?? option.short ?? "";
			});

			assert.ok(optionFlags.some((flag) => flag.includes("output")));

			assert.ok(optionFlags.some((flag) => flag.includes("format") || flag.includes("f")));
		});

		it("validate command should be registered", () => {
			const program = createCliProgram();

			const validateCommand = program.commands.find((cmd: Command) => cmd.name() === "validate");

			assert.ok(validateCommand, "validate command should be registered");
		});

		it("plan command should be registered", () => {
			const program = createCliProgram();

			const planCommand = program.commands.find((cmd: Command) => cmd.name() === "plan");

			assert.ok(planCommand, "plan command should be registered");
		});

		it("aggregate command should be registered", () => {
			const program = createCliProgram();

			const aggregateCommand = program.commands.find((cmd: Command) => cmd.name() === "aggregate");

			assert.ok(aggregateCommand, "aggregate command should be registered");
		});
	});
});
