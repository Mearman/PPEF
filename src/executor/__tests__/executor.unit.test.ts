/**
 * Unit tests for Executor
 *
 * Tests executor behavior including planned runs filtering.
 */

import { beforeEach, describe, it } from "node:test";
import { strict as assert } from "node:assert";

import type { CaseDefinition } from "../../types/case.js";
import type { SutDefinition } from "../../types/sut.js";
import { Executor, createExecutor } from "../executor.js";

/**
 * Mock expander for testing.
 */
class MockExpander {
	async expand(): Promise<void> {
		// No-op
	}
}

/**
 * Mock result for testing.
 */
interface MockResult {
	value: string;
}

/**
 * Create a mock SUT definition.
 * @param id
 */
const createMockSut = (id: string): SutDefinition<unknown, MockResult> => ({
	registration: {
		id,
		name: `Mock SUT ${id}`,
		role: "primary",
		version: "1.0.0",
		config: Object.freeze({}),
		tags: [],
	},
	factory: () =>
		({
			id,
			config: {},
			run: async () => ({ value: id }),
		}) as never,
});

/**
 * Create a mock case definition.
 * @param id
 */
const createMockCase = (id: string): CaseDefinition<MockExpander> => ({
	case: {
		caseId: id,
		caseClass: "test",
		name: `Test Case ${id}`,
		version: "1.0.0",
		inputs: {},
	},
	getInput: async () => new MockExpander(),
	getInputs: () => ({}),
});

describe("Executor", () => {
	let executor: Executor<MockExpander, unknown, MockResult>;

	beforeEach(() => {
		executor = new Executor();
	});

	describe("plan", () => {
		it("should generate planned runs for SUTs and cases", () => {
			const suts = [createMockSut("sut1"), createMockSut("sut2")];
			const cases = [createMockCase("case1"), createMockCase("case2")];

			const planned = executor.plan(suts as never, cases as never);

			assert.strictEqual(planned.length, 4); // 2 SUTs x 2 cases
		});

		it("should include repetition in planned runs", () => {
			const executorWithRep = new Executor({ repetitions: 3 });
			const suts = [createMockSut("sut1")];
			const cases = [createMockCase("case1")];

			const planned = executorWithRep.plan(suts as never, cases as never);

			assert.strictEqual(planned.length, 3); // 1 SUT x 1 case x 3 reps
			assert.strictEqual(planned[0].repetition, 0);
			assert.strictEqual(planned[1].repetition, 1);
			assert.strictEqual(planned[2].repetition, 2);
		});

		it("should generate unique run IDs", () => {
			const suts = [createMockSut("sut1")];
			const cases = [createMockCase("case1"), createMockCase("case2")];

			const planned = executor.plan(suts as never, cases as never);
			const runIds = new Set(planned.map((r) => r.runId));

			assert.strictEqual(runIds.size, planned.length); // All unique
		});
	});

	describe("execute with plannedRuns parameter", () => {
		it("should use provided plannedRuns instead of planning", async () => {
			const inProcessExecutor = new Executor({ forceInProcess: true });
			const suts = [createMockSut("sut1")];
			const cases = [createMockCase("case1")];

			// Plan all runs
			const allPlanned = inProcessExecutor.plan(suts, cases);

			// Filter to only run the first one
			const filteredRuns = [allPlanned[0]];

			const summary = await inProcessExecutor.execute(
				suts as never,
				cases as never,
				() => ({}),
				filteredRuns,
			);

			assert.strictEqual(summary.totalRuns, 1);
			assert.strictEqual(summary.successfulRuns, 1);
		});

		it("should use filtered plannedRuns for single execution", async () => {
			const inProcessExecutor = new Executor({ forceInProcess: true });
			const suts = [createMockSut("sut1")];
			const cases = [createMockCase("case1"), createMockCase("case2")];

			// Plan all runs
			const allPlanned = inProcessExecutor.plan(suts, cases);

			// Filter to only run half
			const filteredRuns = allPlanned.slice(0, 1);

			const summary = await inProcessExecutor.execute(
				suts as never,
				cases as never,
				() => ({}),
				filteredRuns,
			);

			assert.strictEqual(summary.totalRuns, 1);
			assert.strictEqual(summary.successfulRuns, 1);
		});

		it("should plan all runs when plannedRuns is undefined", async () => {
			const inProcessExecutor = new Executor({ forceInProcess: true });
			const suts = [createMockSut("sut1")];
			const cases = [createMockCase("case1")];

			const summary = await inProcessExecutor.execute(suts as never, cases as never, () => ({}));

			assert.strictEqual(summary.totalRuns, 1);
			assert.strictEqual(summary.successfulRuns, 1);
		});

		it("should work with empty plannedRuns array", async () => {
			const inProcessExecutor = new Executor({ forceInProcess: true });
			const suts = [createMockSut("sut1")];
			const cases = [createMockCase("case1")];

			const summary = await inProcessExecutor.execute(
				suts as never,
				cases as never,
				() => ({}),
				[],
			);

			assert.strictEqual(summary.totalRuns, 0);
			assert.strictEqual(summary.successfulRuns, 0);
		});
	});

	describe("execute with parallel execution", () => {
		it("should use provided plannedRuns with concurrency > 1", async () => {
			const executorWithConcurrency = new Executor({
				concurrency: 2,
				forceInProcess: true,
			});
			const suts = [createMockSut("sut1"), createMockSut("sut2")];
			const cases = [createMockCase("case1")];

			// Plan all runs
			const allPlanned = executorWithConcurrency.plan(suts as never, cases as never);

			// Filter to only run one
			const filteredRuns = [allPlanned[0]];

			const summary = await executorWithConcurrency.execute(
				suts as never,
				cases as never,
				() => ({}),
				filteredRuns,
			);

			assert.strictEqual(summary.totalRuns, 1);
			assert.strictEqual(summary.successfulRuns, 1);
		});
	});

	describe("createExecutor", () => {
		it("should create executor with default config", () => {
			const executor = createExecutor();
			assert.ok(executor instanceof Executor);
		});

		it("should create executor with custom config", () => {
			const executor = createExecutor({ repetitions: 5 });
			assert.ok(executor instanceof Executor);
		});
	});

	describe("execute with timeout", () => {
		it("should timeout on slow resource loading", async () => {
			// Create a case with slow getInput
			const slowCase: CaseDefinition<MockExpander> = {
				case: {
					caseId: "slow-case",
					caseClass: "test",
					name: "Slow Loading Case",
					version: "1.0.0",
					inputs: {},
				},
				getInput: async () => {
					// Sleep longer than timeout
					await new Promise((resolve) => setTimeout(resolve, 200));
					return new MockExpander();
				},
				getInputs: () => ({}),
			};

			const executorWithTimeout = new Executor({
				timeoutMs: 50,
				continueOnError: true,
				forceInProcess: true,
			});
			const suts = [createMockSut("sut1")];
			const cases = [slowCase];

			const summary = await executorWithTimeout.execute(suts as never, cases as never, () => ({}));

			// Should fail due to timeout
			assert.strictEqual(summary.totalRuns, 1);
			assert.strictEqual(summary.successfulRuns, 0);
			assert.strictEqual(summary.failedRuns, 1);
		});

		it("should timeout on slow SUT execution", async () => {
			// Create a SUT with slow run
			const slowSut: SutDefinition<unknown, MockResult> = {
				registration: {
					id: "slow-sut",
					name: "Slow SUT",
					role: "primary",
					version: "1.0.0",
					config: Object.freeze({}),
					tags: [],
				},
				factory: () =>
					({
						id: "slow-sut",
						config: {},
						run: async () => {
							// Sleep longer than timeout
							await new Promise((resolve) => setTimeout(resolve, 200));
							return { value: "slow" };
						},
					}) as never,
			};

			const executorWithTimeout = new Executor({
				timeoutMs: 50,
				continueOnError: true,
				forceInProcess: true,
			});
			const suts = [slowSut];
			const cases = [createMockCase("case1")];

			const summary = await executorWithTimeout.execute(suts as never, cases as never, () => ({}));

			// Should fail due to timeout
			assert.strictEqual(summary.totalRuns, 1);
			assert.strictEqual(summary.successfulRuns, 0);
			assert.strictEqual(summary.failedRuns, 1);
		});
	});

	describe("execute with callbacks", () => {
		it("should call onProgress callback during execution", async () => {
			const progressUpdates: unknown[] = [];
			const executorWithProgress = new Executor({
				forceInProcess: true,
				onProgress: (progress) => {
					progressUpdates.push(progress);
				},
			});

			const suts = [createMockSut("sut1")];
			const cases = [createMockCase("case1")];

			await executorWithProgress.execute(suts as never, cases as never, () => ({}));

			assert.ok(progressUpdates.length > 0);
			const firstUpdate = progressUpdates[0] as { total: number; completed: number };
			assert.strictEqual(firstUpdate.total, 1);
			assert.strictEqual(firstUpdate.completed, 1);
		});

		it("should call onResult callback for each completed run", async () => {
			const results: unknown[] = [];
			const executorWithCallback = new Executor({
				forceInProcess: true,
				onResult: (result) => {
					results.push(result);
				},
			});

			const suts = [createMockSut("sut1")];
			const cases = [createMockCase("case1")];

			await executorWithCallback.execute(suts as never, cases as never, () => ({}));

			assert.strictEqual(results.length, 1);
			assert.ok(results[0]);
		});
	});
});
