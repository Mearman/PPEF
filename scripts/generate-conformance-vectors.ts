/**
 * Generate Conformance Test Vectors
 *
 * Produces golden test vector files in spec/conformance/ for cross-language
 * validation. Each vector file contains fixed inputs and expected outputs
 * that any conforming PPEF implementation must reproduce.
 */

import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalize, generateRunId, generateConfigHash } from "../src/executor/run-id.js";
import {
	mannWhitneyUTest,
	normalCDF,
	cohensD,
	confidenceInterval,
} from "../src/statistical/mann-whitney-u.js";
import { computeSummaryStats } from "../src/aggregation/aggregators.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SPEC_DIR = resolve(__dirname, "..", "spec", "conformance");

// ============================================================================
// Run ID Vectors
// ============================================================================

interface RunIdVector {
	description: string;
	inputs: {
		sutId: string;
		caseId: string;
		seed?: number;
		configHash?: string;
		repetition?: number;
	};
	canonicalized: string;
	runId: string;
}

function generateRunIdVectors(): {
	vectors: RunIdVector[];
	canonicalizationRules: string[];
} {
	const testCases: RunIdVector["inputs"][] = [
		{ sutId: "sut-a", caseId: "case-1" },
		{ sutId: "sut-a", caseId: "case-1", seed: 42 },
		{ sutId: "sut-a", caseId: "case-1", seed: 42, repetition: 0 },
		{ sutId: "sut-a", caseId: "case-1", seed: 42, repetition: 1 },
		{
			sutId: "sut-a",
			caseId: "case-1",
			seed: 42,
			configHash: "abcd1234",
			repetition: 0,
		},
		{
			sutId: "degree-prioritised-v1.0.0",
			caseId: "karate-v1",
			seed: 42,
			repetition: 1,
		},
		{
			sutId: "bfs-baseline",
			caseId: "erdos-renyi-1000",
			seed: 0,
			repetition: 0,
		},
		{ sutId: "x", caseId: "y" },
	];

	const vectors: RunIdVector[] = testCases.map((inputs) => {
		const canonical = canonicalize(inputs);
		return {
			description: `sutId=${inputs.sutId}, caseId=${inputs.caseId}${inputs.seed !== undefined ? `, seed=${inputs.seed}` : ""}${inputs.repetition !== undefined ? `, rep=${inputs.repetition}` : ""}${inputs.configHash !== undefined ? `, configHash=${inputs.configHash}` : ""}`,
			inputs,
			canonicalized: canonical,
			runId: generateRunId(inputs),
		};
	});

	return {
		vectors,
		canonicalizationRules: [
			"RFC 8785 (JSON Canonicalization Scheme / JCS)",
			"Object keys sorted lexicographically by UTF-16 code units",
			"Undefined fields omitted entirely",
			"No whitespace between tokens",
			"Numbers use ECMAScript Number.toString() representation",
			"Strings use standard JSON escaping",
			"Hash: SHA-256 of UTF-8 encoded canonical string, hex-encoded, truncated to 16 characters",
		],
	};
}

// ============================================================================
// Config Hash Vectors
// ============================================================================

interface ConfigHashVector {
	description: string;
	config: Record<string, unknown>;
	canonicalized: string;
	configHash: string;
}

function generateConfigHashVectors(): ConfigHashVector[] {
	const configs: { desc: string; config: Record<string, unknown> }[] = [
		{ desc: "empty config", config: {} },
		{ desc: "single numeric", config: { threshold: 0.9 } },
		{ desc: "multiple keys (tests sorting)", config: { z: 3, a: 1, m: 2 } },
		{ desc: "nested object", config: { nested: { inner: 42 } } },
		{ desc: "array value", config: { items: [1, 2, 3] } },
		{ desc: "boolean value", config: { enabled: true } },
		{ desc: "null value", config: { value: null } },
	];

	return configs.map(({ desc, config }) => ({
		description: desc,
		config,
		canonicalized: canonicalize(config),
		configHash: generateConfigHash(config),
	}));
}

// ============================================================================
// Statistical Vectors
// ============================================================================

interface StatisticalVector {
	description: string;
	function: string;
	inputs: Record<string, unknown>;
	expected: Record<string, unknown>;
	tolerance?: number;
}

function generateStatisticalVectors(): {
	vectors: StatisticalVector[];
	algorithms: Record<string, string>;
} {
	const vectors: StatisticalVector[] = [];

	// normalCDF vectors
	const zScores = [-3, -2, -1, 0, 1, 2, 3];
	for (const z of zScores) {
		vectors.push({
			description: `normalCDF(${z})`,
			function: "normalCDF",
			inputs: { z },
			expected: { result: normalCDF(z) },
			tolerance: 1e-6,
		});
	}

	// Mann-Whitney U vectors
	const mwuCases: { desc: string; a: number[]; b: number[] }[] = [
		{
			desc: "clearly different samples",
			a: [1, 2, 3, 4, 5],
			b: [6, 7, 8, 9, 10],
		},
		{ desc: "identical samples", a: [5, 5, 5, 5, 5], b: [5, 5, 5, 5, 5] },
		{ desc: "overlapping samples", a: [1, 3, 5, 7, 9], b: [2, 4, 6, 8, 10] },
		{
			desc: "larger samples",
			a: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
			b: [15, 25, 35, 45, 55, 65, 75, 85, 95, 105],
		},
		{ desc: "unequal sizes", a: [1, 2, 3], b: [4, 5, 6, 7, 8] },
		{ desc: "tied ranks", a: [1, 2, 2, 3], b: [2, 3, 3, 4] },
	];

	for (const { desc, a, b } of mwuCases) {
		const result = mannWhitneyUTest(a, b);
		vectors.push({
			description: `mannWhitneyU: ${desc}`,
			function: "mannWhitneyUTest",
			inputs: { sampleA: a, sampleB: b },
			expected: {
				u: result.u,
				pValue: result.pValue,
				significant: result.significant,
			},
			tolerance: 1e-6,
		});
	}

	// Cohen's d vectors
	const cohensCases: { desc: string; a: number[]; b: number[] }[] = [
		{ desc: "large effect", a: [10, 11, 12, 13, 14], b: [20, 21, 22, 23, 24] },
		{ desc: "small effect", a: [10, 11, 12, 13, 14], b: [11, 12, 13, 14, 15] },
		{ desc: "zero effect", a: [10, 11, 12, 13, 14], b: [10, 11, 12, 13, 14] },
		{
			desc: "different variances",
			a: [10, 20, 30, 40, 50],
			b: [25, 26, 27, 28, 29],
		},
	];

	for (const { desc, a, b } of cohensCases) {
		vectors.push({
			description: `cohensD: ${desc}`,
			function: "cohensD",
			inputs: { sampleA: a, sampleB: b },
			expected: { result: cohensD(a, b) },
			tolerance: 1e-6,
		});
	}

	// Confidence interval vectors
	const ciCases: { desc: string; values: number[] }[] = [
		{ desc: "5 values", values: [10, 20, 30, 40, 50] },
		{ desc: "10 values", values: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
		{ desc: "constant values", values: [5, 5, 5, 5, 5] },
	];

	for (const { desc, values } of ciCases) {
		const result = confidenceInterval(values);
		vectors.push({
			description: `confidenceInterval: ${desc}`,
			function: "confidenceInterval",
			inputs: { values },
			expected: { lower: result.lower, upper: result.upper },
			tolerance: 1e-6,
		});
	}

	return {
		vectors,
		algorithms: {
			normalCDF:
				"Abramowitz & Stegun approximation: a1=0.254829592, a2=-0.284496736, a3=1.421413741, a4=-1.453152027, a5=1.061405429, p=0.3275911",
			mannWhitneyUTest:
				"Rank all values combined, average tied ranks, compute U = rankSum - n*(n+1)/2, z = (U - n1*n2/2) / sqrt(n1*n2*(n1+n2+1)/12), two-tailed p = 2*(1 - normalCDF(|z|))",
			cohensD:
				"pooledStd = sqrt(((n1-1)*var1 + (n2-1)*var2) / (n1+n2-2)), d = |mean1-mean2| / pooledStd",
			confidenceInterval:
				"SE = std / sqrt(n), margin = 1.96 * SE (large-sample z approximation for 95% CI)",
		},
	};
}

// ============================================================================
// Aggregation Vectors
// ============================================================================

interface AggregationVector {
	description: string;
	inputs: number[];
	expected: Record<string, unknown>;
	tolerance?: number;
}

function generateAggregationVectors(): AggregationVector[] {
	const cases: { desc: string; values: number[] }[] = [
		{ desc: "5 integer values", values: [10, 20, 30, 40, 50] },
		{ desc: "10 values", values: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
		{ desc: "single value", values: [42] },
		{ desc: "two values", values: [10, 20] },
		{ desc: "identical values", values: [5, 5, 5, 5, 5] },
		{ desc: "empty array", values: [] },
		{ desc: "decimal values", values: [0.1, 0.2, 0.3, 0.4, 0.5] },
	];

	return cases.map(({ desc, values }) => {
		const stats = computeSummaryStats(values);
		return {
			description: `computeSummaryStats: ${desc}`,
			inputs: values,
			expected: {
				n: stats.n,
				mean: stats.mean,
				median: stats.median,
				min: stats.min,
				max: stats.max,
				std: stats.std ?? null,
				confidence95: stats.confidence95 ?? null,
				sum: stats.sum ?? null,
				p25: stats.p25 ?? null,
				p75: stats.p75 ?? null,
			},
			tolerance: 1e-10,
		};
	});
}

// ============================================================================
// Main
// ============================================================================

const runIdData = generateRunIdVectors();
writeFileSync(
	resolve(SPEC_DIR, "run-id-vectors.json"),
	JSON.stringify(
		{
			$schema: "../ppef.schema.json",
			description:
				"Pinned runId and configHash test vectors. Any conforming implementation must produce identical outputs for these inputs.",
			canonicalizationRules: runIdData.canonicalizationRules,
			runIdVectors: runIdData.vectors,
			configHashVectors: generateConfigHashVectors(),
		},
		null,
		2,
	) + "\n",
);

const statsData = generateStatisticalVectors();
writeFileSync(
	resolve(SPEC_DIR, "statistical-vectors.json"),
	JSON.stringify(
		{
			description:
				"Statistical algorithm test vectors with tolerances. Implementations should match within the specified tolerance.",
			algorithms: statsData.algorithms,
			vectors: statsData.vectors,
		},
		null,
		2,
	) + "\n",
);

writeFileSync(
	resolve(SPEC_DIR, "aggregation-vectors.json"),
	JSON.stringify(
		{
			description:
				"Aggregation pipeline test vectors. computeSummaryStats should produce identical results for these inputs.",
			vectors: generateAggregationVectors(),
		},
		null,
		2,
	) + "\n",
);

console.log("Generated conformance vectors in spec/conformance/");
