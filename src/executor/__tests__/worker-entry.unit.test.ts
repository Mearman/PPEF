/**
 * Unit tests for worker-entry.ts
 *
 * Tests WorkerExecutor with injected mock dependencies.
 */

import { describe, it, mock, beforeEach } from "node:test";
import { strict as assert } from "node:assert";

import type { EvaluationResult } from "../../types/result.js";
import {
	type IDatasetsModule,
	type IEvaluateModule,
	type IExecutorModule,
	type IModuleLoader,
	type IParentPort,
	type IRegistryModule,
	type ISutRegistry,
	type ISutsModule,
	type WorkerMessage,
	WorkerExecutor,
} from "../worker-executor.js";

describe("worker-entry", () => {
	let mockParentPort: IParentPort;
	let mockModuleLoader: IModuleLoader;
	let mockExecutorInstance: {
		execute: ReturnType<typeof mock.fn>;
	};
	let postedMessages: unknown[];
	let onListeners: { event: string; listener: (data: unknown) => void }[];

	beforeEach(() => {
		postedMessages = [];
		onListeners = [];

		// Mock parentPort
		mockParentPort = {
			on: mock.fn((event: string, listener: (data: unknown) => void) => {
				onListeners.push({ event, listener });
			}),
			postMessage: mock.fn((message: unknown) => {
				postedMessages.push(message);
			}),
		};

		// Mock executor instance
		mockExecutorInstance = {
			execute: mock.fn(async () => ({
				results: [
					{
						run: {
							runId: "test-1",
							sut: "sut-1",
							sutRole: "primary" as const,
							caseId: "case-1",
							repetition: 0,
							seed: 42,
						},
						correctness: {
							expectedExists: true,
							producedOutput: true,
							valid: true,
							matchesExpected: true,
						},
						outputs: {},
						metrics: { numeric: {} },
						provenance: {
							runtime: {
								platform: "test",
								arch: "test",
								nodeVersion: "test",
							},
						},
					},
				] as EvaluationResult[],
				errors: [],
			})),
		};

		// Mock Executor constructor
		const MockExecutor = mock.fn(function (this: unknown) {
			return mockExecutorInstance;
		});

		// Mock module loader
		mockModuleLoader = {
			loadExecutor: async (): Promise<IExecutorModule> => {
				return {
					Executor: MockExecutor as unknown as IExecutorModule["Executor"],
				};
			},
			loadEvaluate: async (): Promise<IEvaluateModule> => {
				return {
					getSutDefinitions: () => ({}),
					getCaseDefinitions: () => ({}),
				};
			},
			loadRegistry: async (): Promise<IRegistryModule> => {
				return {
					registerAllBenchmarkCases: async () => ({}),
				};
			},
			loadSuts: async (): Promise<ISutsModule> => {
				return {
					registerAllSuts: () => ({}),
				};
			},
			loadDatasets: async (): Promise<IDatasetsModule> => {
				return {
					registerBenchmarkDatasets: async () => {
						return;
					},
				};
			},
		};
	});

	describe("WorkerExecutor", () => {
		it("should register message listener on start", () => {
			const executor = new WorkerExecutor(mockParentPort, mockModuleLoader, "/test/root");
			executor.start();

			assert.strictEqual(onListeners.length, 1);
			assert.strictEqual(onListeners[0].event, "message");
			assert.strictEqual(typeof onListeners[0].listener, "function");
		});

		it("should call module loader methods in order", async () => {
			const callOrder: string[] = [];

			// Wrap each loader method to track call order
			const originalLoader = mockModuleLoader;
			mockModuleLoader = {
				loadExecutor: async () => {
					callOrder.push("loadExecutor");
					return originalLoader.loadExecutor();
				},
				loadEvaluate: async () => {
					callOrder.push("loadEvaluate");
					return originalLoader.loadEvaluate();
				},
				loadRegistry: async () => {
					callOrder.push("loadRegistry");
					return originalLoader.loadRegistry();
				},
				loadSuts: async () => {
					callOrder.push("loadSuts");
					return originalLoader.loadSuts();
				},
				loadDatasets: async () => {
					callOrder.push("loadDatasets");
					return originalLoader.loadDatasets();
				},
			};

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

			const executor = new WorkerExecutor(mockParentPort, mockModuleLoader, "/test/root");
			await executor.handleMessage(message);

			// Verify all module loaders were called in the expected order
			assert.strictEqual(callOrder.length, 5);
			assert.strictEqual(callOrder[0], "loadExecutor");
			assert.strictEqual(callOrder[1], "loadEvaluate");
			assert.strictEqual(callOrder[2], "loadRegistry");
			assert.strictEqual(callOrder[3], "loadSuts");
			assert.strictEqual(callOrder[4], "loadDatasets");
		});

		it("should post done message on successful execution", async () => {
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

			const executor = new WorkerExecutor(mockParentPort, mockModuleLoader, "/test/root");
			await executor.handleMessage(message);

			assert.strictEqual(postedMessages.length, 1);
			const posted = postedMessages[0] as {
				type: string;
				results: EvaluationResult[];
			};
			assert.strictEqual(posted.type, "done");
			assert.ok(Array.isArray(posted.results));
			assert.strictEqual(posted.results.length, 1);
		});

		it("should post error message on exception", async () => {
			// Make loadExecutor throw an error
			mockModuleLoader.loadExecutor = async (): Promise<IExecutorModule> => {
				throw new Error("Module not found");
			};

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

			const executor = new WorkerExecutor(mockParentPort, mockModuleLoader, "/test/root");
			await executor.handleMessage(message);

			assert.strictEqual(postedMessages.length, 1);
			const posted = postedMessages[0] as { type: string; error: string };
			assert.strictEqual(posted.type, "error");
			assert.strictEqual(posted.error, "Module not found");
		});

		it("should post error message with string error", async () => {
			mockModuleLoader.loadExecutor = async (): Promise<IExecutorModule> => {
				throw new Error("String error");
			};

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

			const executor = new WorkerExecutor(mockParentPort, mockModuleLoader, "/test/root");
			await executor.handleMessage(message);

			assert.strictEqual(postedMessages.length, 1);
			const posted = postedMessages[0] as { type: string; error: string };
			assert.strictEqual(posted.type, "error");
			assert.strictEqual(posted.error, "String error");
		});

		it("should pass executor config to Executor constructor", async () => {
			const MockExecutor = mock.fn(function (this: unknown, _config: unknown) {
				mockExecutorInstance.execute = mock.fn(async () => ({
					results: [],
					errors: [],
				}));
				return mockExecutorInstance;
			});

			mockModuleLoader.loadExecutor = async (): Promise<IExecutorModule> => {
				return {
					Executor: MockExecutor as unknown as IExecutorModule["Executor"],
				};
			};

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
					continueOnError: false,
					timeoutMs: 15000,
					collectProvenance: true,
				},
			};

			const executor = new WorkerExecutor(mockParentPort, mockModuleLoader, "/test/root");
			await executor.handleMessage(message);

			// Verify Executor was constructed with correct config
			assert.strictEqual(MockExecutor.mock.calls.length, 1);
			const executorConfig = MockExecutor.mock.calls[0].arguments[0] as {
				repetitions: number;
				seedBase: number;
				continueOnError: boolean;
				timeoutMs: number;
				collectProvenance: boolean;
			};
			assert.strictEqual(executorConfig.repetitions, 5);
			assert.strictEqual(executorConfig.seedBase, 999);
			assert.strictEqual(executorConfig.continueOnError, false);
			assert.strictEqual(executorConfig.timeoutMs, 15000);
			assert.strictEqual(executorConfig.collectProvenance, true);
		});

		it("should handle multiple runs in a batch", async () => {
			const message: WorkerMessage = {
				runs: [
					{
						runId: "test-1",
						sutId: "sut-1",
						caseId: "case-1",
						repetition: 0,
						config: {},
					},
					{
						runId: "test-2",
						sutId: "sut-2",
						caseId: "case-2",
						repetition: 1,
						config: {},
					},
					{
						runId: "test-3",
						sutId: "sut-1",
						caseId: "case-2",
						repetition: 0,
						config: {},
					},
				],
				config: {
					repetitions: 3,
					seedBase: 100,
					continueOnError: true,
					timeoutMs: 10000,
					collectProvenance: false,
				},
			};

			const executor = new WorkerExecutor(mockParentPort, mockModuleLoader, "/test/root");
			await executor.handleMessage(message);

			assert.strictEqual(postedMessages.length, 1);
			const posted = postedMessages[0] as {
				type: string;
				results: EvaluationResult[];
			};
			assert.strictEqual(posted.type, "done");
			assert.ok(Array.isArray(posted.results));
		});
	});

	describe("executeBatch", () => {
		it("should call registerBenchmarkDatasets on datasets module", async () => {
			const registerSpy = mock.fn(async () => {
				return;
			});
			mockModuleLoader.loadDatasets = async (): Promise<IDatasetsModule> => {
				return {
					registerBenchmarkDatasets: registerSpy,
				};
			};

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

			const executor = new WorkerExecutor(mockParentPort, mockModuleLoader, "/test/root");
			await executor.executeBatch(message);

			assert.strictEqual(registerSpy.mock.calls.length, 1);
		});

		it("should call registerAllSuts on SUTs module", async () => {
			const registerSpy = mock.fn(() => ({}));
			mockModuleLoader.loadSuts = async (): Promise<ISutsModule> => {
				return {
					registerAllSuts: registerSpy,
				};
			};

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

			const executor = new WorkerExecutor(mockParentPort, mockModuleLoader, "/test/root");
			await executor.executeBatch(message);

			assert.strictEqual(registerSpy.mock.calls.length, 1);
		});

		it("should call registerAllBenchmarkCases on registry module", async () => {
			const registerSpy = mock.fn(async () => ({}));
			mockModuleLoader.loadRegistry = async (): Promise<IRegistryModule> => {
				return {
					registerAllBenchmarkCases: registerSpy,
				};
			};

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

			const executor = new WorkerExecutor(mockParentPort, mockModuleLoader, "/test/root");
			await executor.executeBatch(message);

			assert.strictEqual(registerSpy.mock.calls.length, 1);
		});

		it("should create sutRegistry with list and getFactory methods", async () => {
			let capturedSutRegistry: ISutRegistry | undefined;
			mockModuleLoader.loadEvaluate = async (): Promise<IEvaluateModule> => {
				return {
					getSutDefinitions: (registry: ISutRegistry) => {
						capturedSutRegistry = registry;
						return {};
					},
					getCaseDefinitions: () => ({}),
				};
			};

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

			const executor = new WorkerExecutor(mockParentPort, mockModuleLoader, "/test/root");
			await executor.executeBatch(message);

			assert.ok(capturedSutRegistry);
			assert.strictEqual(typeof capturedSutRegistry.list, "function");
			assert.strictEqual(typeof capturedSutRegistry.getFactory, "function");
		});
	});
});
