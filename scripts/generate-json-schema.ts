/**
 * Generate JSON Schema from Zod schemas
 *
 * Imports the ExperimentConfig schema and writes ppef.schema.json
 * via z.toJSONSchema(). Also includes evaluator config schemas as
 * $defs so standalone eval-config files can reference them via
 * "$schema": "ppef.schema.json#/$defs/ClaimsEvaluatorConfig" etc.
 */

import { writeFile } from "node:fs/promises";
import { z } from "zod";

import { ExperimentConfig } from "../src/cli/types.js";
import {
	ClaimsEvaluatorConfigSchema,
	MetricsEvaluatorConfigSchema,
	RobustnessEvaluatorConfigSchema,
	ExploratoryEvaluatorConfigSchema,
	CustomEvaluatorConfigSchema,
} from "../src/cli/evaluator-schemas.js";

const jsonSchema = z.toJSONSchema(ExperimentConfig, {
	target: "draft-2020-12",
}) as Record<string, unknown>;

// Generate standalone evaluator config schemas and add as $defs
const evaluatorDefs: Record<string, unknown> = {
	ClaimsEvaluatorConfig: z.toJSONSchema(ClaimsEvaluatorConfigSchema, {
		target: "draft-2020-12",
	}),
	MetricsEvaluatorConfig: z.toJSONSchema(MetricsEvaluatorConfigSchema, {
		target: "draft-2020-12",
	}),
	RobustnessEvaluatorConfig: z.toJSONSchema(RobustnessEvaluatorConfigSchema, {
		target: "draft-2020-12",
	}),
	ExploratoryEvaluatorConfig: z.toJSONSchema(ExploratoryEvaluatorConfigSchema, {
		target: "draft-2020-12",
	}),
	CustomEvaluatorConfig: z.toJSONSchema(CustomEvaluatorConfigSchema, {
		target: "draft-2020-12",
	}),
};

// Merge $defs into the root schema
const existingDefs = jsonSchema.$defs as Record<string, unknown> | undefined;
jsonSchema.$defs = { ...existingDefs, ...evaluatorDefs };

await writeFile("ppef.schema.json", JSON.stringify(jsonSchema, null, 2) + "\n");

console.log("Generated ppef.schema.json");
