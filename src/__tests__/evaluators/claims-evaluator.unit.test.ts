/**
 * Unit tests for Claims Evaluator
 *
 * Tests the claims evaluator functionality including edge cases
 * for different directions, thresholds, and the summarize method.
 */

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import { ClaimsEvaluator } from "../../evaluators/claims-evaluator.js";
import { createMockAggregate, createMockSummaryStats } from "../test-helpers.js";
import type {
	ClaimsEvaluatorConfig,
	EvaluationContext,
	EvaluationOutput,
} from "../../types/evaluator.js";
import type { EvaluationClaim } from "../../types/claims.js";

/**
 * Test helpers
 */

function createTestClaim(overrides?: Partial<EvaluationClaim>): EvaluationClaim {
	return {
		claimId: "C001",
		description: "Test claim",
		sut: "primary-sut",
		baseline: "baseline-sut",
		metric: "execution-time",
		direction: "less",
		scope: "global",
		...overrides,
	};
}

function createTestContext(
	aggregates: ReturnType<typeof createMockAggregate>[],
): EvaluationContext {
	return {
		aggregates,
		metadata: { source: "test" },
	};
}

describe("ClaimsEvaluator - edge cases", () => {
	const evaluator = new ClaimsEvaluator();

	describe("greater direction - uncovered branches", () => {
		it("should satisfy when delta > 0 without threshold", () => {
			const claim = createTestClaim({
				sut: "high-value",
				baseline: "low-value",
				metric: "accuracy",
				direction: "greater",
			});

			const aggregates = [
				createMockAggregate("high-value", "primary", undefined, {
					accuracy: createMockSummaryStats([0.85]),
				}),
				createMockAggregate("low-value", "baseline", undefined, {
					accuracy: createMockSummaryStats([0.75]),
				}),
			];

			const context = createTestContext(aggregates);
			const config: ClaimsEvaluatorConfig = { claims: [claim] };
			const output = evaluator.evaluate(config, context);

			assert.equal(output.data.evaluations[0].status, "satisfied");
		});

		it("should violate when delta <= 0 without threshold", () => {
			const claim = createTestClaim({
				sut: "low-value",
				baseline: "high-value",
				metric: "accuracy",
				direction: "greater",
			});

			const aggregates = [
				createMockAggregate("low-value", "primary", undefined, {
					accuracy: createMockSummaryStats([0.75]),
				}),
				createMockAggregate("high-value", "baseline", undefined, {
					accuracy: createMockSummaryStats([0.85]),
				}),
			];

			const context = createTestContext(aggregates);
			const config: ClaimsEvaluatorConfig = { claims: [claim] };
			const output = evaluator.evaluate(config, context);

			assert.equal(output.data.evaluations[0].status, "violated");
		});

		it("should violate when delta == 0 without threshold", () => {
			const claim = createTestClaim({
				sut: "sut-a",
				baseline: "sut-b",
				metric: "accuracy",
				direction: "greater",
			});

			const aggregates = [
				createMockAggregate("sut-a", "primary", undefined, {
					accuracy: createMockSummaryStats([0.8]),
				}),
				createMockAggregate("sut-b", "baseline", undefined, {
					accuracy: createMockSummaryStats([0.8]),
				}),
			];

			const context = createTestContext(aggregates);
			const config: ClaimsEvaluatorConfig = { claims: [claim] };
			const output = evaluator.evaluate(config, context);

			assert.equal(output.data.evaluations[0].status, "violated");
		});
	});

	describe("less direction - uncovered branches", () => {
		it("should satisfy when delta < 0 without threshold", () => {
			const claim = createTestClaim({
				sut: "low-value",
				baseline: "high-value",
				metric: "execution-time",
				direction: "less",
			});

			const aggregates = [
				createMockAggregate("low-value", "primary", undefined, {
					"execution-time": createMockSummaryStats([80]),
				}),
				createMockAggregate("high-value", "baseline", undefined, {
					"execution-time": createMockSummaryStats([120]),
				}),
			];

			const context = createTestContext(aggregates);
			const config: ClaimsEvaluatorConfig = { claims: [claim] };
			const output = evaluator.evaluate(config, context);

			assert.equal(output.data.evaluations[0].status, "satisfied");
		});

		it("should violate when delta >= 0 without threshold", () => {
			const claim = createTestClaim({
				sut: "high-value",
				baseline: "low-value",
				metric: "execution-time",
				direction: "less",
			});

			const aggregates = [
				createMockAggregate("high-value", "primary", undefined, {
					"execution-time": createMockSummaryStats([120]),
				}),
				createMockAggregate("low-value", "baseline", undefined, {
					"execution-time": createMockSummaryStats([80]),
				}),
			];

			const context = createTestContext(aggregates);
			const config: ClaimsEvaluatorConfig = { claims: [claim] };
			const output = evaluator.evaluate(config, context);

			assert.equal(output.data.evaluations[0].status, "violated");
		});

		it("should violate when delta == 0 without threshold", () => {
			const claim = createTestClaim({
				sut: "sut-a",
				baseline: "sut-b",
				metric: "execution-time",
				direction: "less",
			});

			const aggregates = [
				createMockAggregate("sut-a", "primary", undefined, {
					"execution-time": createMockSummaryStats([100]),
				}),
				createMockAggregate("sut-b", "baseline", undefined, {
					"execution-time": createMockSummaryStats([100]),
				}),
			];

			const context = createTestContext(aggregates);
			const config: ClaimsEvaluatorConfig = { claims: [claim] };
			const output = evaluator.evaluate(config, context);

			assert.equal(output.data.evaluations[0].status, "violated");
		});

		it("should satisfy when delta <= -threshold", () => {
			const claim = createTestClaim({
				sut: "low-value",
				baseline: "high-value",
				metric: "execution-time",
				direction: "less",
				threshold: 10,
			});

			const aggregates = [
				createMockAggregate("low-value", "primary", undefined, {
					"execution-time": createMockSummaryStats([80]),
				}),
				createMockAggregate("high-value", "baseline", undefined, {
					"execution-time": createMockSummaryStats([100]),
				}),
			];

			const context = createTestContext(aggregates);
			const config: ClaimsEvaluatorConfig = { claims: [claim] };
			const output = evaluator.evaluate(config, context);

			// delta = -20, threshold = 10, -20 <= -10 is true
			assert.equal(output.data.evaluations[0].status, "satisfied");
		});

		it("should violate when delta > -threshold", () => {
			const claim = createTestClaim({
				sut: "low-value",
				baseline: "high-value",
				metric: "execution-time",
				direction: "less",
				threshold: 50,
			});

			const aggregates = [
				createMockAggregate("low-value", "primary", undefined, {
					"execution-time": createMockSummaryStats([80]),
				}),
				createMockAggregate("high-value", "baseline", undefined, {
					"execution-time": createMockSummaryStats([100]),
				}),
			];

			const context = createTestContext(aggregates);
			const config: ClaimsEvaluatorConfig = { claims: [claim] };
			const output = evaluator.evaluate(config, context);

			// delta = -20, threshold = 50, -20 > -50 is true, so violated
			assert.equal(output.data.evaluations[0].status, "violated");
		});
	});

	describe("equal direction - uncovered branches", () => {
		it("should satisfy when delta within default epsilon", () => {
			const claim = createTestClaim({
				sut: "sut-a",
				baseline: "sut-b",
				metric: "output-size",
				direction: "equal",
			});

			const aggregates = [
				createMockAggregate("sut-a", "primary", undefined, {
					"output-size": createMockSummaryStats([100.0005]),
				}),
				createMockAggregate("sut-b", "baseline", undefined, {
					"output-size": createMockSummaryStats([100]),
				}),
			];

			const context = createTestContext(aggregates);
			const config: ClaimsEvaluatorConfig = { claims: [claim] };
			const output = evaluator.evaluate(config, context);

			// |100.0005 - 100| = 0.0005 <= 0.001 (default epsilon)
			assert.equal(output.data.evaluations[0].status, "satisfied");
		});

		it("should violate when delta exceeds default epsilon", () => {
			const claim = createTestClaim({
				sut: "sut-a",
				baseline: "sut-b",
				metric: "output-size",
				direction: "equal",
			});

			const aggregates = [
				createMockAggregate("sut-a", "primary", undefined, {
					"output-size": createMockSummaryStats([105]),
				}),
				createMockAggregate("sut-b", "baseline", undefined, {
					"output-size": createMockSummaryStats([100]),
				}),
			];

			const context = createTestContext(aggregates);
			const config: ClaimsEvaluatorConfig = { claims: [claim] };
			const output = evaluator.evaluate(config, context);

			// |105 - 100| = 5 > 0.001
			assert.equal(output.data.evaluations[0].status, "violated");
		});

		it("should use custom epsilon when threshold provided", () => {
			const claim = createTestClaim({
				sut: "sut-a",
				baseline: "sut-b",
				metric: "output-size",
				direction: "equal",
				threshold: 10,
			});

			const aggregates = [
				createMockAggregate("sut-a", "primary", undefined, {
					"output-size": createMockSummaryStats([108]),
				}),
				createMockAggregate("sut-b", "baseline", undefined, {
					"output-size": createMockSummaryStats([100]),
				}),
			];

			const context = createTestContext(aggregates);
			const config: ClaimsEvaluatorConfig = { claims: [claim] };
			const output = evaluator.evaluate(config, context);

			// |108 - 100| = 8 <= 10
			assert.equal(output.data.evaluations[0].status, "satisfied");
		});

		it("should violate when delta exceeds custom epsilon", () => {
			const claim = createTestClaim({
				sut: "sut-a",
				baseline: "sut-b",
				metric: "output-size",
				direction: "equal",
				threshold: 5,
			});

			const aggregates = [
				createMockAggregate("sut-a", "primary", undefined, {
					"output-size": createMockSummaryStats([108]),
				}),
				createMockAggregate("sut-b", "baseline", undefined, {
					"output-size": createMockSummaryStats([100]),
				}),
			];

			const context = createTestContext(aggregates);
			const config: ClaimsEvaluatorConfig = { claims: [claim] };
			const output = evaluator.evaluate(config, context);

			// |108 - 100| = 8 > 5
			assert.equal(output.data.evaluations[0].status, "violated");
		});
	});

	describe("summarize method", () => {
		it("should map satisfied to passed and satisfactionRate to passRate", () => {
			const claim = createTestClaim({
				sut: "primary-sut",
				baseline: "baseline-sut",
				metric: "accuracy",
				direction: "greater",
			});

			const aggregates = [
				createMockAggregate("primary-sut", "primary", undefined, {
					accuracy: createMockSummaryStats([0.85]),
				}),
				createMockAggregate("baseline-sut", "baseline", undefined, {
					accuracy: createMockSummaryStats([0.75]),
				}),
			];

			const context = createTestContext(aggregates);
			const config: ClaimsEvaluatorConfig = { claims: [claim] };
			const output = evaluator.evaluate(config, context);
			const summary = evaluator.summarize(output);

			assert.equal(summary.total, 1);
			assert.equal(summary.passed, 1);
			assert.equal(summary.failed, 0);
			assert.equal(summary.passRate, 1);
			assert.equal(summary.additional?.satisfactionRate, 1);
		});

		it("should map violated to failed", () => {
			const claim = createTestClaim({
				sut: "primary-sut",
				baseline: "baseline-sut",
				metric: "accuracy",
				direction: "greater",
			});

			const aggregates = [
				createMockAggregate("primary-sut", "primary", undefined, {
					accuracy: createMockSummaryStats([0.75]),
				}),
				createMockAggregate("baseline-sut", "baseline", undefined, {
					accuracy: createMockSummaryStats([0.85]),
				}),
			];

			const context = createTestContext(aggregates);
			const config: ClaimsEvaluatorConfig = { claims: [claim] };
			const output = evaluator.evaluate(config, context);
			const summary = evaluator.summarize(output);

			assert.equal(summary.total, 1);
			assert.equal(summary.passed, 0);
			assert.equal(summary.failed, 1);
			assert.equal(summary.passRate, 0);
		});

		it("should handle mixed results with correct satisfaction rate", () => {
			const claims = [
				createTestClaim({
					claimId: "C001",
					sut: "sut-1",
					baseline: "sut-2",
					metric: "accuracy",
					direction: "greater",
				}),
				createTestClaim({
					claimId: "C002",
					sut: "sut-1",
					baseline: "sut-2",
					metric: "accuracy",
					direction: "greater",
				}),
				createTestClaim({
					claimId: "C003",
					sut: "sut-1",
					baseline: "sut-2",
					metric: "accuracy",
					direction: "greater",
				}),
			];

			const aggregates = [
				createMockAggregate("sut-1", "primary", undefined, {
					accuracy: createMockSummaryStats([0.85]),
				}),
				createMockAggregate("sut-2", "baseline", undefined, {
					accuracy: createMockSummaryStats([0.75]),
				}),
			];

			const context = createTestContext(aggregates);
			const config: ClaimsEvaluatorConfig = { claims };
			const output = evaluator.evaluate(config, context);
			const summary = evaluator.summarize(output);

			assert.equal(summary.total, 3);
			assert.equal(summary.passed, 3);
			assert.equal(summary.failed, 0);
			assert.equal(summary.passRate, 1);
		});

		it("should handle inconclusive results correctly", () => {
			const claim = createTestClaim({
				sut: "missing-sut",
				baseline: "baseline-sut",
				metric: "accuracy",
				direction: "greater",
			});

			const aggregates = [
				createMockAggregate("baseline-sut", "baseline", undefined, {
					accuracy: createMockSummaryStats([0.75]),
				}),
			];

			const context = createTestContext(aggregates);
			const config: ClaimsEvaluatorConfig = { claims: [claim] };
			const output = evaluator.evaluate(config, context);
			const summary = evaluator.summarize(output);

			assert.equal(summary.total, 1);
			assert.equal(summary.passed, 0);
			assert.equal(summary.failed, 0);
			assert.equal(summary.inconclusive, 1);
			assert.equal(summary.passRate, 0);
		});
	});
});
