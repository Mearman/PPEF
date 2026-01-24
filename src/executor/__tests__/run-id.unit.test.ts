/**
 * Unit tests for run-id generation
 *
 * Tests deterministic run ID generation, config hashing,
 * run ID validation, and parsing.
 */

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import {
	generateRunId,
	generateConfigHash,
	validateRunId,
	parseRunId,
	type RunIdInputs,
} from "../run-id.js";

describe("generateRunId", () => {
	it("should generate consistent IDs for same inputs", () => {
		const inputs: RunIdInputs = {
			sutId: "degree-prioritised-v1.0.0",
			caseId: "karate-v1",
			seed: 42,
			repetition: 1,
		};

		const id1 = generateRunId(inputs);
		const id2 = generateRunId(inputs);

		assert.strictEqual(id1, id2);
		assert.strictEqual(id1.length, 16);
	});

	it("should generate different IDs for different inputs", () => {
		const inputs1: RunIdInputs = {
			sutId: "sut-1",
			caseId: "case-1",
			seed: 42,
		};
		const inputs2: RunIdInputs = {
			sutId: "sut-2",
			caseId: "case-1",
			seed: 42,
		};

		assert.notStrictEqual(generateRunId(inputs1), generateRunId(inputs2));
	});

	it("should handle optional fields", () => {
		const inputs1: RunIdInputs = {
			sutId: "sut-1",
			caseId: "case-1",
		};
		const inputs2: RunIdInputs = {
			sutId: "sut-1",
			caseId: "case-1",
			seed: 42,
			repetition: 1,
			configHash: "abc123",
		};

		assert.strictEqual(generateRunId(inputs1).length, 16);
		assert.strictEqual(generateRunId(inputs2).length, 16);
		assert.notStrictEqual(generateRunId(inputs1), generateRunId(inputs2));
	});

	it("should generate lowercase hex strings", () => {
		const inputs: RunIdInputs = { sutId: "test", caseId: "test" };
		const id = generateRunId(inputs);

		assert.ok(/^[0-9a-f]{16}$/.test(id));
	});
});

describe("generateConfigHash", () => {
	it("should generate consistent hashes for same config", () => {
		const config = { threshold: 0.9, iterations: 100 };

		const hash1 = generateConfigHash(config);
		const hash2 = generateConfigHash(config);

		assert.strictEqual(hash1, hash2);
		assert.strictEqual(hash1.length, 8);
	});

	it("should generate different hashes for different configs", () => {
		const config1 = { threshold: 0.9 };
		const config2 = { threshold: 0.5 };

		assert.notStrictEqual(generateConfigHash(config1), generateConfigHash(config2));
	});

	it("should handle nested objects", () => {
		const config1 = { nested: { value: 1 } };
		const config2 = { nested: { value: 2 } };

		assert.notStrictEqual(generateConfigHash(config1), generateConfigHash(config2));
	});

	it("should handle arrays", () => {
		const config1 = { items: [1, 2, 3] };
		const config2 = { items: [1, 2, 4] };

		assert.notStrictEqual(generateConfigHash(config1), generateConfigHash(config2));
	});

	it("should generate lowercase hex strings", () => {
		const hash = generateConfigHash({ test: true });
		assert.ok(/^[0-9a-f]{8}$/.test(hash));
	});

	it("should handle empty config", () => {
		const hash = generateConfigHash({});
		assert.strictEqual(hash.length, 8);
	});

	it("should be order-independent due to key sorting", () => {
		const hash1 = generateConfigHash({ a: 1, b: 2, c: 3 });
		const hash2 = generateConfigHash({ c: 3, a: 1, b: 2 });

		assert.strictEqual(hash1, hash2);
	});
});

describe("validateRunId", () => {
	it("should return true for matching run ID", () => {
		const inputs: RunIdInputs = { sutId: "test", caseId: "case" };
		const runId = generateRunId(inputs);

		assert.strictEqual(validateRunId(runId, inputs), true);
	});

	it("should return false for non-matching run ID", () => {
		const inputs: RunIdInputs = { sutId: "test", caseId: "case" };
		const runId = generateRunId({ sutId: "other", caseId: "case" });

		assert.strictEqual(validateRunId(runId, inputs), false);
	});

	it("should return false for invalid run ID format", () => {
		const inputs: RunIdInputs = { sutId: "test", caseId: "case" };

		assert.strictEqual(validateRunId("not-a-valid-id", inputs), false);
		assert.strictEqual(validateRunId("", inputs), false);
		assert.strictEqual(validateRunId("abc", inputs), false);
	});
});

describe("parseRunId", () => {
	it("should validate correctly formatted run IDs", () => {
		const result = parseRunId("abc123def4567890");

		assert.strictEqual(result.valid, true);
		assert.strictEqual(result.length, 16);
	});

	it("should reject run IDs with wrong length", () => {
		const result = parseRunId("abc123");

		assert.strictEqual(result.valid, false);
		assert.strictEqual(result.length, 6);
	});

	it("should reject run IDs with non-hex characters", () => {
		const result = parseRunId("abc123xyz4567890");

		assert.strictEqual(result.valid, false);
		assert.strictEqual(result.length, 16);
	});

	it("should accept uppercase letters (hex is case-insensitive)", () => {
		const result = parseRunId("ABC123DEF4567890");

		// The implementation uses case-insensitive regex, so uppercase is valid
		assert.strictEqual(result.valid, true);
		assert.strictEqual(result.length, 16);
	});

	it("should reject empty string", () => {
		const result = parseRunId("");

		assert.strictEqual(result.valid, false);
		assert.strictEqual(result.length, 0);
	});

	it("should reject strings with special characters", () => {
		const result = parseRunId("abc-123-def-456");

		assert.strictEqual(result.valid, false);
		assert.strictEqual(result.length, 15);
	});

	it("should accept all zeros", () => {
		const result = parseRunId("0000000000000000");

		assert.strictEqual(result.valid, true);
		assert.strictEqual(result.length, 16);
	});

	it("should accept all f's", () => {
		const result = parseRunId("ffffffffffffffff");

		assert.strictEqual(result.valid, true);
		assert.strictEqual(result.length, 16);
	});
});
