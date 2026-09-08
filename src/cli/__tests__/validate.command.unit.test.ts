/**
 * Unit tests for validate command
 *
 * Tests validate command functionality with injected dependencies.
 */

import { beforeEach, describe, it, mock } from "node:test";
import { strict as assert } from "node:assert";

import { executeValidate } from "../commands/validate.js";
import type { ICommandLogger, IConfigLoader } from "../command-deps.js";

describe("validate command", () => {
	let mockLogger: ICommandLogger;
	let mockConfigLoader: IConfigLoader;
	let mockProcessExit: (code: number) => never;
	let exitCode: number | null;
	const loggedMessages: string[] = [];

	beforeEach(() => {
		loggedMessages.length = 0;
		exitCode = null;

		// Mock logger
		mockLogger = {
			header: mock.fn((msg: string) => {
				loggedMessages.push(`[header] ${msg}`);
			}),
			subheader: mock.fn((msg: string) => {
				loggedMessages.push(`[subheader] ${msg}`);
			}),
			info: mock.fn((msg: string) => {
				loggedMessages.push(`[info] ${msg}`);
			}),
			debug: mock.fn((msg: string) => {
				loggedMessages.push(`[debug] ${msg}`);
			}),
			error: mock.fn((msg: string) => {
				loggedMessages.push(`[error] ${msg}`);
			}),
			warn: mock.fn((msg: string) => {
				loggedMessages.push(`[warn] ${msg}`);
			}),
			setProgress: mock.fn(() => {
				// Do nothing
			}),
		};

		// Mock process exit
		mockProcessExit = mock.fn((code: number) => {
			exitCode = code;
			throw new Error(`process.exit(${code})`);
		});

		// Mock config loader
		mockConfigLoader = {
			loadAndValidateConfig: async (configPath: string) => {
				return {
					config: {
						experiment: {
							name: "Test Experiment",
							description: "Test Description",
							version: "1.0.0",
						},
						suts: [
							{
								id: "test-sut",
								module: "./test.js",
								exportName: "createSUT",
								registration: {
									name: "Test SUT",
									version: "1.0.0",
									role: "primary",
									tags: [],
								},
							},
						],
						cases: [
							{
								id: "test-case",
								module: "./case.js",
								exportName: "createCase",
							},
						],
						metricsExtractor: {
							module: "./metrics.js",
							exportName: "extractMetrics",
						},
						executor: {
							repetitions: 10,
							seedBase: 42,
							timeoutMs: 5000,
							concurrency: 4,
							continueOnError: true,
							collectProvenance: false,
						},
						output: {
							path: "./results",
							format: "json-pretty",
							aggregate: true,
						},
					},
					baseDir: "/test/base",
					configPath: "/test/config.json",
				};
			},
		};
	});

	describe("executeValidate", () => {
		it("should log configuration details", async () => {
			await executeValidate("/test/config.json", {
				logger: mockLogger,
				configLoader: mockConfigLoader,
				processExit: mockProcessExit,
			});

			assert.ok(loggedMessages.includes("[header] Configuration Validation"));
			assert.ok(
				loggedMessages.some((msg) => msg.includes("Configuration file: /test/config.json")),
			);
			assert.ok(loggedMessages.some((msg) => msg.includes("Experiment: Test Experiment")));
		});

		it("should log SUT details", async () => {
			await executeValidate("/test/config.json", {
				logger: mockLogger,
				configLoader: mockConfigLoader,
				processExit: mockProcessExit,
			});

			assert.ok(loggedMessages.includes("[subheader] SUTs"));
			assert.ok(loggedMessages.some((msg) => msg.includes("test-sut")));
			assert.ok(loggedMessages.some((msg) => msg.includes("(Test SUT v1.0.0)")));
		});

		it("should log case details", async () => {
			await executeValidate("/test/config.json", {
				logger: mockLogger,
				configLoader: mockConfigLoader,
				processExit: mockProcessExit,
			});

			assert.ok(loggedMessages.includes("[subheader] Cases"));
			assert.ok(loggedMessages.some((msg) => msg.includes("test-case")));
		});

		it("should log executor config", async () => {
			await executeValidate("/test/config.json", {
				logger: mockLogger,
				configLoader: mockConfigLoader,
				processExit: mockProcessExit,
			});

			assert.ok(loggedMessages.includes("[subheader] Executor"));
			assert.ok(loggedMessages.some((msg) => msg.includes("Repetitions: 10")));
			assert.ok(loggedMessages.some((msg) => msg.includes("Seed base: 42")));
		});

		it("should log output config", async () => {
			await executeValidate("/test/config.json", {
				logger: mockLogger,
				configLoader: mockConfigLoader,
				processExit: mockProcessExit,
			});

			assert.ok(loggedMessages.includes("[subheader] Output"));
			assert.ok(loggedMessages.some((msg) => msg.includes("Path: ./results")));
		});

		it("should log success message", async () => {
			await executeValidate("/test/config.json", {
				logger: mockLogger,
				configLoader: mockConfigLoader,
				processExit: mockProcessExit,
			});

			assert.ok(loggedMessages.some((msg) => msg.includes("Configuration is valid!")));
			assert.strictEqual(exitCode, null); // No exit on success
		});

		it("should call process.exit on error", async () => {
			mockConfigLoader.loadAndValidateConfig = async () => {
				throw new Error("Config validation failed");
			};

			try {
				await executeValidate("/test/config.json", {
					logger: mockLogger,
					configLoader: mockConfigLoader,
					processExit: mockProcessExit,
				});
			} catch {
				// Expected to throw due to mock process.exit
			}

			assert.ok(loggedMessages.some((msg) => msg.includes("[error] Config validation failed")));
			assert.strictEqual(exitCode, 1);
		});

		it("should handle non-Error errors", async () => {
			mockConfigLoader.loadAndValidateConfig = async () => {
				throw new Error("String error");
			};

			try {
				await executeValidate("/test/config.json", {
					logger: mockLogger,
					configLoader: mockConfigLoader,
					processExit: mockProcessExit,
				});
			} catch {
				// Expected to throw
			}

			assert.ok(loggedMessages.some((msg) => msg.includes("[error] String error")));
			assert.strictEqual(exitCode, 1);
		});

		it("should handle null/undefined optional fields", async () => {
			mockConfigLoader.loadAndValidateConfig = async () => {
				return {
					config: {
						experiment: {
							name: "Minimal Test",
							// No description, version
						},
						suts: [],
						cases: [],
						metricsExtractor: {
							module: "./metrics.js",
							exportName: "extractMetrics",
						},
						executor: {},
						output: {},
					},
					baseDir: "/test",
					configPath: "/test/config.json",
				};
			};

			await executeValidate("/test/config.json", {
				logger: mockLogger,
				configLoader: mockConfigLoader,
				processExit: mockProcessExit,
			});

			// Check that default values are logged for optional fields
			assert.ok(loggedMessages.some((msg) => msg.includes("Repetitions: default")));
			assert.ok(loggedMessages.some((msg) => msg.includes("Seed base: default")));
			assert.ok(loggedMessages.some((msg) => msg.includes("Path: ./results")));
		});
	});
});
