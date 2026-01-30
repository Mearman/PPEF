/**
 * Unit tests for JsonSchemaValidator
 *
 * Tests JSON Schema compilation, validation pass/fail, error formatting,
 * and the createValidator factory function.
 */

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import {
	JsonSchemaValidator,
	createValidator,
	formatValidationErrors,
} from "../json-schema-validator.js";

describe("JsonSchemaValidator", () => {
	describe("constructor", () => {
		it("should compile a valid JSON Schema", () => {
			const schema = {
				type: "object",
				properties: {
					name: { type: "string" },
				},
				required: ["name"],
			};

			const validator = new JsonSchemaValidator(schema);
			assert.ok(validator);
		});

		it("should compile a schema with nested objects", () => {
			const schema = {
				type: "object",
				properties: {
					data: {
						type: "object",
						properties: {
							items: { type: "array", items: { type: "number" } },
						},
					},
				},
			};

			const validator = new JsonSchemaValidator(schema);
			assert.ok(validator);
		});
	});

	describe("validate", () => {
		it("should pass for valid data", () => {
			const schema = {
				type: "object",
				properties: {
					name: { type: "string" },
					value: { type: "number" },
				},
				required: ["name", "value"],
			};

			const validator = new JsonSchemaValidator(schema);
			const result = validator.validate({ name: "test", value: 42 });

			assert.strictEqual(result.success, true);
			assert.strictEqual(result.errors.length, 0);
		});

		it("should fail for missing required properties", () => {
			const schema = {
				type: "object",
				properties: {
					name: { type: "string" },
					value: { type: "number" },
				},
				required: ["name", "value"],
			};

			const validator = new JsonSchemaValidator(schema);
			const result = validator.validate({ name: "test" });

			assert.strictEqual(result.success, false);
			assert.ok(result.errors.length > 0);
		});

		it("should fail for wrong type", () => {
			const schema = {
				type: "object",
				properties: {
					count: { type: "integer" },
				},
				required: ["count"],
			};

			const validator = new JsonSchemaValidator(schema);
			const result = validator.validate({ count: "not-a-number" });

			assert.strictEqual(result.success, false);
			assert.ok(result.errors.length > 0);
		});

		it("should pass for data with optional properties", () => {
			const schema = {
				type: "object",
				properties: {
					name: { type: "string" },
					description: { type: "string" },
				},
				required: ["name"],
			};

			const validator = new JsonSchemaValidator(schema);
			const result = validator.validate({ name: "test" });

			assert.strictEqual(result.success, true);
		});

		it("should validate array items", () => {
			const schema = {
				type: "object",
				properties: {
					sorted: {
						type: "array",
						items: { type: "number" },
					},
				},
				required: ["sorted"],
			};

			const validator = new JsonSchemaValidator(schema);

			const validResult = validator.validate({ sorted: [1, 2, 3] });
			assert.strictEqual(validResult.success, true);

			const invalidResult = validator.validate({ sorted: ["a", "b"] });
			assert.strictEqual(invalidResult.success, false);
		});

		it("should validate primitive types at root", () => {
			const schema = { type: "string" };

			const validator = new JsonSchemaValidator(schema);

			assert.strictEqual(validator.validate("hello").success, true);
			assert.strictEqual(validator.validate(42).success, false);
		});
	});
});

describe("createValidator", () => {
	it("should return undefined for undefined schema", () => {
		const result = createValidator(undefined);
		assert.strictEqual(result, undefined);
	});

	it("should return a validator for a valid schema", () => {
		const schema = {
			type: "object",
			properties: { x: { type: "number" } },
		};

		const validator = createValidator(schema);
		assert.ok(validator);
		assert.ok(validator instanceof JsonSchemaValidator);
	});

	it("should return a working validator", () => {
		const schema = {
			type: "object",
			properties: { x: { type: "number" } },
			required: ["x"],
		};

		const validator = createValidator(schema);
		assert.ok(validator);
		assert.strictEqual(validator.validate({ x: 1 }).success, true);
		assert.strictEqual(validator.validate({}).success, false);
	});
});

describe("formatValidationErrors", () => {
	it("should format errors with paths", () => {
		const issues = [
			{
				path: ["data", "items"],
				message: "Expected array, received string",
			},
		];

		const formatted = formatValidationErrors(issues);

		assert.strictEqual(formatted.length, 1);
		assert.ok(formatted[0].includes("data.items"));
		assert.ok(formatted[0].includes("Expected array"));
	});

	it("should handle root-level errors", () => {
		const issues = [
			{
				path: [],
				message: "Expected object, received string",
			},
		];

		const formatted = formatValidationErrors(issues);

		assert.strictEqual(formatted.length, 1);
		assert.ok(formatted[0].includes("(root)"));
	});
});
