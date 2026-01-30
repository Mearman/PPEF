/**
 * JSON Schema Validator
 *
 * Compiles JSON Schema objects into Zod validators for runtime validation
 * of experiment inputs and outputs. Uses z.fromJSONSchema() (Zod 4.3+)
 * to convert JSON Schema → Zod schema once, then validates via .safeParse().
 */

import { z } from "zod";

/**
 * Result of validating data against a JSON Schema.
 */
export interface SchemaValidationResult {
	/** Whether validation passed */
	success: boolean;

	/** User-friendly error messages with JSON paths (empty on success) */
	errors: string[];
}

/** Minimal issue shape from Zod's safeParse error output. */
interface ValidationIssue {
	path: (string | number)[];
	message: string;
}

/**
 * Formats Zod validation errors into user-friendly messages with JSON paths.
 *
 * @param issues - Zod validation issues from safeParse
 * @returns Array of formatted error strings
 */
export function formatValidationErrors(issues: ValidationIssue[]): string[] {
	// TODO: User contribution opportunity — see plan section 9
	return issues.map((issue) => {
		const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
		return `${path}: ${issue.message}`;
	});
}

/**
 * Validates data against a pre-compiled JSON Schema.
 *
 * Compiles the schema once on construction; validate() calls use
 * the pre-compiled Zod schema's .safeParse() for efficiency.
 */
export class JsonSchemaValidator {
	private readonly schema: z.ZodType;

	/**
	 * @param jsonSchema - A JSON Schema object (draft-2020-12, draft-07, or draft-04)
	 * @throws If the JSON Schema cannot be compiled into a Zod schema
	 */
	constructor(jsonSchema: Record<string, unknown>) {
		this.schema = z.fromJSONSchema(jsonSchema);
	}

	/**
	 * Validate data against the compiled schema.
	 *
	 * @param data - The data to validate
	 * @returns Validation result with success flag and any error messages
	 */
	validate(data: unknown): SchemaValidationResult {
		const result = this.schema.safeParse(data);

		if (result.success) {
			return { success: true, errors: [] };
		}

		return {
			success: false,
			errors: formatValidationErrors(result.error.issues),
		};
	}
}

/**
 * Factory that creates a JsonSchemaValidator if a schema is provided.
 *
 * @param jsonSchema - Optional JSON Schema object
 * @returns A validator instance, or undefined if no schema was provided
 * @throws If the provided JSON Schema cannot be compiled
 */
export function createValidator(
	jsonSchema: Record<string, unknown> | undefined,
): JsonSchemaValidator | undefined {
	if (!jsonSchema) {
		return undefined;
	}
	return new JsonSchemaValidator(jsonSchema);
}
