/**
 * Unit tests for aggregate command
 *
 * Tests aggregate command functionality with injected dependencies.
 */

import { beforeEach, describe, it, mock } from "node:test";
import { strict as assert } from "node:assert";

import { executeAggregate } from "../commands/aggregate.js";
import type { AggregatedResult, AggregationOutput } from "../../types/aggregate.js";
import type { EvaluationResult } from "../../types/result.js";
import type { IAggregator, ICommandLogger, IFileSystem, IOutputWriter } from "../command-deps.js";

describe("aggregate command", () => {
	let mockLogger: ICommandLogger;
	let mockFileSystem: IFileSystem;
	let mockAggregator: IAggregator;
	let mockOutputWriter: IOutputWriter;
	let mockProcessExit: (code: number) => never;
	let exitCode: number | null;
	const loggedMessages: string[] = [];

	const mockResults: EvaluationResult[] = [
		{
			run: {
				runId: "test-1",
				sut: "sut-1",
				sutRole: "primary" as const,
				caseId: "case-1",
				seed: 42,
				repetition: 0,
			},
			correctness: {
				expectedExists: false,
				producedOutput: true,
				valid: true,
				matchesExpected: null,
			},
			outputs: {},
			metrics: { numeric: {} },
			provenance: {
				runtime: {
					platform: "linux",
					arch: "x64",
					nodeVersion: "20.0.0",
				},
			},
		},
	];

	const mockAggregates: AggregatedResult[] = [
		{
			sut: "sut-1",
			sutRole: "primary" as const,
			caseClass: "test-class",
			group: { runCount: 1, caseCount: 1 },
			correctness: {
				validRate: 1,
				producedOutputRate: 1,
			},
			metrics: {
				accuracy: { n: 1, mean: 0.9, median: 0.9, min: 0.9, max: 0.9, std: 0 },
			},
		},
	];

	const mockAggregatesWithComparisons: AggregatedResult[] = [
		{
			sut: "sut-1",
			sutRole: "primary" as const,
			caseClass: "test-class",
			group: { runCount: 1, caseCount: 1 },
			correctness: {
				validRate: 1,
				producedOutputRate: 1,
			},
			metrics: {
				accuracy: { n: 1, mean: 0.9, median: 0.9, min: 0.9, max: 0.9, std: 0 },
			},
			comparisons: {
				baseline: {
					deltas: { default: 0.1 },
					ratios: { default: 1.1 },
					betterRate: 0.75,
					pValue: 0.0234,
					effectSize: 0.5678,
				},
			},
		},
	];

	const mockAggregationOutput: AggregationOutput = {
		version: "1.0.0",
		timestamp: "2024-01-01T00:00:00Z",
		aggregates: mockAggregates,
		metadata: { totalRuns: 1, totalCases: 1, sutsIncluded: ["sut-1"] },
	};

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

		// Mock file system
		mockFileSystem = {
			readFile: mock.fn(async (path: string, encoding: string) => {
				return JSON.stringify({ results: mockResults });
			}),
		};

		// Mock aggregator
		mockAggregator = {
			aggregateResults: mock.fn(() => mockAggregates),
			createAggregationOutput: mock.fn(() => mockAggregationOutput),
		};

		// Mock output writer
		mockOutputWriter = {
			writeAggregates: mock.fn(async () => {
				// Do nothing
			}),
			generateOutputFilename: mock.fn(() => "output.json"),
			writeResults: mock.fn(async () => {
				// Do nothing
			}),
		};
	});

	describe("executeAggregate", () => {
		it("should log header", async () => {
			await executeAggregate(
				"/test/results.json",
				{},
				{
					logger: mockLogger,
					fileSystem: mockFileSystem,
					aggregator: mockAggregator,
					outputWriter: mockOutputWriter,
					processExit: mockProcessExit,
				},
			);

			assert.ok(loggedMessages.includes("[header] Aggregating Results"));
		});

		it("should log reading file", async () => {
			await executeAggregate(
				"/test/results.json",
				{},
				{
					logger: mockLogger,
					fileSystem: mockFileSystem,
					aggregator: mockAggregator,
					outputWriter: mockOutputWriter,
					processExit: mockProcessExit,
				},
			);

			assert.ok(
				loggedMessages.some((msg) => msg.includes("Reading results from: /test/results.json")),
			);
		});

		it("should log number of results found", async () => {
			await executeAggregate(
				"/test/results.json",
				{},
				{
					logger: mockLogger,
					fileSystem: mockFileSystem,
					aggregator: mockAggregator,
					outputWriter: mockOutputWriter,
					processExit: mockProcessExit,
				},
			);

			assert.ok(loggedMessages.some((msg) => msg.includes("Found 1 results")));
		});

		it("should log computing aggregations", async () => {
			await executeAggregate(
				"/test/results.json",
				{},
				{
					logger: mockLogger,
					fileSystem: mockFileSystem,
					aggregator: mockAggregator,
					outputWriter: mockOutputWriter,
					processExit: mockProcessExit,
				},
			);

			assert.ok(loggedMessages.includes("[subheader] Computing aggregations..."));
		});

		it("should call aggregator with correct options", async () => {
			await executeAggregate(
				"/test/results.json",
				{ groupByCaseClass: false, computeComparisons: false },
				{
					logger: mockLogger,
					fileSystem: mockFileSystem,
					aggregator: mockAggregator,
					outputWriter: mockOutputWriter,
					processExit: mockProcessExit,
				},
			);

			// eslint-disable-next-line @typescript-eslint/unbound-method
			const aggregateResultsMock = mockAggregator.aggregateResults as unknown as ReturnType<
				typeof mock.fn
			>;
			const calls = aggregateResultsMock.mock.calls;
			assert.strictEqual(calls.length, 1);
			const [, options] = calls[0].arguments;
			assert.deepStrictEqual(options, {
				groupByCaseClass: false,
				computeComparisons: false,
			});
		});

		it("should use default options when not provided", async () => {
			await executeAggregate(
				"/test/results.json",
				{},
				{
					logger: mockLogger,
					fileSystem: mockFileSystem,
					aggregator: mockAggregator,
					outputWriter: mockOutputWriter,
					processExit: mockProcessExit,
				},
			);

			// eslint-disable-next-line @typescript-eslint/unbound-method
			const aggregateResultsMock = mockAggregator.aggregateResults as unknown as ReturnType<
				typeof mock.fn
			>;
			const calls = aggregateResultsMock.mock.calls;
			assert.strictEqual(calls.length, 1);
			const [, options] = calls[0].arguments;
			assert.deepStrictEqual(options, {
				groupByCaseClass: true,
				computeComparisons: true,
			});
		});

		it("should write aggregates to output", async () => {
			await executeAggregate(
				"/test/results.json",
				{ output: "/custom/output.json", format: "json" },
				{
					logger: mockLogger,
					fileSystem: mockFileSystem,
					aggregator: mockAggregator,
					outputWriter: mockOutputWriter,
					processExit: mockProcessExit,
				},
			);

			// eslint-disable-next-line @typescript-eslint/unbound-method
			const writeAggregatesMock = mockOutputWriter.writeAggregates as unknown as ReturnType<
				typeof mock.fn
			>;
			const calls = writeAggregatesMock.mock.calls;
			assert.strictEqual(calls.length, 1);
			const [, path, format] = calls[0].arguments;
			assert.strictEqual(path, "/custom/output.json");
			assert.strictEqual(format, "json");
		});

		it("should use default output path when not provided", async () => {
			await executeAggregate(
				"/test/experiment-results-2024-01-01.json",
				{},
				{
					logger: mockLogger,
					fileSystem: mockFileSystem,
					aggregator: mockAggregator,
					outputWriter: mockOutputWriter,
					processExit: mockProcessExit,
				},
			);

			// eslint-disable-next-line @typescript-eslint/unbound-method
			const writeAggregatesMock = mockOutputWriter.writeAggregates as unknown as ReturnType<
				typeof mock.fn
			>;
			const calls = writeAggregatesMock.mock.calls;
			assert.strictEqual(calls.length, 1);
			const [, path] = calls[0].arguments;
			assert.strictEqual(path, "/test/experiment-aggregates-2024-01-01.json");
		});

		it("should log aggregation summary", async () => {
			await executeAggregate(
				"/test/results.json",
				{},
				{
					logger: mockLogger,
					fileSystem: mockFileSystem,
					aggregator: mockAggregator,
					outputWriter: mockOutputWriter,
					processExit: mockProcessExit,
				},
			);

			assert.ok(loggedMessages.includes("[subheader] Aggregation Summary"));
			assert.ok(loggedMessages.some((msg) => msg.includes("sut-1 (test-class):")));
			assert.ok(loggedMessages.some((msg) => msg.includes("Runs: 1")));
			assert.ok(loggedMessages.some((msg) => msg.includes("Cases: 1")));
		});

		it("should log metrics summary", async () => {
			await executeAggregate(
				"/test/results.json",
				{},
				{
					logger: mockLogger,
					fileSystem: mockFileSystem,
					aggregator: mockAggregator,
					outputWriter: mockOutputWriter,
					processExit: mockProcessExit,
				},
			);

			assert.ok(loggedMessages.some((msg) => msg.includes("Metrics:")));
			assert.ok(
				loggedMessages.some((msg) => msg.includes("accuracy: mean=0.90, median=0.90, std=0.00")),
			);
		});

		it("should log success message", async () => {
			await executeAggregate(
				"/test/results.json",
				{},
				{
					logger: mockLogger,
					fileSystem: mockFileSystem,
					aggregator: mockAggregator,
					outputWriter: mockOutputWriter,
					processExit: mockProcessExit,
				},
			);

			assert.ok(loggedMessages.some((msg) => msg.includes("Aggregation completed successfully!")));
			assert.strictEqual(exitCode, null);
		});

		it("should handle invalid JSON", async () => {
			mockFileSystem.readFile = mock.fn(async () => "invalid json");

			try {
				await executeAggregate(
					"/test/results.json",
					{},
					{
						logger: mockLogger,
						fileSystem: mockFileSystem,
						aggregator: mockAggregator,
						outputWriter: mockOutputWriter,
						processExit: mockProcessExit,
					},
				);
			} catch {
				// Expected to throw
			}

			assert.ok(loggedMessages.some((msg) => msg.includes("[error]")));
			assert.strictEqual(exitCode, 1);
		});

		it("should handle missing results array", async () => {
			mockFileSystem.readFile = mock.fn(async () => JSON.stringify({}));

			try {
				await executeAggregate(
					"/test/results.json",
					{},
					{
						logger: mockLogger,
						fileSystem: mockFileSystem,
						aggregator: mockAggregator,
						outputWriter: mockOutputWriter,
						processExit: mockProcessExit,
					},
				);
			} catch {
				// Expected to throw
			}

			assert.ok(
				loggedMessages.some((msg) =>
					msg.includes("[error] Invalid results file: missing or invalid 'results' array"),
				),
			);
			assert.strictEqual(exitCode, 1);
		});

		it("should handle non-array results", async () => {
			mockFileSystem.readFile = mock.fn(async () => JSON.stringify({ results: "not an array" }));

			try {
				await executeAggregate(
					"/test/results.json",
					{},
					{
						logger: mockLogger,
						fileSystem: mockFileSystem,
						aggregator: mockAggregator,
						outputWriter: mockOutputWriter,
						processExit: mockProcessExit,
					},
				);
			} catch {
				// Expected to throw
			}

			assert.ok(
				loggedMessages.some((msg) =>
					msg.includes("[error] Invalid results file: missing or invalid 'results' array"),
				),
			);
			assert.strictEqual(exitCode, 1);
		});

		it("should handle file read errors", async () => {
			mockFileSystem.readFile = mock.fn(async () => {
				throw new Error("File not found");
			});

			try {
				await executeAggregate(
					"/test/results.json",
					{},
					{
						logger: mockLogger,
						fileSystem: mockFileSystem,
						aggregator: mockAggregator,
						outputWriter: mockOutputWriter,
						processExit: mockProcessExit,
					},
				);
			} catch {
				// Expected to throw
			}

			assert.ok(loggedMessages.some((msg) => msg.includes("[error] File not found")));
			assert.strictEqual(exitCode, 1);
		});

		it("should display comparisons in summary", async () => {
			mockAggregator.aggregateResults = mock.fn(() => mockAggregatesWithComparisons);
			mockAggregator.createAggregationOutput = mock.fn(() => ({
				...mockAggregationOutput,
				aggregates: mockAggregatesWithComparisons,
			}));

			await executeAggregate(
				"/test/results.json",
				{},
				{
					logger: mockLogger,
					fileSystem: mockFileSystem,
					aggregator: mockAggregator,
					outputWriter: mockOutputWriter,
					processExit: mockProcessExit,
				},
			);

			assert.ok(loggedMessages.some((msg) => msg.includes("Comparisons:")));
			assert.ok(loggedMessages.some((msg) => msg.includes("vs baseline:")));
			assert.ok(loggedMessages.some((msg) => msg.includes("p-value: 0.0234")));
			assert.ok(loggedMessages.some((msg) => msg.includes("effect size: 0.5678")));
		});

		it("should handle non-Error objects in catch block", async () => {
			mockFileSystem.readFile = mock.fn(async () => {
				// eslint-disable-next-line @typescript-eslint/only-throw-error
				throw "string error";
			});

			try {
				await executeAggregate(
					"/test/results.json",
					{},
					{
						logger: mockLogger,
						fileSystem: mockFileSystem,
						aggregator: mockAggregator,
						outputWriter: mockOutputWriter,
						processExit: mockProcessExit,
					},
				);
			} catch {
				// Expected to throw
			}

			assert.ok(loggedMessages.some((msg) => msg.includes("[error] string error")));
			assert.strictEqual(exitCode, 1);
		});
	});
});
