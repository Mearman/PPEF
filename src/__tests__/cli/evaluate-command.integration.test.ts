/**
 * Integration tests for Evaluate Command
 *
 * Tests the CLI evaluate command using dependency injection
 * for file system and process exit mocking.
 */

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import type { ICommandLogger, IFileSystem } from "../../cli/command-deps.js";
import { executeEvaluate } from "../../cli/commands/evaluate.js";
import type { AggregatedResult } from "../../types/aggregate.js";
import { createMockAggregate, createMockSummaryStats } from "../test-helpers.js";

/**
 * Test helpers
 */

function createMockAggregatesFile(): string {
	const aggregates: AggregatedResult[] = [
		createMockAggregate("primary-sut", "primary", undefined, {
			accuracy: createMockSummaryStats([0.85, 0.87, 0.86]),
		}),
		createMockAggregate("baseline-sut", "baseline", undefined, {
			accuracy: createMockSummaryStats([0.75, 0.77, 0.76]),
		}),
	];

	return JSON.stringify({ aggregates }, null, 2);
}

function createMockClaimsConfig(): string {
	return JSON.stringify(
		{
			claims: [
				{
					claimId: "C001",
					description: "Test claim",
					sut: "primary-sut",
					baseline: "baseline-sut",
					metric: "accuracy",
					direction: "greater",
					scope: "global",
				},
			],
		},
		null,
		2,
	);
}

function createMockMetricsConfig(): string {
	return JSON.stringify(
		{
			criteria: [
				{
					criterionId: "C001",
					description: "Test criterion",
					type: "threshold",
					metric: "accuracy",
					sut: "primary-sut",
					threshold: { operator: "gte", value: 0.8 },
				},
			],
		},
		null,
		2,
	);
}

function createMockRobustnessConfig(): string {
	return JSON.stringify(
		{
			metrics: ["accuracy"],
			perturbations: ["noise"],
		},
		null,
		2,
	);
}

/**
 * Spy logger that captures all calls
 */
class SpyLogger implements ICommandLogger {
	calls: string[] = [];

	header(message: string): void {
		this.calls.push(`header:${message}`);
	}

	subheader(message: string): void {
		this.calls.push(`subheader:${message}`);
	}

	info(message: string): void {
		this.calls.push(`info:${message}`);
	}

	debug(message: string): void {
		this.calls.push(`debug:${message}`);
	}

	error(message: string): void {
		this.calls.push(`error:${message}`);
	}

	warn(message: string): void {
		this.calls.push(`warn:${message}`);
	}

	setProgress(_enabled: boolean): void {
		// Ignore
	}

	hasInfo(message: string): boolean {
		return this.calls.includes(`info:${message}`);
	}

	hasError(message: string): boolean {
		return this.calls.some((call) => call.startsWith(`error:`) && call.includes(message));
	}
}

/**
 * Mock file system
 */
class MockFS implements IFileSystem {
	private files = new Map<string, string>();

	constructor(files: Record<string, string>) {
		Object.entries(files).forEach(([path, content]) => {
			this.files.set(path, content);
		});
	}

	async readFile(path: string, _encoding: string): Promise<string> {
		const content = this.files.get(path);
		if (content === undefined) {
			throw new Error(`File not found: ${path}`);
		}
		return content;
	}

	async writeFile(path: string, data: string, _encoding: string): Promise<void> {
		this.files.set(path, data);
	}
}

describe("evaluate command - integration tests", () => {
	describe("claims evaluation", () => {
		it("should evaluate claims successfully", async () => {
			const aggregatesFile = "/mock/aggregates.json";
			const configFile = "/mock/config.json";
			const mockFS = new MockFS({
				[aggregatesFile]: createMockAggregatesFile(),
				[configFile]: createMockClaimsConfig(),
			});
			const mockLogger = new SpyLogger();
			let exitCode: number | undefined;
			const mockExit = (code: number) => {
				exitCode = code;
				throw new Error(`Exit ${code}`);
			};

			// executeEvaluate doesn't call processExit on success
			try {
				await executeEvaluate(
					aggregatesFile,
					{ type: "claims" as const, config: configFile, verbose: true },
					{ logger: mockLogger, fileSystem: mockFS, processExit: mockExit },
				);
			} catch (e) {
				// If processExit was called, we should see the exit code and logged errors
				if (exitCode !== undefined) {
					const errorLogs = mockLogger.calls.filter((call) => call.startsWith("error:"));
					assert.fail(
						`processExit was called with code ${exitCode}. Logged errors:\n${errorLogs.join("\n")}`,
					);
				}
				throw e;
			}

			assert.strictEqual(exitCode, undefined, "processExit should not be called on success");
			// Check for "Evaluation complete: claims" message
			assert.ok(mockLogger.calls.some((call) => call.startsWith("info:Evaluation complete:")));
		});

		it("should use provided config file", async () => {
			const aggregatesFile = "/mock/aggregates.json";
			const configFile = "/mock/config.json";
			const mockFS = new MockFS({
				[aggregatesFile]: createMockAggregatesFile(),
				[configFile]: createMockClaimsConfig(),
			});
			const mockLogger = new SpyLogger();
			let exitCode: number | undefined;
			const mockExit = (code: number) => {
				exitCode = code;
				throw new Error(`Exit ${code}`);
			};

			try {
				await executeEvaluate(
					aggregatesFile,
					{ type: "claims" as const, config: configFile },
					{ logger: mockLogger, fileSystem: mockFS, processExit: mockExit },
				);
			} catch (e) {
				if (exitCode !== undefined) {
					const errorLogs = mockLogger.calls.filter((call) => call.startsWith("error:"));
					assert.fail(
						`processExit was called with code ${exitCode}. Logged errors:\n${errorLogs.join("\n")}`,
					);
				}
				throw e;
			}

			assert.strictEqual(exitCode, undefined, "processExit should not be called on success");
		});

		it("should handle invalid config gracefully", async () => {
			const aggregatesFile = "/mock/aggregates.json";
			const configFile = "/mock/config.json";
			const mockFS = new MockFS({
				[aggregatesFile]: createMockAggregatesFile(),
				[configFile]: JSON.stringify({ invalid: "config" }),
			});
			const mockLogger = new SpyLogger();
			let exitCode = 0;
			const mockExit = (code: number) => {
				exitCode = code;
				throw new Error(`Exit ${code}`);
			};

			await executeEvaluate(
				aggregatesFile,
				{ type: "claims" as const, config: configFile },
				{ logger: mockLogger, fileSystem: mockFS, processExit: mockExit },
			).catch(() => {
				// Expected
			});

			assert.strictEqual(exitCode, 1);
			assert.ok(mockLogger.hasError("validation failed"));
		});
	});

	describe("metrics evaluation", () => {
		it("should evaluate metrics successfully", async () => {
			const aggregatesFile = "/mock/aggregates.json";
			const configFile = "/mock/config.json";
			const mockFS = new MockFS({
				[aggregatesFile]: createMockAggregatesFile(),
				[configFile]: createMockMetricsConfig(),
			});
			const mockLogger = new SpyLogger();
			let exitCode: number | undefined;
			const mockExit = (code: number) => {
				exitCode = code;
				throw new Error(`Exit ${code}`);
			};

			try {
				await executeEvaluate(
					aggregatesFile,
					{
						type: "metrics" as const,
						config: configFile,
						verbose: true,
					},
					{ logger: mockLogger, fileSystem: mockFS, processExit: mockExit },
				);
			} catch (e) {
				if (exitCode !== undefined) {
					const errorLogs = mockLogger.calls.filter((call) => call.startsWith("error:"));
					assert.fail(
						`processExit was called with code ${exitCode}. Logged errors:\n${errorLogs.join("\n")}`,
					);
				}
				throw e;
			}

			assert.strictEqual(exitCode, undefined, "processExit should not be called on success");
			assert.ok(mockLogger.calls.some((call) => call.startsWith("info:Evaluation complete:")));
		});
	});

	describe("error handling", () => {
		it("should exit with error when file not found", async () => {
			const mockFS = new MockFS({});
			const mockLogger = new SpyLogger();
			let exitCode = 0;
			const mockExit = (code: number) => {
				exitCode = code;
				throw new Error(`Exit ${code}`);
			};

			await executeEvaluate(
				"/mock/missing.json",
				{ type: "claims" as const },
				{ logger: mockLogger, fileSystem: mockFS, processExit: mockExit },
			).catch(() => {
				// Expected
			});

			assert.strictEqual(exitCode, 1);
			assert.ok(mockLogger.calls.some((call) => call.startsWith("error:")));
		});

		it("should handle invalid JSON gracefully", async () => {
			const aggregatesFile = "/mock/aggregates.json";
			const mockFS = new MockFS({
				[aggregatesFile]: "invalid json{",
			});
			const mockLogger = new SpyLogger();
			let exitCode = 0;
			const mockExit = (code: number) => {
				exitCode = code;
				throw new Error(`Exit ${code}`);
			};

			await executeEvaluate(
				aggregatesFile,
				{ type: "claims" as const },
				{ logger: mockLogger, fileSystem: mockFS, processExit: mockExit },
			).catch(() => {
				// Expected
			});

			assert.strictEqual(exitCode, 1);
		});

		it("should handle missing aggregates in file", async () => {
			const aggregatesFile = "/mock/aggregates.json";
			const mockFS = new MockFS({
				[aggregatesFile]: JSON.stringify({ results: [] }),
			});
			const mockLogger = new SpyLogger();
			let exitCode = 0;
			const mockExit = (code: number) => {
				exitCode = code;
				throw new Error(`Exit ${code}`);
			};

			await executeEvaluate(
				aggregatesFile,
				{ type: "claims" as const },
				{ logger: mockLogger, fileSystem: mockFS, processExit: mockExit },
			).catch(() => {
				// Expected
			});

			assert.strictEqual(exitCode, 1);
			assert.ok(
				mockLogger.calls.some((call) => call.startsWith("error:") && call.includes("aggregate")),
			);
		});
	});

	describe("robustness evaluation", () => {
		it("should require raw results for robustness", async () => {
			const aggregatesFile = "/mock/aggregates.json";
			const configFile = "/mock/config.json";
			const mockFS = new MockFS({
				[aggregatesFile]: JSON.stringify({
					aggregates: [
						createMockAggregate("sut-1", "primary", undefined, {
							accuracy: createMockSummaryStats([0.85]),
						}),
					],
				}),
				[configFile]: createMockRobustnessConfig(),
			});
			const mockLogger = new SpyLogger();
			let exitCode = 0;
			const mockExit = (code: number) => {
				exitCode = code;
				throw new Error(`Exit ${code}`);
			};

			await executeEvaluate(
				aggregatesFile,
				{ type: "robustness" as const, config: configFile },
				{ logger: mockLogger, fileSystem: mockFS, processExit: mockExit },
			).catch(() => {
				// Expected to throw due to mockExit
			});

			// Check exitCode first
			if (exitCode !== 1) {
				assert.fail(
					`Expected exitCode to be 1, but got ${exitCode}. All calls:\n${mockLogger.calls.join("\n")}`,
				);
			}

			// Check for error message
			const hasRawResultsError = mockLogger.calls.some(
				(call) => call.startsWith("error:") && call.includes("raw results"),
			);
			if (!hasRawResultsError) {
				assert.fail(
					`Expected error message containing 'raw results', but got:\n${mockLogger.calls
						.filter((c) => c.startsWith("error:"))
						.join("\n")}`,
				);
			}
		});
	});
});
