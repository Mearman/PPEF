/**
 * Generate JSON Schema from Zod schemas with post-processing pipeline
 *
 * Transforms the raw z.toJSONSchema() output through 9 passes:
 * 1. addSchemaId        — Root $id + clean sub-schema $schema keys
 * 2. addDefaults        — Default values from DEFAULT_EXECUTOR_CONFIG
 * 3. clampIntegerBounds — Replace JS MAX_SAFE_INTEGER with domain bounds
 * 4. addEnumDescriptions — Per-value oneOf descriptions for key enums
 * 5. addConditionalSchemas — if/then for MetricsCriterion type-dependent fields
 * 6. deduplicateToDefs  — Extract titled duplicates to $defs + $ref
 * 7. addDiscriminatorHint — $comment on evaluator config union
 * 8. addExamples        — Embed real examples from examples/ directory
 * 9. sortProperties     — Canonical keyword order + alphabetical properties
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

import { ExperimentConfig } from "../src/cli/types.js";
import {
	ClaimsEvaluatorConfigSchema,
	MetricsEvaluatorConfigSchema,
	RobustnessEvaluatorConfigSchema,
	ExploratoryEvaluatorConfigSchema,
	CustomEvaluatorConfigSchema,
} from "../src/cli/evaluator-schemas.js";

// ============================================================================
// Types
// ============================================================================

type JsonSchema = Record<string, unknown>;
type SchemaTransform = (schema: JsonSchema) => JsonSchema;

// ============================================================================
// Helpers
// ============================================================================

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

/** Type guard: checks if a value is a non-null, non-array object (i.e. a JsonSchema). */
function isJsonSchema(value: unknown): value is JsonSchema {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Safely retrieve a nested property as a JsonSchema, or undefined. */
function getSchema(obj: JsonSchema, key: string): JsonSchema | undefined {
	const value: unknown = obj[key];
	return isJsonSchema(value) ? value : undefined;
}

/** Type guard: checks if a value is a Record of JsonSchemas (all values are objects). */
function isSchemaRecord(value: unknown): value is Record<string, JsonSchema> {
	return isJsonSchema(value) && Object.values(value).every(isJsonSchema);
}

/** Safely retrieve a nested property as a Record of JsonSchemas, or undefined. */
function getSchemaRecord(obj: JsonSchema, key: string): Record<string, JsonSchema> | undefined {
	const value: unknown = obj[key];
	return isSchemaRecord(value) ? value : undefined;
}

/** Recursive tree walker — visits every object node in the schema. */
function walkSchema(
	node: unknown,
	visitor: (node: JsonSchema, path: string) => void,
	path = "",
): void {
	if (!isJsonSchema(node)) return;
	visitor(node, path);
	for (const [key, value] of Object.entries(node)) {
		if (Array.isArray(value)) {
			for (let i = 0; i < value.length; i++) {
				walkSchema(value[i], visitor, `${path}/${key}/${i}`);
			}
		} else if (typeof value === "object" && value !== null) {
			walkSchema(value, visitor, `${path}/${key}`);
		}
	}
}

/** Read example JSON file relative to project root, stripping $schema. */
function readExampleJson(relativePath: string): JsonSchema {
	const content = readFileSync(resolve(ROOT, relativePath), "utf-8");
	// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- JSON.parse returns any
	const parsed: JsonSchema = JSON.parse(content);
	delete parsed.$schema;
	return parsed;
}

// ============================================================================
// Pass 1: addSchemaId
// ============================================================================

function addSchemaId(schema: JsonSchema): JsonSchema {
	// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- JSON.parse returns any
	const pkg: { version: string } = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf-8"));
	schema.$id = `https://ppef.dev/schemas/v${pkg.version}/ppef.schema.json`;

	// Remove $schema from $defs entries (redundant for sub-schemas)
	const defs = getSchemaRecord(schema, "$defs");
	if (defs) {
		for (const def of Object.values(defs)) {
			delete def.$schema;
		}
	}

	return schema;
}

// ============================================================================
// Pass 2: addDefaults
// ============================================================================

function addDefaults(schema: JsonSchema): JsonSchema {
	const executorDefaults: Record<string, unknown> = {
		continueOnError: true,
		repetitions: 1,
		seedBase: 42,
		timeoutMs: 0,
		collectProvenance: true,
	};

	const outputDefaults: Record<string, unknown> = {
		format: "json-pretty",
		aggregate: true,
	};

	const props = getSchemaRecord(schema, "properties");
	if (!props) return schema;

	// Executor defaults
	const executorSchema = getSchema(props, "executor");
	const executorProps = executorSchema ? getSchemaRecord(executorSchema, "properties") : undefined;
	if (executorProps) {
		for (const [key, value] of Object.entries(executorDefaults)) {
			const prop = getSchema(executorProps, key);
			if (prop) {
				prop.default = value;
			}
		}
	}

	// Output defaults
	const outputSchema = getSchema(props, "output");
	const outputProps = outputSchema ? getSchemaRecord(outputSchema, "properties") : undefined;
	if (outputProps) {
		for (const [key, value] of Object.entries(outputDefaults)) {
			const prop = getSchema(outputProps, key);
			if (prop) {
				prop.default = value;
			}
		}
	}

	return schema;
}

// ============================================================================
// Pass 3: clampIntegerBounds
// ============================================================================

const JS_MAX_SAFE = 9007199254740991;

const INTEGER_BOUNDS: Record<string, number> = {
	repetitions: 10_000,
	seedBase: 2_147_483_647,
	timeoutMs: 86_400_000,
	concurrency: 256,
	binaryTimeout: 86_400_000,
	runsPerLevel: 10_000,
};
const FALLBACK_MAX = 2_147_483_647;

function clampIntegerBounds(schema: JsonSchema): JsonSchema {
	walkSchema(schema, (node, path) => {
		if (node.type === "integer" && node.maximum === JS_MAX_SAFE) {
			// Extract the property name from the path
			const segments = path.split("/");
			const propName = segments[segments.length - 1];
			node.maximum = INTEGER_BOUNDS[propName] ?? FALLBACK_MAX;
		}
	});
	return schema;
}

// ============================================================================
// Pass 4: addEnumDescriptions
// ============================================================================

/** Maps enum description string → per-value descriptions. */
const ENUM_DESCRIPTIONS: Record<string, Record<string, string>> = {
	"Role of the SUT in evaluation": {
		primary: "The system being evaluated; the novel algorithm or implementation",
		baseline: "A reference implementation for comparison",
		oracle: "Ground truth provider; defines correct answers",
	},
	"Evaluation type": {
		claims: "Test explicit hypotheses with statistical significance",
		metrics: "Evaluate against thresholds, baselines, or target ranges",
		robustness: "Measure sensitivity under perturbations",
		exploratory: "Hypothesis-free analysis: rankings, correlations",
		custom: "User-defined evaluator loaded from a module",
	},
	"Type of metrics criterion": {
		threshold: "Compare a metric against a fixed threshold value",
		baseline: "Compare a metric against a baseline SUT",
		"target-range": "Check that a metric falls within a target range",
	},
	"Expected direction of difference": {
		greater: "Primary SUT metric should be greater than baseline",
		less: "Primary SUT metric should be less than baseline",
		equal: "Primary SUT metric should be equal to baseline",
	},
	"Scope of claim validity": {
		global: "Claim applies across all cases and conditions",
		caseClass: "Claim applies within a specific case class",
		parameterRange: "Claim applies within a parameter range",
		localStructure: "Claim applies to local structural properties",
	},
	"Comparison operator": {
		gt: "Greater than",
		gte: "Greater than or equal to",
		lt: "Less than",
		lte: "Less than or equal to",
		eq: "Equal to",
	},
	"Metric direction for ranking": {
		"higher-better": "Higher values indicate better performance",
		"lower-better": "Lower values indicate better performance",
	},
};

function addEnumDescriptions(schema: JsonSchema): JsonSchema {
	walkSchema(schema, (node) => {
		const desc = typeof node.description === "string" ? node.description : undefined;
		const enumValues = Array.isArray(node.enum) ? node.enum : undefined;
		if (!desc || !enumValues) return;

		if (!Object.hasOwn(ENUM_DESCRIPTIONS, desc)) return;
		const perValue = ENUM_DESCRIPTIONS[desc];
		// Only convert if we have descriptions for at least one value
		if (!enumValues.some((v: unknown) => typeof v === "string" && perValue[v])) return;

		node.oneOf = enumValues.map((value: unknown) => ({
			const: value,
			description: (typeof value === "string" && perValue[value]) || String(value),
		}));
		delete node.enum;
	});
	return schema;
}

// ============================================================================
// Pass 5: addConditionalSchemas
// ============================================================================

function addConditionalSchemas(schema: JsonSchema): JsonSchema {
	walkSchema(schema, (node) => {
		if (node.title !== "MetricsCriterion") return;

		const existing: unknown[] = Array.isArray(node.allOf) ? node.allOf : [];
		node.allOf = [
			...existing,
			{
				if: {
					properties: { type: { const: "threshold" } },
					required: ["type"],
				},
				then: { required: ["threshold"] },
			},
			{
				if: {
					properties: { type: { const: "baseline" } },
					required: ["type"],
				},
				then: { required: ["baseline"] },
			},
			{
				if: {
					properties: { type: { const: "target-range" } },
					required: ["type"],
				},
				then: { required: ["targetRange"] },
			},
		];
	});
	return schema;
}

// ============================================================================
// Pass 6: deduplicateToDefs
// ============================================================================

function deduplicateToDefs(schema: JsonSchema): JsonSchema {
	// Collect all titled objects and their locations
	const titledObjects = new Map<string, { node: JsonSchema; paths: string[] }>();

	walkSchema(schema, (node, path) => {
		const title = typeof node.title === "string" ? node.title : undefined;
		if (!title || title === "ExperimentConfig") return;
		// Skip nodes that are already in $defs (they are the canonical location)
		if (path.startsWith("/$defs/")) return;

		const existing = titledObjects.get(title);
		if (existing) {
			existing.paths.push(path);
		} else {
			titledObjects.set(title, { node: structuredClone(node), paths: [path] });
		}
	});

	const defs: Record<string, JsonSchema> = isJsonSchema(schema.$defs)
		? (schema.$defs satisfies JsonSchema)
		: {};

	// For each titled object that appears in the inline schema, ensure it's in $defs
	// and replace inline occurrences with $ref
	for (const [title, { node, paths }] of titledObjects) {
		// Only deduplicate if the object appears inline AND also exists in $defs
		// OR appears multiple times inline
		const existsInDefs = title in defs;
		if (!existsInDefs && paths.length < 2) continue;

		// Ensure it's in $defs
		if (!existsInDefs) {
			defs[title] = node;
		}

		// Replace each inline occurrence with $ref
		for (const path of paths) {
			replaceAtPath(schema, path, { $ref: `#/$defs/${title}` });
		}
	}

	schema.$defs = defs;
	return schema;
}

/** Replace the object at a given JSON Pointer path with a replacement. */
function replaceAtPath(root: JsonSchema, path: string, replacement: JsonSchema): void {
	const segments = path.split("/").filter(Boolean);
	let current: unknown = root;
	for (let i = 0; i < segments.length - 1; i++) {
		const seg = segments[i];
		if (Array.isArray(current)) {
			current = current[Number(seg)];
		} else if (isJsonSchema(current)) {
			current = current[seg];
		}
	}
	const lastSeg = segments[segments.length - 1];
	if (Array.isArray(current)) {
		current[Number(lastSeg)] = replacement;
	} else if (isJsonSchema(current)) {
		current[lastSeg] = replacement;
	}
}

// ============================================================================
// Pass 7: addDiscriminatorHint
// ============================================================================

function addDiscriminatorHint(schema: JsonSchema): JsonSchema {
	// Find the evaluators array item's config property
	walkSchema(schema, (node) => {
		if (node.anyOf && Array.isArray(node.anyOf)) {
			// Check if this anyOf contains evaluator config schemas
			const titles = node.anyOf.map((item: unknown) => {
				if (isJsonSchema(item) && "$ref" in item && typeof item.$ref === "string") {
					return item.$ref.split("/").pop();
				}
				if (isJsonSchema(item)) {
					return item.title;
				}
				return undefined;
			});
			if (titles.includes("ClaimsEvaluatorConfig")) {
				node.$comment =
					"Discriminated by sibling 'type' field: " +
					"claims -> ClaimsEvaluatorConfig, " +
					"metrics -> MetricsEvaluatorConfig, " +
					"robustness -> RobustnessEvaluatorConfig, " +
					"exploratory -> ExploratoryEvaluatorConfig, " +
					"custom -> CustomEvaluatorConfig";
			}
		}
	});
	return schema;
}

// ============================================================================
// Pass 8: addExamples
// ============================================================================

const EXAMPLE_SOURCES: Record<string, string> = {
	_root: "examples/string-length/experiment.json",
	ClaimsEvaluatorConfig: "examples/string-length/eval-claims.json",
	MetricsEvaluatorConfig: "examples/metrics-only/eval-config.json",
	RobustnessEvaluatorConfig: "examples/robustness-only/eval-config.json",
	ExploratoryEvaluatorConfig: "examples/string-length/eval-exploratory.json",
};

function addExamples(schema: JsonSchema): JsonSchema {
	// Root example
	if (EXAMPLE_SOURCES._root) {
		schema.examples = [readExampleJson(EXAMPLE_SOURCES._root)];
	}

	// $defs examples
	const defs = getSchemaRecord(schema, "$defs");
	if (defs) {
		for (const [defName, sourcePath] of Object.entries(EXAMPLE_SOURCES)) {
			if (defName === "_root") continue;
			if (Object.hasOwn(defs, defName)) {
				defs[defName].examples = [readExampleJson(sourcePath)];
			}
		}
	}

	return schema;
}

// ============================================================================
// Pass 9: sortProperties
// ============================================================================

const KEYWORD_ORDER = [
	"$schema",
	"$id",
	"$comment",
	"$ref",
	"title",
	"description",
	"type",
	"enum",
	"const",
	"oneOf",
	"anyOf",
	"allOf",
	"properties",
	"required",
	"additionalProperties",
	"propertyNames",
	"patternProperties",
	"items",
	"minItems",
	"maxItems",
	"minimum",
	"maximum",
	"exclusiveMinimum",
	"exclusiveMaximum",
	"minLength",
	"maxLength",
	"pattern",
	"default",
	"examples",
	"if",
	"then",
	"else",
	"$defs",
];

function sortProperties(schema: JsonSchema): JsonSchema {
	const sorted = deepSortKeys(schema);
	if (isJsonSchema(sorted)) return sorted;
	return schema;
}

function deepSortKeys(node: unknown): unknown {
	if (node === null || typeof node !== "object") return node;
	if (Array.isArray(node)) return node.map(deepSortKeys);

	const obj: Record<string, unknown> = node satisfies Record<string, unknown>;
	const sorted: Record<string, unknown> = {};

	// Determine sort order: schema keywords use KEYWORD_ORDER,
	// keys within "properties" are alphabetical,
	// keys within "$defs" are alphabetical
	const keys = Object.keys(obj);
	keys.sort((a, b) => {
		const ai = KEYWORD_ORDER.indexOf(a);
		const bi = KEYWORD_ORDER.indexOf(b);
		if (ai !== -1 && bi !== -1) return ai - bi;
		if (ai !== -1) return -1;
		if (bi !== -1) return 1;
		return a.localeCompare(b);
	});

	for (const key of keys) {
		let value = obj[key];

		// Sort keys inside "properties" and "$defs" alphabetically
		if (
			(key === "properties" || key === "$defs") &&
			typeof value === "object" &&
			value !== null &&
			!Array.isArray(value)
		) {
			const inner: Record<string, unknown> = value satisfies Record<string, unknown>;
			const sortedInner: Record<string, unknown> = {};
			const innerKeys = Object.keys(inner).sort((a, b) => a.localeCompare(b));
			for (const ik of innerKeys) {
				sortedInner[ik] = deepSortKeys(inner[ik]);
			}
			value = sortedInner;
		} else if (key === "required" && Array.isArray(value)) {
			// Sort required arrays alphabetically
			const strings: string[] = value.filter((v: unknown): v is string => typeof v === "string");
			value = [...strings].sort((a, b) => a.localeCompare(b));
		} else {
			value = deepSortKeys(value);
		}

		sorted[key] = value;
	}

	return sorted;
}

// ============================================================================
// Pipeline
// ============================================================================

const pipeline: SchemaTransform[] = [
	addSchemaId,
	addDefaults,
	clampIntegerBounds,
	addEnumDescriptions,
	addConditionalSchemas,
	deduplicateToDefs,
	addDiscriminatorHint,
	addExamples,
	sortProperties,
];

// ============================================================================
// Main
// ============================================================================

// Generate base schema from Zod
const jsonSchema: JsonSchema = z.toJSONSchema(ExperimentConfig, {
	target: "draft-2020-12",
});

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
const existingDefs: Record<string, unknown> | undefined = isJsonSchema(jsonSchema.$defs)
	? jsonSchema.$defs
	: undefined;
jsonSchema.$defs = { ...existingDefs, ...evaluatorDefs };

// Run pipeline
let result = jsonSchema;
for (const transform of pipeline) {
	result = transform(result);
}

writeFileSync("ppef.schema.json", JSON.stringify(result, null, 2) + "\n");

console.log("Generated ppef.schema.json (9-pass pipeline)");
