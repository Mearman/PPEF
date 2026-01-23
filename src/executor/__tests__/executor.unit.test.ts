/**
 * Unit tests for Executor
 *
 * Tests executor behavior including planned runs filtering.
 */

import { beforeEach, describe, it } from "node:test";
import { strict as assert } from "node:assert";

import type { CaseDefinition } from "../../types/case.js";
import type { SutDefinition } from "../../types/sut.js";
import { Executor } from "../executor.js";

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
			const suts = [createMockSut("sut1")];
			const cases = [createMockCase("case1")];

			// Plan all runs
			const allPlanned = executor.plan(suts, cases);

			// Filter to only run the first one
			const filteredRuns = [allPlanned[0]];

			const summary = await executor.execute(
				suts as never,
				cases as never,
				() => ({}),
				filteredRuns,
			);

			assert.strictEqual(summary.totalRuns, 1);
			assert.strictEqual(summary.successfulRuns, 1);
		});

		it("should use filtered plannedRuns for single execution", async () => {
			const suts = [createMockSut("sut1")];
			const cases = [createMockCase("case1"), createMockCase("case2")];

			// Plan all runs
			const allPlanned = executor.plan(suts, cases);

			// Filter to only run half
			const filteredRuns = allPlanned.slice(0, 1);

			const summary = await executor.execute(
				suts as never,
				cases as never,
				() => ({}),
				filteredRuns,
			);

			assert.strictEqual(summary.totalRuns, 1);
			assert.strictEqual(summary.successfulRuns, 1);
		});

		it("should plan all runs when plannedRuns is undefined", async () => {
			const suts = [createMockSut("sut1")];
			const cases = [createMockCase("case1")];

			const summary = await executor.execute(suts as never, cases as never, () => ({}));

			assert.strictEqual(summary.totalRuns, 1);
			assert.strictEqual(summary.successfulRuns, 1);
		});

		it("should work with empty plannedRuns array", async () => {
			const suts = [createMockSut("sut1")];
			const cases = [createMockCase("case1")];

			const summary = await executor.execute(suts as never, cases as never, () => ({}), []);

			assert.strictEqual(summary.totalRuns, 0);
			assert.strictEqual(summary.successfulRuns, 0);
		});
	});

	describe("execute with parallel execution", () => {
		it("should use provided plannedRuns with concurrency > 1", async () => {
			const executorWithConcurrency = new Executor({ concurrency: 2 });
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
});
