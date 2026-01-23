/**
 * Schema Definitions and Validators
 *
 * Provides schema validation utilities for the evaluation framework.
 */

import type { EvaluationCase } from "../types/case.js";
import type { EvaluationResult } from "../types/result.js";
import type { SutRegistration } from "../types/sut.js";

/**
 * Schema validation result.
 */
export interface SchemaValidation {
	valid: boolean;
	errors: string[];
}

/**
 * Validate an EvaluationResult against the schema.
 * @param result
 */
export const validateResult = (result: unknown): SchemaValidation => {
	const errors: string[] = [];

	if (!result || typeof result !== "object") {
		return { valid: false, errors: ["Result must be an object"] };
	}

	const r = result as Partial<EvaluationResult>;

	// Validate run context
	if (!r.run || typeof r.run !== "object") {
		errors.push("Missing or invalid run context");
	} else {
		if (typeof r.run.runId !== "string" || r.run.runId.length === 0) {
			errors.push("run.runId must be a non-empty string");
		}
		if (typeof r.run.sut !== "string" || r.run.sut.length === 0) {
			errors.push("run.sut must be a non-empty string");
		}
		if (!["primary", "baseline", "oracle"].includes(r.run.sutRole ?? "")) {
			errors.push("run.sutRole must be 'primary', 'baseline', or 'oracle'");
		}
		if (typeof r.run.caseId !== "string" || r.run.caseId.length === 0) {
			errors.push("run.caseId must be a non-empty string");
		}
	}

	// Validate correctness
	if (!r.correctness || typeof r.correctness !== "object") {
		errors.push("Missing or invalid correctness assessment");
	} else {
		if (typeof r.correctness.expectedExists !== "boolean") {
			errors.push("correctness.expectedExists must be a boolean");
		}
		if (typeof r.correctness.producedOutput !== "boolean") {
			errors.push("correctness.producedOutput must be a boolean");
		}
		if (typeof r.correctness.valid !== "boolean") {
			errors.push("correctness.valid must be a boolean");
		}
	}

	// Validate metrics
	if (!r.metrics || typeof r.metrics !== "object") {
		errors.push("Missing or invalid metrics");
	} else {
		if (!r.metrics.numeric || typeof r.metrics.numeric !== "object") {
			errors.push("metrics.numeric must be an object");
		} else {
			for (const [key, value] of Object.entries(r.metrics.numeric)) {
				if (typeof value !== "number" || !Number.isFinite(value)) {
					errors.push(`metrics.numeric.${key} must be a finite number`);
				}
			}
		}
	}

	// Validate provenance
	if (!r.provenance || typeof r.provenance !== "object") {
		errors.push("Missing or invalid provenance");
	} else if (!r.provenance.runtime || typeof r.provenance.runtime !== "object") {
		errors.push("provenance.runtime must be an object");
	}

	return {
		valid: errors.length === 0,
		errors,
	};
};

/**
 * Validate an EvaluationCase against the schema.
 * @param evaluationCase
 */
export const validateCase = (evaluationCase: unknown): SchemaValidation => {
	const errors: string[] = [];

	if (!evaluationCase || typeof evaluationCase !== "object") {
		return { valid: false, errors: ["Case must be an object"] };
	}

	const c = evaluationCase as Partial<EvaluationCase>;

	if (typeof c.caseId !== "string" || c.caseId.length === 0) {
		errors.push("caseId must be a non-empty string");
	}

	if (!c.inputs || typeof c.inputs !== "object") {
		errors.push("inputs must be an object");
	}

	return {
		valid: errors.length === 0,
		errors,
	};
};

/**
 * Validate a SutRegistration against the schema.
 * @param registration
 */
export const validateSutRegistration = (registration: unknown): SchemaValidation => {
	const errors: string[] = [];

	if (!registration || typeof registration !== "object") {
		return { valid: false, errors: ["Registration must be an object"] };
	}

	const r = registration as Partial<SutRegistration>;

	if (typeof r.id !== "string" || r.id.length === 0) {
		errors.push("id must be a non-empty string");
	}

	if (typeof r.name !== "string" || r.name.length === 0) {
		errors.push("name must be a non-empty string");
	}

	if (typeof r.version !== "string" || r.version.length === 0) {
		errors.push("version must be a non-empty string");
	}

	if (!["primary", "baseline", "oracle"].includes(r.role ?? "")) {
		errors.push("role must be 'primary', 'baseline', or 'oracle'");
	}

	if (!r.config || typeof r.config !== "object") {
		errors.push("config must be an object");
	}

	if (!Array.isArray(r.tags)) {
		errors.push("tags must be an array");
	}

	return {
		valid: errors.length === 0,
		errors,
	};
};

/**
 * Deep freeze an object to ensure immutability.
 * @param obj
 * @param object
 */
export const deepFreeze = <T extends object>(object: T): Readonly<T> => {
	Object.freeze(object);
	for (const value of Object.values(object)) {
		if (value && typeof value === "object" && !Object.isFrozen(value)) {
			deepFreeze(value);
		}
	}
	return object;
};
