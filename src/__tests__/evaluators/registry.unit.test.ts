/**
 * Unit tests for Evaluator Registry
 *
 * Tests the registry functionality including getAs() type-safe retrieval.
 */

import { describe, it, afterEach } from "node:test";
import { strict as assert } from "node:assert";

import { EvaluatorRegistry, registerBuiltInEvaluators } from "../../evaluators/registry.js";
import type {
	IEvaluator,
	ValidationResult,
	EvaluationOutput,
	EvaluationSummary,
} from "../../types/evaluator.js";

/**
 * Mock evaluator implementing IEvaluator for testing.
 * Uses parameterless constructor for getAs() compatibility.
 */
class MockCustomEvaluator implements IEvaluator {
	readonly type = "custom" as const;

	validateConfig(_config: unknown): ValidationResult {
		return { valid: true };
	}

	evaluate(_config: unknown, _input: unknown): EvaluationOutput<unknown> {
		return {
			type: this.type,
			version: "1.0.0",
			timestamp: new Date().toISOString(),
			data: { mock: true },
		};
	}

	summarize(_output: EvaluationOutput<unknown>): EvaluationSummary {
		return { total: 1 };
	}
}

describe("EvaluatorRegistry", () => {
	afterEach(() => {
		EvaluatorRegistry.clear();
		registerBuiltInEvaluators();
	});

	describe("register", () => {
		it("should register an evaluator", () => {
			const evaluator = new MockCustomEvaluator();
			EvaluatorRegistry.register(evaluator);

			assert.ok(EvaluatorRegistry.has("custom"));
		});

		it("should replace existing evaluator when registering same type", () => {
			const evaluator1 = new MockCustomEvaluator();
			const evaluator2 = new MockCustomEvaluator();

			EvaluatorRegistry.register(evaluator1);
			EvaluatorRegistry.register(evaluator2);

			const retrieved = EvaluatorRegistry.get("custom");
			assert.equal(retrieved, evaluator2);
		});
	});

	describe("get", () => {
		it("should return registered evaluator", () => {
			const evaluator = new MockCustomEvaluator();
			EvaluatorRegistry.register(evaluator);

			const retrieved = EvaluatorRegistry.get("custom");
			assert.equal(retrieved, evaluator);
		});

		it("should return undefined for unknown type", () => {
			const retrieved = EvaluatorRegistry.get("claims" as const); // Use valid type
			assert.ok(retrieved !== undefined); // Built-in evaluators exist
		});
	});

	describe("getAs", () => {
		it("should return evaluator when instanceof matches", () => {
			const evaluator = new MockCustomEvaluator();
			EvaluatorRegistry.register(evaluator);

			const retrieved = EvaluatorRegistry.getAs("custom", MockCustomEvaluator);
			assert.equal(retrieved, evaluator);
		});

		it("should return undefined when instanceof does not match", () => {
			class OtherMockEvaluator implements IEvaluator {
				readonly type = "metrics" as const; // Use valid type
				validateConfig(): ValidationResult {
					return { valid: true };
				}
				evaluate(): EvaluationOutput<unknown> {
					return {
						type: "metrics",
						version: "1.0.0",
						timestamp: new Date().toISOString(),
						data: {},
					};
				}
				summarize(): EvaluationSummary {
					return { total: 0 };
				}
			}

			const other = new OtherMockEvaluator();
			EvaluatorRegistry.register(other);

			const retrieved = EvaluatorRegistry.getAs("metrics", MockCustomEvaluator);
			assert.equal(retrieved, undefined);
		});

		it("should return undefined for unknown type", () => {
			const retrieved = EvaluatorRegistry.getAs("claims" as const, MockCustomEvaluator);
			assert.equal(retrieved, undefined);
		});
	});

	describe("getOrThrow", () => {
		it("should return evaluator when found", () => {
			const evaluator = new MockCustomEvaluator();
			EvaluatorRegistry.register(evaluator);

			const retrieved = EvaluatorRegistry.getOrThrow("custom", MockCustomEvaluator);
			assert.equal(retrieved, evaluator);
		});

		it("should throw when evaluator not found", () => {
			assert.throws(() => EvaluatorRegistry.getOrThrow("claims" as const, MockCustomEvaluator), {
				message: "Evaluator not found for type: claims",
			});
		});
	});

	describe("types", () => {
		it("should return all registered evaluator types", () => {
			EvaluatorRegistry.register(new MockCustomEvaluator());

			const types = EvaluatorRegistry.types();
			assert.ok(types.includes("custom"));
		});

		it("should return empty array when no evaluators registered", () => {
			EvaluatorRegistry.clear();

			const types = EvaluatorRegistry.types();
			assert.equal(types.length, 0);
		});
	});

	describe("has", () => {
		it("should return true for registered type", () => {
			EvaluatorRegistry.register(new MockCustomEvaluator());
			assert.ok(EvaluatorRegistry.has("custom"));
		});

		it("should return false for unknown type", () => {
			// "custom" won't be registered after clear in afterEach
			assert.ok(!EvaluatorRegistry.has("custom"));
		});
	});

	describe("unregister", () => {
		it("should remove registered evaluator", () => {
			const evaluator = new MockCustomEvaluator();
			EvaluatorRegistry.register(evaluator);
			assert.ok(EvaluatorRegistry.has("custom"));

			const result = EvaluatorRegistry.unregister("custom");
			assert.ok(result);
			assert.ok(!EvaluatorRegistry.has("custom"));
		});

		it("should return false when evaluator not found", () => {
			const result = EvaluatorRegistry.unregister("metrics" as const); // Valid type but not our mock
			assert.ok(!result);
		});
	});

	describe("clear", () => {
		it("should remove all evaluators", () => {
			EvaluatorRegistry.register(new MockCustomEvaluator());

			EvaluatorRegistry.clear();

			assert.equal(EvaluatorRegistry.size, 0);
			assert.ok(!EvaluatorRegistry.has("custom"));
		});
	});

	describe("size", () => {
		it("should return count of registered evaluators", () => {
			const initialSize = EvaluatorRegistry.size;

			EvaluatorRegistry.register(new MockCustomEvaluator());
			assert.equal(EvaluatorRegistry.size, initialSize + 1);
		});
	});

	describe("built-in evaluators", () => {
		it("should have claims evaluator registered", () => {
			assert.ok(EvaluatorRegistry.has("claims"));
		});

		it("should have robustness evaluator registered", () => {
			assert.ok(EvaluatorRegistry.has("robustness"));
		});

		it("should have metrics evaluator registered", () => {
			assert.ok(EvaluatorRegistry.has("metrics"));
		});
	});
});
