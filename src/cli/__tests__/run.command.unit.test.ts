/**
 * Unit tests for run command
 *
 * Tests run command functionality with injected dependencies.
 */

import { beforeEach, describe, it, mock } from "node:test";
import { strict as assert } from "node:assert";

import { executeRun } from "../commands/run.js";
import type { AggregationOutput } from "../../types/aggregate.js";
import type { EvaluationResult } from "../../types/result.js";
import type {
	IAggregator,
	ICommandLogger,
	IConfigLoader,
	IExecutor,
	IModuleLoader,
	IOutputWriter,
	ISutFactory,
} from "../command-deps.js";
import type { CaseDefinition } from "../../types/case.js";
import type { CliOptions } from "../types.js";

describe("run command", () => {
	let mockLogger: ICommandLogger;
	let mockConfigLoader: IConfigLoader;
	let mockModuleLoader: IModuleLoader;
	let mockExecutor: IExecutor;
	let mockAggregator: IAggregator;
	let mockOutputWriter: IOutputWriter;
	let mockProcessExit: (code: number) => never;
	let exitCode: number | null;
	const loggedMessages: string[] = [];

	const mockSutFactory: ISutFactory = {
		id: "test-sut",
		config: {},
		run: async (input: unknown) => ({ result: "ok" }),
	};

	const mockCaseDefinition: CaseDefinition = {
		case: {
			caseId: "test-case",
			name: "Test Case",
			inputs: {},
		},
		getInput: async () => ({}),
		getInputs: () => ({}),
	};

	const mockResults: EvaluationResult[] = [
		{
			runId: "test-1",
			sutId: "sut-1",
			caseId: "case-1",
			seed: 42,
			repetition: 0,
			timestamp: "2024-01-01T00:00:00Z",
			durationMs: 100,
			memoryBytes: 1024,
			status: "success",
			result: {},
		},
	];

	const mockAggregationOutput: AggregationOutput = {
		version: "1.0.0",
		timestamp: "2024-01-01T00:00:00Z",
		aggregates: [],
		metadata: { totalRuns: 1, totalCases: 1, sutsIncluded: ["sut-1"] },
	};

	const mockPlannedRuns = [{ sutId: "test-sut", caseId: "test-case", repetition: 0, seed: 42 }];

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
		}) as unknown as (code: number) => never;

		// Mock config loader
		mockConfigLoader = {
			loadAndValidateConfig: async () => {
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
			loadSutFactory: async () => mockSutFactory,
			loadCaseDefinition: async () => mockCaseDefinition,
			loadMetricsExtractor: async () => (result: unknown) => ({ accuracy: 0.9 }),
		};

		// Mock executor
		mockExecutor = {
			plan: mock.fn(() => mockPlannedRuns),
			execute: mock.fn(async () => ({
				results: mockResults,
				errors: [],
				totalRuns: 1,
				successfulRuns: 1,
				failedRuns: 0,
			})),
		};

		// Mock aggregator
		mockAggregator = {
			aggregateResults: mock.fn(() => []),
			createAggregationOutput: mock.fn(() => mockAggregationOutput),
		};

		// Mock output writer
		mockOutputWriter = {
			generateOutputFilename: mock.fn((name: string, type: "results" | "aggregates") => {
				return `experiment-${type}.json`;
			}),
			writeResults: mock.fn(async () => {
				// Do nothing
			}),
			writeAggregates: mock.fn(async () => {
				// Do nothing
			}),
		};
	});

	describe("executeRun", () => {
		const defaultOptions: CliOptions = {
			output: undefined,
			format: "json-pretty",
			noAggregate: false,
			jobs: undefined,
			verbose: false,
			quiet: false,
			dryRun: false,
		};

		it("should log execution header", async () => {
			await executeRun("/test/config.json", defaultOptions, {
				logger: mockLogger,
				configLoader: mockConfigLoader,
				moduleLoader: mockModuleLoader,
				createExecutor: () => mockExecutor,
				aggregator: mockAggregator,
				outputWriter: mockOutputWriter,
				processExit: mockProcessExit,
			});

			assert.ok(loggedMessages.includes("[header] Experiment: Execution"));
		});

		it("should log dry run header when dryRun is true", async () => {
			await executeRun(
				"/test/config.json",
				{ ...defaultOptions, dryRun: true },
				{
					logger: mockLogger,
					configLoader: mockConfigLoader,
					moduleLoader: mockModuleLoader,
					createExecutor: () => mockExecutor,
					aggregator: mockAggregator,
					outputWriter: mockOutputWriter,
					processExit: mockProcessExit,
				},
			);

			assert.ok(loggedMessages.includes("[header] Experiment: Dry Run"));
		});

		it("should load and log SUTs", async () => {
			await executeRun("/test/config.json", defaultOptions, {
				logger: mockLogger,
				configLoader: mockConfigLoader,
				moduleLoader: mockModuleLoader,
				createExecutor: () => mockExecutor,
				aggregator: mockAggregator,
				outputWriter: mockOutputWriter,
				processExit: mockProcessExit,
			});

			assert.ok(loggedMessages.includes("[subheader] Loading SUTs..."));
			assert.ok(loggedMessages.some((msg) => msg.includes("Loaded 1 SUTs")));
		});

		it("should load and log cases", async () => {
			await executeRun("/test/config.json", defaultOptions, {
				logger: mockLogger,
				configLoader: mockConfigLoader,
				moduleLoader: mockModuleLoader,
				createExecutor: () => mockExecutor,
				aggregator: mockAggregator,
				outputWriter: mockOutputWriter,
				processExit: mockProcessExit,
			});

			assert.ok(loggedMessages.includes("[subheader] Loading cases..."));
			assert.ok(loggedMessages.some((msg) => msg.includes("Loaded 1 cases")));
		});

		it("should call executor plan", async () => {
			await executeRun("/test/config.json", defaultOptions, {
				logger: mockLogger,
				configLoader: mockConfigLoader,
				moduleLoader: mockModuleLoader,
				createExecutor: () => mockExecutor,
				aggregator: mockAggregator,
				outputWriter: mockOutputWriter,
				processExit: mockProcessExit,
			});

			assert.strictEqual(mockExecutor.plan.mock.calls.length, 1);
		});

		it("should handle dry run mode", async () => {
			await executeRun(
				"/test/config.json",
				{ ...defaultOptions, dryRun: true },
				{
					logger: mockLogger,
					configLoader: mockConfigLoader,
					moduleLoader: mockModuleLoader,
					createExecutor: () => mockExecutor,
					aggregator: mockAggregator,
					outputWriter: mockOutputWriter,
					processExit: mockProcessExit,
				},
			);

			assert.ok(loggedMessages.includes("[subheader] Dry run - not executing"));
			assert.strictEqual(mockExecutor.execute.mock.calls.length, 0);
		});

		it("should log SUTs and cases in dry run", async () => {
			await executeRun(
				"/test/config.json",
				{ ...defaultOptions, dryRun: true },
				{
					logger: mockLogger,
					configLoader: mockConfigLoader,
					moduleLoader: mockModuleLoader,
					createExecutor: () => mockExecutor,
					aggregator: mockAggregator,
					outputWriter: mockOutputWriter,
					processExit: mockProcessExit,
				},
			);

			assert.ok(loggedMessages.some((msg) => msg.includes("SUTs: test-sut")));
			assert.ok(loggedMessages.some((msg) => msg.includes("Cases: test-case")));
			assert.ok(loggedMessages.some((msg) => msg.includes("Total runs: 1")));
		});

		it("should execute experiments in normal mode", async () => {
			await executeRun("/test/config.json", defaultOptions, {
				logger: mockLogger,
				configLoader: mockConfigLoader,
				moduleLoader: mockModuleLoader,
				createExecutor: () => mockExecutor,
				aggregator: mockAggregator,
				outputWriter: mockOutputWriter,
				processExit: mockProcessExit,
			});

			assert.strictEqual(mockExecutor.execute.mock.calls.length, 1);
		});

		it("should log execution summary", async () => {
			await executeRun("/test/config.json", defaultOptions, {
				logger: mockLogger,
				configLoader: mockConfigLoader,
				moduleLoader: mockModuleLoader,
				createExecutor: () => mockExecutor,
				aggregator: mockAggregator,
				outputWriter: mockOutputWriter,
				processExit: mockProcessExit,
			});

			assert.ok(loggedMessages.includes("[subheader] Execution Summary"));
			assert.ok(loggedMessages.some((msg) => msg.includes("Total runs: 1")));
			assert.ok(loggedMessages.some((msg) => msg.includes("Successful: 1")));
			assert.ok(loggedMessages.some((msg) => msg.includes("Failed: 0")));
		});

		it("should write results", async () => {
			await executeRun("/test/config.json", defaultOptions, {
				logger: mockLogger,
				configLoader: mockConfigLoader,
				moduleLoader: mockModuleLoader,
				createExecutor: () => mockExecutor,
				aggregator: mockAggregator,
				outputWriter: mockOutputWriter,
				processExit: mockProcessExit,
			});

			assert.strictEqual(mockOutputWriter.writeResults.mock.calls.length, 1);
		});

		it("should aggregate when requested and results exist", async () => {
			await executeRun("/test/config.json", defaultOptions, {
				logger: mockLogger,
				configLoader: mockConfigLoader,
				moduleLoader: mockModuleLoader,
				createExecutor: () => mockExecutor,
				aggregator: mockAggregator,
				outputWriter: mockOutputWriter,
				processExit: mockProcessExit,
			});

			assert.strictEqual(mockAggregator.aggregateResults.mock.calls.length, 1);
			assert.strictEqual(mockOutputWriter.writeAggregates.mock.calls.length, 1);
		});

		it("should skip aggregation when noAggregate is true", async () => {
			await executeRun(
				"/test/config.json",
				{ ...defaultOptions, noAggregate: true },
				{
					logger: mockLogger,
					configLoader: mockConfigLoader,
					moduleLoader: mockModuleLoader,
					createExecutor: () => mockExecutor,
					aggregator: mockAggregator,
					outputWriter: mockOutputWriter,
					processExit: mockProcessExit,
				},
			);

			assert.strictEqual(mockAggregator.aggregateResults.mock.calls.length, 0);
		});

		it("should call process.exit on error", async () => {
			mockConfigLoader.loadAndValidateConfig = async () => {
				throw new Error("Config error");
			};

			try {
				await executeRun("/test/config.json", defaultOptions, {
					logger: mockLogger,
					configLoader: mockConfigLoader,
					moduleLoader: mockModuleLoader,
					createExecutor: () => mockExecutor,
					aggregator: mockAggregator,
					outputWriter: mockOutputWriter,
					processExit: mockProcessExit,
				});
			} catch {
				// Expected to throw
			}

			assert.ok(loggedMessages.some((msg) => msg.includes("[error] Config error")));
			assert.strictEqual(exitCode, 1);
		});

		it("should log success message", async () => {
			await executeRun("/test/config.json", defaultOptions, {
				logger: mockLogger,
				configLoader: mockConfigLoader,
				moduleLoader: mockModuleLoader,
				createExecutor: () => mockExecutor,
				aggregator: mockAggregator,
				outputWriter: mockOutputWriter,
				processExit: mockProcessExit,
			});

			assert.ok(loggedMessages.some((msg) => msg.includes("Experiment completed successfully!")));
			assert.strictEqual(exitCode, null);
		});
	});
});
