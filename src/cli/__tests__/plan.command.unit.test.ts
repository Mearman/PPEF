/**
 * Unit tests for plan command
 *
 * Tests plan command functionality with injected dependencies.
 */

import { beforeEach, describe, it, mock } from "node:test";
import { strict as assert } from "node:assert";

import { executePlan } from "../commands/plan.js";
import type {
	ICaseDefinition,
	ICommandLogger,
	IConfigLoader,
	IModuleLoader,
	ISutFactory,
} from "../command-deps.js";

describe("plan command", () => {
	let mockLogger: ICommandLogger;
	let mockConfigLoader: IConfigLoader;
	let mockModuleLoader: IModuleLoader;
	let mockExecutor: {
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
						executor: {
							repetitions: 10,
							seedBase: 42,
							timeoutMs: 5000,
							concurrency: 4,
							continueOnError: true,
							collectProvenance: false,
						},
						metricsExtractor: {
							module: "./metrics.js",
							exportName: "extractMetrics",
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

		// Mock module loader
		mockModuleLoader = {
			loadSutFactory: async () => {
				return {
					id: "test-sut",
					config: {},
					run: async (input: unknown) => ({ result: "ok" }),
				};
			},
			loadCaseDefinition: async () => {
				return {
					case: {
						caseId: "test-case",
						name: "Test Case",
						caseClass: "test-class",
						inputs: {},
					},
					getInput: async () => ({}),
					getInputs: () => [],
				};
			},
			loadMetricsExtractor: async () => ({
				extract: (result: unknown, input: unknown) => ({}),
			}),
		};

		// Mock executor
		mockExecutor = {
			plan: mock.fn((suts: ISutFactory[], cases: ICaseDefinition[]) => {
				return [
					{ sutId: "test-sut", caseId: "test-case", repetition: 0, seed: 42 },
					{ sutId: "test-sut", caseId: "test-case", repetition: 1, seed: 43 },
				];
			}),
		};
	});

	describe("executePlan", () => {
		it("should log header", async () => {
			await executePlan("/test/config.json", {
				logger: mockLogger,
				configLoader: mockConfigLoader,
				moduleLoader: mockModuleLoader,
				executor: mockExecutor,
				processExit: mockProcessExit,
			});

			assert.ok(loggedMessages.includes("[header] Execution Plan"));
		});

		it("should log SUT loading", async () => {
			await executePlan("/test/config.json", {
				logger: mockLogger,
				configLoader: mockConfigLoader,
				moduleLoader: mockModuleLoader,
				executor: mockExecutor,
				processExit: mockProcessExit,
			});

			assert.ok(loggedMessages.includes("[subheader] Loading SUTs..."));
		});

		it("should log case loading", async () => {
			await executePlan("/test/config.json", {
				logger: mockLogger,
				configLoader: mockConfigLoader,
				moduleLoader: mockModuleLoader,
				executor: mockExecutor,
				processExit: mockProcessExit,
			});

			assert.ok(loggedMessages.includes("[subheader] Loading cases..."));
		});

		it("should log planning runs", async () => {
			await executePlan("/test/config.json", {
				logger: mockLogger,
				configLoader: mockConfigLoader,
				moduleLoader: mockModuleLoader,
				executor: mockExecutor,
				processExit: mockProcessExit,
			});

			assert.ok(loggedMessages.includes("[subheader] Planning runs..."));
		});

		it("should log total planned runs", async () => {
			await executePlan("/test/config.json", {
				logger: mockLogger,
				configLoader: mockConfigLoader,
				moduleLoader: mockModuleLoader,
				executor: mockExecutor,
				processExit: mockProcessExit,
			});

			assert.ok(loggedMessages.some((msg) => msg.includes("Total planned runs: 2")));
		});

		it("should log runs grouped by SUT and case class", async () => {
			await executePlan("/test/config.json", {
				logger: mockLogger,
				configLoader: mockConfigLoader,
				moduleLoader: mockModuleLoader,
				executor: mockExecutor,
				processExit: mockProcessExit,
			});

			assert.ok(loggedMessages.some((msg) => msg.includes("[subheader] test-sut")));
			assert.ok(loggedMessages.some((msg) => msg.includes("test-class: 2 runs")));
		});

		it("should use uncategorized for case without caseClass", async () => {
			// Mock case without caseClass
			mockModuleLoader.loadCaseDefinition = async () => {
				return {
					case: {
						caseId: "test-case",
						name: "Test Case",
						inputs: {},
					},
					getInput: async () => ({}),
					getInputs: () => [],
				};
			};

			await executePlan("/test/config.json", {
				logger: mockLogger,
				configLoader: mockConfigLoader,
				moduleLoader: mockModuleLoader,
				executor: mockExecutor,
				processExit: mockProcessExit,
			});

			assert.ok(loggedMessages.some((msg) => msg.includes("uncategorized: 2 runs")));
		});

		it("should log success message", async () => {
			await executePlan("/test/config.json", {
				logger: mockLogger,
				configLoader: mockConfigLoader,
				moduleLoader: mockModuleLoader,
				executor: mockExecutor,
				processExit: mockProcessExit,
			});

			assert.ok(
				loggedMessages.some((msg) => msg.includes("Execution plan validated successfully!")),
			);
			assert.strictEqual(exitCode, null); // No exit on success
		});

		it("should call process.exit on error", async () => {
			mockConfigLoader.loadAndValidateConfig = async () => {
				throw new Error("Config validation failed");
			};

			try {
				await executePlan("/test/config.json", {
					logger: mockLogger,
					configLoader: mockConfigLoader,
					moduleLoader: mockModuleLoader,
					executor: mockExecutor,
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
				await executePlan("/test/config.json", {
					logger: mockLogger,
					configLoader: mockConfigLoader,
					moduleLoader: mockModuleLoader,
					executor: mockExecutor,
					processExit: mockProcessExit,
				});
			} catch {
				// Expected to throw
			}

			assert.ok(loggedMessages.some((msg) => msg.includes("[error] String error")));
			assert.strictEqual(exitCode, 1);
		});

		it("should call executor plan with loaded SUTs and cases", async () => {
			const planCalls: { suts: ISutFactory[]; cases: ICaseDefinition[] }[] = [];
			mockExecutor.plan = mock.fn((suts: ISutFactory[], cases: ICaseDefinition[]) => {
				planCalls.push({ suts, cases });
				return [{ sutId: "test-sut", caseId: "test-case", repetition: 0, seed: 42 }];
			});

			await executePlan("/test/config.json", {
				logger: mockLogger,
				configLoader: mockConfigLoader,
				moduleLoader: mockModuleLoader,
				executor: mockExecutor,
				processExit: mockProcessExit,
			});

			assert.strictEqual(planCalls.length, 1);
			assert.strictEqual(planCalls[0].suts.length, 1);
			assert.strictEqual(planCalls[0].cases.length, 1);
		});
	});
});
