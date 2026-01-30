/**
 * Generate JSON Schema from Zod schemas
 *
 * Imports the ExperimentConfig schema and writes ppef.schema.json
 * via z.toJSONSchema().
 */

import { writeFile } from "node:fs/promises";
import { z } from "zod";

import { ExperimentConfig } from "../src/cli/types.js";

const jsonSchema = z.toJSONSchema(ExperimentConfig, {
	target: "draft-2020-12",
});

await writeFile("ppef.schema.json", JSON.stringify(jsonSchema, null, 2) + "\n");

console.log("Generated ppef.schema.json");
