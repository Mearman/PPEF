/**
 * Unit tests for schema validators
 *
 * Tests schema validation utilities for the evaluation framework.
 */

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import { deepFreeze, validateCase, validateResult, validateSutRegistration } from "../schema.js";

describe("schema validators", () => {
	describe("validateResult", () => {
		it("should validate null/undefined as invalid", () => {
			assert.strictEqual(validateResult(null).valid, false);
			assert.strictEqual(validateResult(undefined).valid, false);
		});

		it("should validate non-object as invalid", () => {
			assert.strictEqual(validateResult("string").valid, false);
			assert.strictEqual(validateResult(123).valid, false);
		});

		it("should return error for non-object result", () => {
			const result = validateResult(null);
			assert.strictEqual(result.valid, false);
			assert.deepStrictEqual(result.errors, ["Result must be an object"]);
		});

		it("should require run context", () => {
			const result = validateResult({});
			assert.strictEqual(result.valid, false);
			assert.ok(result.errors.some((e) => e.includes("Missing or invalid run context")));
		});

		it("should require runId", () => {
			const result = validateResult({ run: {} });
			assert.strictEqual(result.valid, false);
			assert.ok(result.errors.some((e) => e.includes("run.runId")));
		});

		it("should require sut", () => {
			const result = validateResult({ run: { runId: "test-1" } });
			assert.strictEqual(result.valid, false);
			assert.ok(result.errors.some((e) => e.includes("run.sut")));
		});

		it("should validate sutRole", () => {
			const result = validateResult({
				run: { runId: "test-1", sut: "sut-1", sutRole: "invalid" },
			});
			assert.strictEqual(result.valid, false);
			assert.ok(result.errors.some((e) => e.includes("sutRole")));
		});

		it("should accept valid sutRole values", () => {
			for (const role of ["primary", "baseline", "oracle"]) {
				const result = validateResult({
					run: {
						runId: "test-1",
						sut: "sut-1",
						sutRole: role,
						caseId: "case-1",
					},
				});
				assert.ok(
					!result.errors.some((e) => e.includes("sutRole")),
					`Role ${role} should be valid`,
				);
			}
		});

		it("should require caseId", () => {
			const result = validateResult({
				run: { runId: "test-1", sut: "sut-1", sutRole: "primary" },
			});
			assert.strictEqual(result.valid, false);
			assert.ok(result.errors.some((e) => e.includes("run.caseId")));
		});

		it("should require correctness", () => {
			const result = validateResult({
				run: {
					runId: "test-1",
					sut: "sut-1",
					sutRole: "primary",
					caseId: "case-1",
				},
			});
			assert.strictEqual(result.valid, false);
			assert.ok(result.errors.some((e) => e.includes("correctness")));
		});

		it("should validate correctness fields", () => {
			const result = validateResult({
				run: {
					runId: "test-1",
					sut: "sut-1",
					sutRole: "primary",
					caseId: "case-1",
				},
				correctness: {},
			});
			assert.strictEqual(result.valid, false);
			assert.ok(result.errors.some((e) => e.includes("expectedExists")));
			assert.ok(result.errors.some((e) => e.includes("producedOutput")));
			assert.ok(result.errors.some((e) => e.includes("valid")));
		});

		it("should require metrics", () => {
			const result = validateResult({
				run: {
					runId: "test-1",
					sut: "sut-1",
					sutRole: "primary",
					caseId: "case-1",
				},
				correctness: {
					expectedExists: true,
					producedOutput: true,
					valid: true,
				},
			});
			assert.strictEqual(result.valid, false);
			assert.ok(result.errors.some((e) => e.includes("metrics")));
		});

		it("should require metrics.numeric to be an object", () => {
			const result = validateResult({
				run: {
					runId: "test-1",
					sut: "sut-1",
					sutRole: "primary",
					caseId: "case-1",
				},
				correctness: {
					expectedExists: true,
					producedOutput: true,
					valid: true,
				},
				metrics: {
					numeric: "not-an-object",
				},
			});
			assert.strictEqual(result.valid, false);
			assert.ok(result.errors.some((e) => e.includes("metrics.numeric must be an object")));
		});

		it("should validate numeric metrics are finite numbers", () => {
			const result = validateResult({
				run: {
					runId: "test-1",
					sut: "sut-1",
					sutRole: "primary",
					caseId: "case-1",
				},
				correctness: {
					expectedExists: true,
					producedOutput: true,
					valid: true,
				},
				metrics: {
					numeric: {
						accuracy: 0.9,
						invalid: NaN,
						infinite: Infinity,
					},
				},
			});
			assert.strictEqual(result.valid, false);
			assert.ok(result.errors.some((e) => e.includes("invalid")));
			assert.ok(result.errors.some((e) => e.includes("infinite")));
		});

		it("should require provenance", () => {
			const result = validateResult({
				run: {
					runId: "test-1",
					sut: "sut-1",
					sutRole: "primary",
					caseId: "case-1",
				},
				correctness: {
					expectedExists: true,
					producedOutput: true,
					valid: true,
				},
				metrics: { numeric: { accuracy: 0.9 } },
			});
			assert.strictEqual(result.valid, false);
			assert.ok(result.errors.some((e) => e.includes("provenance")));
		});

		it("should validate provenance.runtime", () => {
			const result = validateResult({
				run: {
					runId: "test-1",
					sut: "sut-1",
					sutRole: "primary",
					caseId: "case-1",
				},
				correctness: {
					expectedExists: true,
					producedOutput: true,
					valid: true,
				},
				metrics: { numeric: { accuracy: 0.9 } },
				provenance: {},
			});
			assert.strictEqual(result.valid, false);
			assert.ok(result.errors.some((e) => e.includes("runtime")));
		});

		it("should validate a complete valid result", () => {
			const result = validateResult({
				run: {
					runId: "test-1",
					sut: "sut-1",
					sutRole: "primary",
					caseId: "case-1",
				},
				correctness: {
					expectedExists: true,
					producedOutput: true,
					valid: true,
				},
				metrics: {
					numeric: {
						accuracy: 0.9,
						precision: 0.85,
					},
				},
				provenance: {
					runtime: {
						durationMs: 1000,
					},
				},
			});
			assert.strictEqual(result.valid, true);
			assert.deepStrictEqual(result.errors, []);
		});
	});

	describe("validateCase", () => {
		it("should validate null/undefined as invalid", () => {
			assert.strictEqual(validateCase(null).valid, false);
			assert.strictEqual(validateCase(undefined).valid, false);
		});

		it("should validate non-object as invalid", () => {
			assert.strictEqual(validateCase("string").valid, false);
			assert.strictEqual(validateCase(123).valid, false);
		});

		it("should return error for non-object case", () => {
			const result = validateCase(null);
			assert.strictEqual(result.valid, false);
			assert.deepStrictEqual(result.errors, ["Case must be an object"]);
		});

		it("should require caseId", () => {
			const result = validateCase({});
			assert.strictEqual(result.valid, false);
			assert.ok(result.errors.some((e) => e.includes("caseId")));
		});

		it("should require non-empty caseId", () => {
			const result = validateCase({ caseId: "" });
			assert.strictEqual(result.valid, false);
			assert.ok(result.errors.some((e) => e.includes("caseId")));
		});

		it("should require inputs", () => {
			const result = validateCase({ caseId: "test-1" });
			assert.strictEqual(result.valid, false);
			assert.ok(result.errors.some((e) => e.includes("inputs")));
		});

		it("should validate a complete valid case", () => {
			const result = validateCase({
				caseId: "test-case",
				inputs: {
					summary: { nodes: 100 },
				},
			});
			assert.strictEqual(result.valid, true);
			assert.deepStrictEqual(result.errors, []);
		});

		it("should accept empty inputs object", () => {
			const result = validateCase({
				caseId: "test-case",
				inputs: {},
			});
			assert.strictEqual(result.valid, true);
			assert.deepStrictEqual(result.errors, []);
		});
	});

	describe("validateSutRegistration", () => {
		it("should validate null/undefined as invalid", () => {
			assert.strictEqual(validateSutRegistration(null).valid, false);
			assert.strictEqual(validateSutRegistration(undefined).valid, false);
		});

		it("should validate non-object as invalid", () => {
			assert.strictEqual(validateSutRegistration("string").valid, false);
			assert.strictEqual(validateSutRegistration(123).valid, false);
		});

		it("should return error for non-object registration", () => {
			const result = validateSutRegistration(null);
			assert.strictEqual(result.valid, false);
			assert.deepStrictEqual(result.errors, ["Registration must be an object"]);
		});

		it("should require id", () => {
			const result = validateSutRegistration({});
			assert.strictEqual(result.valid, false);
			assert.ok(result.errors.some((e) => e.includes("id")));
		});

		it("should require non-empty id", () => {
			const result = validateSutRegistration({ id: "" });
			assert.strictEqual(result.valid, false);
			assert.ok(result.errors.some((e) => e.includes("id")));
		});

		it("should require name", () => {
			const result = validateSutRegistration({ id: "sut-1" });
			assert.strictEqual(result.valid, false);
			assert.ok(result.errors.some((e) => e.includes("name")));
		});

		it("should require non-empty name", () => {
			const result = validateSutRegistration({ id: "sut-1", name: "" });
			assert.strictEqual(result.valid, false);
			assert.ok(result.errors.some((e) => e.includes("name")));
		});

		it("should require version", () => {
			const result = validateSutRegistration({ id: "sut-1", name: "SUT 1" });
			assert.strictEqual(result.valid, false);
			assert.ok(result.errors.some((e) => e.includes("version")));
		});

		it("should require non-empty version", () => {
			const result = validateSutRegistration({
				id: "sut-1",
				name: "SUT 1",
				version: "",
			});
			assert.strictEqual(result.valid, false);
			assert.ok(result.errors.some((e) => e.includes("version")));
		});

		it("should require valid role", () => {
			const result = validateSutRegistration({
				id: "sut-1",
				name: "SUT 1",
				version: "1.0.0",
				role: "invalid",
			});
			assert.strictEqual(result.valid, false);
			assert.ok(result.errors.some((e) => e.includes("role")));
		});

		it("should accept valid role values", () => {
			for (const role of ["primary", "baseline", "oracle"]) {
				const result = validateSutRegistration({
					id: "sut-1",
					name: "SUT 1",
					version: "1.0.0",
					role,
				});
				assert.ok(!result.errors.some((e) => e.includes("role")));
			}
		});

		it("should require config", () => {
			const result = validateSutRegistration({
				id: "sut-1",
				name: "SUT 1",
				version: "1.0.0",
				role: "primary",
			});
			assert.strictEqual(result.valid, false);
			assert.ok(result.errors.some((e) => e.includes("config")));
		});

		it("should require tags array", () => {
			const result = validateSutRegistration({
				id: "sut-1",
				name: "SUT 1",
				version: "1.0.0",
				role: "primary",
				config: {},
				tags: "not-an-array",
			});
			assert.strictEqual(result.valid, false);
			assert.ok(result.errors.some((e) => e.includes("tags")));
		});

		it("should validate a complete valid registration", () => {
			const result = validateSutRegistration({
				id: "sut-1",
				name: "SUT 1",
				version: "1.0.0",
				role: "primary",
				config: { option: true },
				tags: ["expansion", "baseline"],
			});
			assert.strictEqual(result.valid, true);
			assert.deepStrictEqual(result.errors, []);
		});
	});

	describe("deepFreeze", () => {
		it("should freeze an object", () => {
			const obj = { a: 1 };
			const frozen = deepFreeze(obj);
			assert.strictEqual(Object.isFrozen(frozen), true);
		});

		it("should freeze nested objects", () => {
			const obj = { a: { b: 1 } };
			const frozen = deepFreeze(obj);
			assert.strictEqual(Object.isFrozen(frozen), true);
			assert.strictEqual(Object.isFrozen(frozen.a), true);
		});

		it("should freeze deeply nested objects", () => {
			const obj = { a: { b: { c: { d: 1 } } } };
			const frozen = deepFreeze(obj);
			assert.strictEqual(Object.isFrozen(frozen), true);
			assert.strictEqual(Object.isFrozen(frozen.a), true);
			assert.strictEqual(Object.isFrozen(frozen.a.b), true);
			assert.strictEqual(Object.isFrozen(frozen.a.b.c), true);
		});

		it("should freeze objects with arrays", () => {
			const obj = { a: [1, 2, 3] };
			const frozen = deepFreeze(obj);
			assert.strictEqual(Object.isFrozen(frozen), true);
			assert.strictEqual(Object.isFrozen(frozen.a), true);
		});

		it("should return the same object reference", () => {
			const obj = { a: 1 };
			const frozen = deepFreeze(obj);
			assert.strictEqual(frozen, obj);
		});

		it("should handle empty objects", () => {
			const obj = {};
			const frozen = deepFreeze(obj);
			assert.strictEqual(Object.isFrozen(frozen), true);
		});

		it("should not freeze already frozen objects' children twice", () => {
			const child = { b: 1 };
			Object.freeze(child);
			const obj = { a: child };
			const frozen = deepFreeze(obj);
			assert.strictEqual(Object.isFrozen(frozen), true);
			assert.strictEqual(Object.isFrozen(frozen.a), true);
		});
	});
});
