/**
 * Unit tests for CLI Logger
 *
 * Tests logger functionality including:
 * - Header and subheader output
 * - Info, error, and warning messages
 * - Progress reporter integration
 * - Verbosity control
 */

import { describe, it, mock } from "node:test";
import { strict as assert } from "node:assert";

import { CliLogger, createLogger } from "../logger.js";

describe("CliLogger", () => {
	describe("constructor", () => {
		it("should create logger with default options", () => {
			const logger = new CliLogger({});
			assert.ok(logger instanceof CliLogger);
		});

		it("should create logger with verbose enabled", () => {
			const logger = new CliLogger({ verbose: true });
			assert.ok(logger instanceof CliLogger);
		});

		it("should create logger with quiet mode", () => {
			const logger = new CliLogger({ quiet: true });
			assert.ok(logger instanceof CliLogger);
		});
	});

	describe("header", () => {
		it("should print header with default styling", () => {
			const logger = new CliLogger({});
			const consoleSpy = mock.method(console, "log");

			logger.header("Test Header");

			assert.strictEqual(consoleSpy.mock.calls.length, 2);
			assert.strictEqual(consoleSpy.mock.calls[0].arguments[0], "");
			assert.strictEqual(consoleSpy.mock.calls[1].arguments[0], "=== Test Header ===");

			consoleSpy.mock.restore();
		});

		it("should suppress header in quiet mode", () => {
			const logger = new CliLogger({ quiet: true });
			const consoleSpy = mock.method(console, "log");

			logger.header("Test Header");

			assert.strictEqual(consoleSpy.mock.calls.length, 0);

			consoleSpy.mock.restore();
		});
	});

	describe("subheader", () => {
		it("should print subheader with styling", () => {
			const logger = new CliLogger({});
			const consoleSpy = mock.method(console, "log");

			logger.subheader("Test Subheader");

			assert.strictEqual(consoleSpy.mock.calls.length, 1);
			assert.strictEqual(consoleSpy.mock.calls[0].arguments[0], "--- Test Subheader");

			consoleSpy.mock.restore();
		});

		it("should suppress subheader in quiet mode", () => {
			const logger = new CliLogger({ quiet: true });
			const consoleSpy = mock.method(console, "log");

			logger.subheader("Test Subheader");

			assert.strictEqual(consoleSpy.mock.calls.length, 0);

			consoleSpy.mock.restore();
		});
	});

	describe("info", () => {
		it("should print info message", () => {
			const logger = new CliLogger({});
			const consoleSpy = mock.method(console, "log");

			logger.info("Test info");

			assert.strictEqual(consoleSpy.mock.calls.length, 1);
			assert.strictEqual(consoleSpy.mock.calls[0].arguments[0], "Test info");

			consoleSpy.mock.restore();
		});

		it("should suppress info in quiet mode", () => {
			const logger = new CliLogger({ quiet: true });
			const consoleSpy = mock.method(console, "log");

			logger.info("Test info");

			assert.strictEqual(consoleSpy.mock.calls.length, 0);

			consoleSpy.mock.restore();
		});
	});

	describe("debug", () => {
		it("should not print debug messages when verbose is false", () => {
			const logger = new CliLogger({ verbose: false });
			const consoleSpy = mock.method(console, "log");

			logger.debug("Debug message");

			assert.strictEqual(consoleSpy.mock.calls.length, 0);

			consoleSpy.mock.restore();
		});

		it("should print debug messages when verbose is true", () => {
			const logger = new CliLogger({ verbose: true });
			const consoleSpy = mock.method(console, "log");

			logger.debug("Debug message");

			assert.strictEqual(consoleSpy.mock.calls.length, 1);
			assert.strictEqual(consoleSpy.mock.calls[0].arguments[0], "[DEBUG] Debug message");

			consoleSpy.mock.restore();
		});
	});

	describe("error", () => {
		it("should print error message", () => {
			const logger = new CliLogger({});
			const consoleSpy = mock.method(console, "log");

			logger.error("Test error");

			assert.strictEqual(consoleSpy.mock.calls.length, 1);
			assert.strictEqual(consoleSpy.mock.calls[0].arguments[0], "Error: Test error");

			consoleSpy.mock.restore();
		});

		it("should suppress errors in quiet mode", () => {
			const logger = new CliLogger({ quiet: true });
			const consoleSpy = mock.method(console, "log");

			logger.error("Test error");

			assert.strictEqual(consoleSpy.mock.calls.length, 0);

			consoleSpy.mock.restore();
		});
	});

	describe("warn", () => {
		it("should print warning message", () => {
			const logger = new CliLogger({});
			const consoleSpy = mock.method(console, "log");

			logger.warn("Test warning");

			assert.strictEqual(consoleSpy.mock.calls.length, 1);
			assert.strictEqual(consoleSpy.mock.calls[0].arguments[0], "Warning: Test warning");

			consoleSpy.mock.restore();
		});
	});

	describe("progress", () => {
		it("should handle progress updates", () => {
			const logger = new CliLogger({});
			logger.setProgress(true);

			// Just ensure it doesn't throw
			logger.progress({
				completed: 5,
				total: 10,
				failed: 0,
				currentSut: "test-sut",
				currentCase: "test-case",
				currentRepetition: 0,
				elapsedMs: 1000,
			});
		});

		it("should not show progress when disabled", () => {
			const logger = new CliLogger({});
			logger.setProgress(false);

			const writeSpy = mock.method(process.stdout, "write");

			logger.progress({
				completed: 5,
				total: 10,
				failed: 0,
				elapsedMs: 1000,
			});

			// Should not call write when progress is disabled
			const calls = writeSpy.mock.calls;
			assert.strictEqual(
				// @ts-expect-error - mock type
				calls.length,
				0,
			);

			writeSpy.mock.restore();
		});
	});

	describe("createProgressReporter", () => {
		it("should create progress reporter function", () => {
			const logger = new CliLogger({});
			const reporter = logger.createProgressReporter();

			assert.strictEqual(typeof reporter, "function");

			// Ensure it doesn't throw
			reporter({
				completed: 1,
				total: 10,
				failed: 0,
				elapsedMs: 100,
			});
		});
	});
});

describe("createLogger", () => {
	it("should create default logger", () => {
		const logger = createLogger();
		assert.ok(logger instanceof CliLogger);
	});

	it("should create logger with options", () => {
		const logger = createLogger({ verbose: true });
		assert.ok(logger instanceof CliLogger);
	});
});
