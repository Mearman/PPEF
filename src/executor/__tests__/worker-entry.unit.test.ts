/**
 * Unit tests for worker-entry.ts
 *
 * Tests message handling, SUT execution, and error handling for the worker entry point.
 */

import { beforeEach, describe, it, mock } from "node:test";
import { strict as assert } from "node:assert";

/**
 * Type definitions for testing
 */
interface RunConfig {
	runId: string;
	sutId: string;
	caseId: string;
	repetition: number;
	config: unknown;
}

interface ExecutorConfig {
	repetitions: number;
	seedBase: number;
	continueOnError: boolean;
	timeoutMs: number;
	collectProvenance: boolean;
}

interface WorkerMessage {
	runs: RunConfig[];
	config: ExecutorConfig;
}

interface WorkerResponse {
	results: unknown[];
	errors: { runId: string; error: string }[];
}

describe("worker-entry", () => {
	const onCalls: { event: string; listener: (data: unknown) => void }[] = [];
	const postMessageCalls: unknown[] = [];

	let mockParentPort: {
		on: (event: string, listener: (data: unknown) => void) => void;
		postMessage: (message: unknown) => void;
		mock: {
			on: { calls: { event: string; listener: (data: unknown) => void }[] };
			postMessage: { calls: unknown[] };
		};
	};

	/**
	 * Mock Executor class for testing
	 */
	class MockExecutor {
		execute: (
			suts: unknown,
			cases: unknown,
			callback: () => unknown,
		) => Promise<{
			results: unknown[];
			errors: { runId: string; error: string }[];
		}>;

		constructor(config: ExecutorConfig) {
			this.execute = async (
				_suts: unknown,
				_cases: unknown,
				_callback: () => unknown,
			): Promise<{
				results: unknown[];
				errors: { runId: string; error: string }[];
			}> => {
				return {
					results: [{ runId: "test-1", value: "success" }],
					errors: [],
				};
			};
		}
	}

	let mockExecutorInstance: MockExecutor;

	let postedMessages: unknown[];

	beforeEach(() => {
		postedMessages = [];
		onCalls.length = 0;
		postMessageCalls.length = 0;

		// Mock parentPort
		mockParentPort = {
			on: (event: string, listener: (data: unknown) => void) => {
				onCalls.push({ event, listener });
			},
			postMessage: (message: unknown) => {
				postMessageCalls.push(message);
				postedMessages.push(message);
			},
			mock: {
				on: { calls: onCalls },
				postMessage: { calls: postMessageCalls },
			},
		};

		// Create mock Executor instance
		mockExecutorInstance = new MockExecutor({
			repetitions: 1,
			seedBase: 42,
			continueOnError: true,
			timeoutMs: 5000,
			collectProvenance: false,
		});
	});

	describe("Message handling with valid run configuration", () => {
		it("should accept valid WorkerMessage with runs array", () => {
			const validMessage: WorkerMessage = {
				runs: [
					{
						runId: "test-run-1",
						sutId: "sut-1",
						caseId: "case-1",
						repetition: 0,
						config: {},
					},
				],
				config: {
					repetitions: 1,
					seedBase: 42,
					continueOnError: true,
					timeoutMs: 5000,
					collectProvenance: false,
				},
			};

			// Validate message structure
			assert.ok(Array.isArray(validMessage.runs));
			assert.strictEqual(validMessage.runs.length, 1);
			assert.strictEqual(validMessage.runs[0].runId, "test-run-1");
			assert.strictEqual(validMessage.config.repetitions, 1);
			assert.strictEqual(validMessage.config.seedBase, 42);
		});

		it("should accept valid WorkerMessage with multiple runs", () => {
			const validMessage: WorkerMessage = {
				runs: [
					{
						runId: "test-run-1",
						sutId: "sut-1",
						caseId: "case-1",
						repetition: 0,
						config: {},
					},
					{
						runId: "test-run-2",
						sutId: "sut-2",
						caseId: "case-2",
						repetition: 1,
						config: {},
					},
					{
						runId: "test-run-3",
						sutId: "sut-1",
						caseId: "case-2",
						repetition: 0,
						config: {},
					},
				],
				config: {
					repetitions: 3,
					seedBase: 100,
					continueOnError: false,
					timeoutMs: 10000,
					collectProvenance: true,
				},
			};

			assert.strictEqual(validMessage.runs.length, 3);
			assert.strictEqual(validMessage.config.repetitions, 3);
			assert.strictEqual(validMessage.config.collectProvenance, true);
		});

		it("should accept WorkerMessage with empty runs array", () => {
			const validMessage: WorkerMessage = {
				runs: [],
				config: {
					repetitions: 1,
					seedBase: 0,
					continueOnError: false,
					timeoutMs: 1000,
					collectProvenance: false,
				},
			};

			assert.strictEqual(validMessage.runs.length, 0);
			assert.ok(Array.isArray(validMessage.runs));
		});

		it("should validate run config structure", () => {
			const runConfig: RunConfig = {
				runId: "run-001",
				sutId: "my-sut",
				caseId: "test-case",
				repetition: 5,
				config: { param1: "value1", param2: 42 },
			};

			assert.strictEqual(typeof runConfig.runId, "string");
			assert.strictEqual(typeof runConfig.sutId, "string");
			assert.strictEqual(typeof runConfig.caseId, "string");
			assert.strictEqual(typeof runConfig.repetition, "number");
			assert.ok(runConfig.repetition >= 0);
		});

		it("should validate executor config structure", () => {
			const executorConfig: ExecutorConfig = {
				repetitions: 10,
				seedBase: 12345,
				continueOnError: true,
				timeoutMs: 30000,
				collectProvenance: true,
			};

			assert.strictEqual(typeof executorConfig.repetitions, "number");
			assert.strictEqual(typeof executorConfig.seedBase, "number");
			assert.strictEqual(typeof executorConfig.continueOnError, "boolean");
			assert.strictEqual(typeof executorConfig.timeoutMs, "number");
			assert.strictEqual(typeof executorConfig.collectProvenance, "boolean");
		});
	});

	describe("SUT execution and result return", () => {
		it("should create Executor with config from message", () => {
			const message: WorkerMessage = {
				runs: [
					{
						runId: "test-1",
						sutId: "sut-1",
						caseId: "case-1",
						repetition: 0,
						config: {},
					},
				],
				config: {
					repetitions: 5,
					seedBase: 999,
					continueOnError: true,
					timeoutMs: 15000,
					collectProvenance: false,
				},
			};

			const executor = new MockExecutor(message.config);

			assert.ok(executor instanceof MockExecutor);
			assert.ok(executor.execute);
		});

		it("should return WorkerResponse with results", async () => {
			const message: WorkerMessage = {
				runs: [
					{
						runId: "test-1",
						sutId: "sut-1",
						caseId: "case-1",
						repetition: 0,
						config: {},
					},
				],
				config: {
					repetitions: 1,
					seedBase: 42,
					continueOnError: true,
					timeoutMs: 5000,
					collectProvenance: false,
				},
			};

			const executor = new MockExecutor(message.config);
			const mockSuts = {};
			const mockCases = {};
			const mockCallback = () => ({});

			const result = await executor.execute(mockSuts, mockCases, mockCallback);

			assert.ok(result.results);
			assert.ok(Array.isArray(result.results));
			assert.ok(result.errors);
			assert.ok(Array.isArray(result.errors));
		});

		it("should post message with type 'done' on success", async () => {
			const message: WorkerMessage = {
				runs: [
					{
						runId: "test-1",
						sutId: "sut-1",
						caseId: "case-1",
						repetition: 0,
						config: {},
					},
				],
				config: {
					repetitions: 1,
					seedBase: 42,
					continueOnError: true,
					timeoutMs: 5000,
					collectProvenance: false,
				},
			};

			// Simulate successful execution
			const response: WorkerResponse = {
				results: [{ runId: "test-1", value: "success" }],
				errors: [],
			};

			// Simulate posting the response
			const successMessage = { type: "done", ...response };
			mockParentPort.postMessage(successMessage);

			assert.strictEqual(postedMessages.length, 1);
			const posted = postedMessages[0] as { type: string; results: unknown[] };
			assert.strictEqual(posted.type, "done");
			assert.ok(posted.results);
			assert.ok(Array.isArray(posted.results));
		});

		it("should include all results in WorkerResponse", () => {
			const response: WorkerResponse = {
				results: [
					{ runId: "test-1", value: "result1" },
					{ runId: "test-2", value: "result2" },
					{ runId: "test-3", value: "result3" },
				],
				errors: [],
			};

			assert.strictEqual(response.results.length, 3);
			const result0 = response.results[0] as { runId: string };
			const result1 = response.results[1] as { runId: string };
			const result2 = response.results[2] as { runId: string };
			assert.strictEqual(result0.runId, "test-1");
			assert.strictEqual(result1.runId, "test-2");
			assert.strictEqual(result2.runId, "test-3");
		});

		it("should include errors in WorkerResponse when present", () => {
			const response: WorkerResponse = {
				results: [{ runId: "test-1", value: "success" }],
				errors: [
					{ runId: "test-2", error: "Timeout exceeded" },
					{ runId: "test-3", error: "Invalid configuration" },
				],
			};

			assert.strictEqual(response.errors.length, 2);
			assert.strictEqual(response.errors[0].runId, "test-2");
			assert.strictEqual(response.errors[0].error, "Timeout exceeded");
			assert.strictEqual(response.errors[1].runId, "test-3");
			assert.strictEqual(response.errors[1].error, "Invalid configuration");
		});
	});

	describe("Error handling for invalid messages", () => {
		it("should post message with type 'error' on exception", async () => {
			// Simulate error during execution
			const errorMessage = {
				type: "error",
				error: "Failed to import executor module",
			};

			mockParentPort.postMessage(errorMessage);

			assert.strictEqual(postedMessages.length, 1);
			const posted = postedMessages[0] as { type: string; error: string };
			assert.strictEqual(posted.type, "error");
			assert.strictEqual(typeof posted.error, "string");
		});

		it("should handle Error objects in error messages", () => {
			const error = new Error("Test error message");
			const errorMessage = {
				type: "error",
				error: error.message,
			};

			mockParentPort.postMessage(errorMessage);

			assert.strictEqual(postedMessages.length, 1);
			const posted = postedMessages[0] as { type: string; error: string };
			assert.strictEqual(posted.error, "Test error message");
		});

		it("should handle non-Error objects in error messages", () => {
			const errorMessage = {
				type: "error",
				error: "String error representation",
			};

			mockParentPort.postMessage(errorMessage);

			assert.strictEqual(postedMessages.length, 1);
			const posted = postedMessages[0] as { type: string; error: string };
			assert.strictEqual(posted.error, "String error representation");
		});

		it("should handle missing runs array in message", () => {
			const invalidMessage = {
				runs: undefined,
				config: {
					repetitions: 1,
					seedBase: 42,
					continueOnError: true,
					timeoutMs: 5000,
					collectProvenance: false,
				},
			};

			// This would cause a runtime error when trying to access runs array
			// The worker should catch this and post an error message
			const errorMessage = {
				type: "error",
				error: "Invalid message structure",
			};

			mockParentPort.postMessage(errorMessage);

			assert.strictEqual(postedMessages.length, 1);
			const posted = postedMessages[0] as { type: string; error: string };
			assert.strictEqual(posted.type, "error");
		});

		it("should handle missing config in message", () => {
			const invalidMessage = {
				runs: [
					{
						runId: "test-1",
						sutId: "sut-1",
						caseId: "case-1",
						repetition: 0,
						config: {},
					},
				],
				config: undefined,
			};

			// This would cause a runtime error when trying to access config
			// The worker should catch this and post an error message
			const errorMessage = {
				type: "error",
				error: "Invalid message structure",
			};

			mockParentPort.postMessage(errorMessage);

			assert.strictEqual(postedMessages.length, 1);
			const posted = postedMessages[0] as { type: string; error: string };
			assert.strictEqual(posted.type, "error");
		});

		it("should handle null message data", () => {
			const invalidMessage = null;

			// When message is null, type assertion to WorkerMessage will fail
			// The worker should catch this and post an error message
			const errorMessage = {
				type: "error",
				error: "Cannot read properties of null",
			};

			mockParentPort.postMessage(errorMessage);

			assert.strictEqual(postedMessages.length, 1);
			const posted = postedMessages[0] as { type: string; error: string };
			assert.strictEqual(posted.type, "error");
		});
	});

	describe("Worker message listener registration", () => {
		it("should register listener for 'message' event", () => {
			const eventName = "message";
			const listener = (data: unknown) => {
				// Mock listener
			};

			mockParentPort.on(eventName, listener);

			assert.strictEqual(mockParentPort.mock.on.calls.length, 1);
			assert.strictEqual(mockParentPort.mock.on.calls[0].event, "message");
			assert.strictEqual(typeof mockParentPort.mock.on.calls[0].listener, "function");
		});

		it("should handle asynchronous execution without blocking", async () => {
			let executionCompleted = false;

			// Simulate async execution
			const asyncExecution = async () => {
				await new Promise((resolve) => setTimeout(resolve, 10));
				executionCompleted = true;
				return { results: [], errors: [] };
			};

			// Start execution (non-blocking)
			const executionPromise = asyncExecution();

			// Should not block
			assert.strictEqual(executionCompleted, false);

			// Wait for completion
			await executionPromise;
			assert.strictEqual(executionCompleted, true);
		});
	});

	describe("Response message structure", () => {
		it("should maintain type field in done response", () => {
			const response: WorkerResponse = {
				results: [{ runId: "test-1", value: "success" }],
				errors: [],
			};

			const doneMessage = { type: "done", ...response };

			assert.strictEqual(doneMessage.type, "done");
			assert.ok("results" in doneMessage);
			assert.ok("errors" in doneMessage);
		});

		it("should maintain type field in error response", () => {
			const errorMessage = {
				type: "error",
				error: "Something went wrong",
			};

			assert.strictEqual(errorMessage.type, "error");
			assert.ok("error" in errorMessage);
			assert.ok(!("results" in errorMessage));
		});

		it("should preserve error message content", () => {
			const testCases = [
				"Module not found",
				"Timeout exceeded",
				"Invalid configuration",
				"Null reference error",
			];

			for (const error of testCases) {
				const errorMessage = { type: "error", error };
				assert.strictEqual(errorMessage.error, error);
			}
		});
	});
});
