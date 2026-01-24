/**
 * Integration tests for Framework Pipeline
 *
 * Tests the complete flow: Results → Aggregate → Evaluate Claims → Render
 */

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import { aggregateResults } from "../aggregation/pipeline.js";
import { ClaimsEvaluator } from "../evaluators/claims-evaluator.js";
import { ResultCollector } from "../collector/result-collector.js";
import { LaTeXRenderer } from "../renderers/latex-renderer.js";
import type { TableRenderSpec } from "../renderers/types.js";
import type { EvaluationClaim } from "../types/claims.js";
import type { EvaluationResult } from "../types/result.js";
import type { EvaluationContext } from "../types/evaluator.js";
import { createMockResult } from "./test-helpers.js";

// Create a singleton evaluator instance for testing
const claimsEvaluator = new ClaimsEvaluator();

describe("Framework Pipeline Integration", () => {
	/**
	 * Create a realistic set of evaluation results for testing
	 */
	const createTestResults = (): EvaluationResult[] => {
		const results: EvaluationResult[] = [];

		// Degree-Prioritised (primary) - faster, better hub avoidance
		for (let index = 0; index < 10; index++) {
			results.push(
				createMockResult({
					run: {
						runId: `dp-run-${index}`,
						sut: "degree-prioritised-v1.0.0",
						sutRole: "primary",
						caseId: `case-${index}`,
						caseClass: "scale-free",
					},
					correctness: {
						expectedExists: true,
						producedOutput: true,
						valid: true,
						matchesExpected: true,
					},
					metrics: {
						numeric: {
							"execution-time": 80 + Math.random() * 20,
							"nodes-expanded": 40 + Math.random() * 10,
							"hub-traversal": 5 + Math.random() * 5,
							"path-diversity": 0.75 + Math.random() * 0.15,
						},
					},
				}),
			);
		}

		// Standard BFS (baseline) - slower, more hub visits
		for (let index = 0; index < 10; index++) {
			results.push(
				createMockResult({
					run: {
						runId: `bfs-run-${index}`,
						sut: "standard-bfs-v1.0.0",
						sutRole: "baseline",
						caseId: `case-${index}`,
						caseClass: "scale-free",
					},
					correctness: {
						expectedExists: true,
						producedOutput: true,
						valid: true,
						matchesExpected: true,
					},
					metrics: {
						numeric: {
							"execution-time": 120 + Math.random() * 30,
							"nodes-expanded": 70 + Math.random() * 20,
							"hub-traversal": 20 + Math.random() * 10,
							"path-diversity": 0.6 + Math.random() * 0.15,
						},
					},
				}),
			);
		}

		// Frontier-Balanced (baseline) - between the two
		for (let index = 0; index < 10; index++) {
			results.push(
				createMockResult({
					run: {
						runId: `fb-run-${index}`,
						sut: "frontier-balanced-v1.0.0",
						sutRole: "baseline",
						caseId: `case-${index}`,
						caseClass: "scale-free",
					},
					correctness: {
						expectedExists: true,
						producedOutput: true,
						valid: true,
						matchesExpected: true,
					},
					metrics: {
						numeric: {
							"execution-time": 100 + Math.random() * 25,
							"nodes-expanded": 55 + Math.random() * 15,
							"hub-traversal": 12 + Math.random() * 8,
							"path-diversity": 0.65 + Math.random() * 0.15,
						},
					},
				}),
			);
		}

		return results;
	};

	it("should flow: results → aggregate → evaluate claims → render", () => {
		// Step 1: Collect results
		const collector = new ResultCollector();
		const results = createTestResults();
		collector.recordBatch(results);

		assert.strictEqual(collector.count, 30);
		assert.strictEqual(collector.getUniqueSuts().length, 3);

		// Step 2: Aggregate
		const aggregates = aggregateResults(collector.getAll());

		assert.ok(aggregates.length > 0);

		// Find primary aggregate
		const dpAggregate = aggregates.find((a) => a.sut === "degree-prioritised-v1.0.0");
		assert.ok(dpAggregate);
		assert.ok(dpAggregate.metrics["execution-time"]);
		assert.strictEqual(dpAggregate.group.runCount, 10);

		// Step 3: Define and evaluate claims
		const claims: EvaluationClaim[] = [
			{
				claimId: "C1",
				description: "DP is faster than BFS",
				sut: "degree-prioritised-v1.0.0",
				baseline: "standard-bfs-v1.0.0",
				metric: "execution-time",
				direction: "less",
				scope: "global",
			},
			{
				claimId: "C2",
				description: "DP visits fewer hubs than BFS",
				sut: "degree-prioritised-v1.0.0",
				baseline: "standard-bfs-v1.0.0",
				metric: "hub-traversal",
				direction: "less",
				scope: "global",
			},
			{
				claimId: "C3",
				description: "DP has higher path diversity than BFS",
				sut: "degree-prioritised-v1.0.0",
				baseline: "standard-bfs-v1.0.0",
				metric: "path-diversity",
				direction: "greater",
				scope: "global",
			},
		];

		// Create evaluation context
		const context: EvaluationContext = {
			aggregates,
			metadata: { source: "test" },
		};

		// Evaluate claims using the new evaluator API
		const evalOutput = claimsEvaluator.evaluate({ claims }, context);
		const evaluations = evalOutput.data.evaluations;

		assert.strictEqual(evaluations.length, 3);
		assert.ok(
			evaluations.every((e) => ["satisfied", "violated", "inconclusive"].includes(e.status)),
		);

		// Step 4: Summary is included in evaluation output
		const summary = evalOutput.data.summary;

		assert.strictEqual(summary.total, 3);
		assert.strictEqual(summary.satisfied + summary.violated + summary.inconclusive, 3);

		// Step 5: Render
		const renderer = new LaTeXRenderer();

		const tableSpec: TableRenderSpec = {
			id: "performance-comparison",
			filename: "06-performance-comparison.tex",
			label: "tab:performance-comparison",
			caption: "Performance comparison across methods",
			columns: [
				{ key: "method", header: "Method", align: "l" },
				{ key: "execTime", header: "Time (ms)", align: "r" },
				{ key: "nodesExpanded", header: "Nodes", align: "r" },
			],
			extractData: (aggs) =>
				aggs.map((a) => ({
					method: a.sut.replace("-v1.0.0", ""),
					execTime: a.metrics["execution-time"].mean.toFixed(1),
					nodesExpanded: a.metrics["nodes-expanded"].mean.toFixed(0),
				})),
		};

		const tableOutput = renderer.renderTable(aggregates, tableSpec);
		const claimOutput = renderer.renderClaimSummary(evaluations);

		assert.ok(tableOutput.content.includes(String.raw`\begin{table}`));
		assert.ok(tableOutput.content.includes("Performance comparison"));
		assert.ok(claimOutput.content.includes("Claim"));
		assert.ok(claimOutput.content.includes("Status"));
	});

	it("should handle the complete pipeline with real-world-like data", () => {
		// Create results with deterministic values for predictable testing
		const results: EvaluationResult[] = [];

		// Primary: consistently better
		for (let index = 0; index < 5; index++) {
			results.push(
				createMockResult({
					run: {
						runId: `primary-${index}`,
						sut: "primary-algorithm",
						sutRole: "primary",
						caseId: `case-${index}`,
					},
					metrics: {
						numeric: {
							"execution-time": 50,
							"quality-score": 0.9,
						},
					},
				}),
			);
		}

		// Baseline: consistently worse
		for (let index = 0; index < 5; index++) {
			results.push(
				createMockResult({
					run: {
						runId: `baseline-${index}`,
						sut: "baseline-algorithm",
						sutRole: "baseline",
						caseId: `case-${index}`,
					},
					metrics: {
						numeric: {
							"execution-time": 100,
							"quality-score": 0.7,
						},
					},
				}),
			);
		}

		// Aggregate
		const aggregates = aggregateResults(results, { groupByCaseClass: false });

		const primaryAgg = aggregates.find((a) => a.sut === "primary-algorithm");
		const baselineAgg = aggregates.find((a) => a.sut === "baseline-algorithm");

		assert.strictEqual(primaryAgg?.metrics["execution-time"].mean, 50);
		assert.strictEqual(baselineAgg?.metrics["execution-time"].mean, 100);

		// Evaluate claims
		const claims: EvaluationClaim[] = [
			{
				claimId: "SPEED",
				description: "Primary is faster",
				sut: "primary-algorithm",
				baseline: "baseline-algorithm",
				metric: "execution-time",
				direction: "less",
				scope: "global",
			},
			{
				claimId: "QUALITY",
				description: "Primary has higher quality",
				sut: "primary-algorithm",
				baseline: "baseline-algorithm",
				metric: "quality-score",
				direction: "greater",
				scope: "global",
			},
		];

		// Evaluate claims using the new evaluator API
		const context: EvaluationContext = {
			aggregates,
			metadata: { source: "test" },
		};
		const evalOutput = claimsEvaluator.evaluate({ claims }, context);
		const evaluations = evalOutput.data.evaluations;

		// Both claims should be satisfied
		assert.strictEqual(evaluations.find((e) => e.claim.claimId === "SPEED")?.status, "satisfied");
		assert.strictEqual(evaluations.find((e) => e.claim.claimId === "QUALITY")?.status, "satisfied");

		// Evidence should show correct values
		const speedEvaluation = evaluations.find((e) => e.claim.claimId === "SPEED");
		assert.ok(speedEvaluation);
		const speedEvidence = speedEvaluation.evidence;
		assert.strictEqual(speedEvidence.primaryValue, 50);
		assert.strictEqual(speedEvidence.baselineValue, 100);
		assert.strictEqual(speedEvidence.delta, -50); // 50 - 100 = -50
	});

	it("should properly serialize and deserialize through ResultCollector", () => {
		const collector = new ResultCollector();
		const results = createTestResults();

		// Record results
		collector.recordBatch(results);

		// Serialize
		const batch = collector.serialize({ experimentName: "test-exp" });

		assert.strictEqual(batch.version, "1.0.0");
		assert.strictEqual(batch.results.length, 30);
		assert.strictEqual(batch.metadata?.experimentName, "test-exp");

		// Load into new collector
		const newCollector = new ResultCollector();
		newCollector.load(batch);

		assert.strictEqual(newCollector.count, 30);
		assert.strictEqual(newCollector.getUniqueSuts().length, 3);

		// Verify aggregation works on loaded data
		const aggregates = aggregateResults(newCollector.getAll());
		assert.ok(aggregates.length > 0);
	});

	it("should generate multiple tables from same aggregates", () => {
		const results = createTestResults();
		const aggregates = aggregateResults(results);
		const renderer = new LaTeXRenderer();

		const specs: TableRenderSpec[] = [
			{
				id: "runtime",
				filename: "runtime.tex",
				label: "tab:runtime",
				caption: "Runtime comparison",
				columns: [
					{ key: "method", header: "Method", align: "l" },
					{ key: "time", header: "Time (ms)", align: "r" },
				],
				extractData: (aggs) =>
					aggs.map((a) => ({
						method: a.sut,
						time: a.metrics["execution-time"].mean.toFixed(1),
					})),
			},
			{
				id: "quality",
				filename: "quality.tex",
				label: "tab:quality",
				caption: "Quality metrics",
				columns: [
					{ key: "method", header: "Method", align: "l" },
					{ key: "diversity", header: "Diversity", align: "r" },
				],
				extractData: (aggs) =>
					aggs.map((a) => ({
						method: a.sut,
						diversity: a.metrics["path-diversity"].mean.toFixed(3),
					})),
			},
		];

		const outputs = renderer.renderAll(aggregates, specs);

		assert.strictEqual(outputs.length, 2);
		assert.strictEqual(outputs[0].id, "runtime");
		assert.strictEqual(outputs[1].id, "quality");
		assert.ok(outputs[0].content.includes("Runtime comparison"));
		assert.ok(outputs[1].content.includes("Quality metrics"));
	});

	it("should handle claims with scope constraints", () => {
		// Create results with different case classes
		const results: EvaluationResult[] = [];

		// Scale-free: primary is better
		for (let index = 0; index < 5; index++) {
			results.push(
				createMockResult({
					run: {
						runId: `dp-sf-${index}`,
						sut: "degree-prioritised-v1.0.0",
						sutRole: "primary",
						caseId: `sf-case-${index}`,
						caseClass: "scale-free",
					},
					metrics: { numeric: { "execution-time": 50 } },
				}),
			);
			results.push(
				createMockResult({
					run: {
						runId: `bfs-sf-${index}`,
						sut: "standard-bfs-v1.0.0",
						sutRole: "baseline",
						caseId: `sf-case-${index}`,
						caseClass: "scale-free",
					},
					metrics: { numeric: { "execution-time": 100 } },
				}),
			);
		}

		// Random: baseline is better (hypothetically)
		for (let index = 0; index < 5; index++) {
			results.push(
				createMockResult({
					run: {
						runId: `dp-rand-${index}`,
						sut: "degree-prioritised-v1.0.0",
						sutRole: "primary",
						caseId: `rand-case-${index}`,
						caseClass: "random",
					},
					metrics: { numeric: { "execution-time": 100 } },
				}),
			);
			results.push(
				createMockResult({
					run: {
						runId: `bfs-rand-${index}`,
						sut: "standard-bfs-v1.0.0",
						sutRole: "baseline",
						caseId: `rand-case-${index}`,
						caseClass: "random",
					},
					metrics: { numeric: { "execution-time": 100 } },
				}),
			);
		}

		const aggregates = aggregateResults(results);

		// Claim scoped to scale-free should be satisfied
		const scopedClaim: EvaluationClaim = {
			claimId: "SF-SPEED",
			description: "DP is faster on scale-free graphs",
			sut: "degree-prioritised-v1.0.0",
			baseline: "standard-bfs-v1.0.0",
			metric: "execution-time",
			direction: "less",
			scope: "caseClass",
			scopeConstraints: { caseClass: "scale-free" },
		};

		// Evaluate claims using the new evaluator API
		const context: EvaluationContext = {
			aggregates,
			metadata: { source: "test" },
		};
		const evalOutput = claimsEvaluator.evaluate({ claims: [scopedClaim] }, context);
		const evaluations = evalOutput.data.evaluations;

		assert.strictEqual(evaluations[0].status, "satisfied");
	});

	it("should detect violated claims correctly", () => {
		// Create results where the claim will be violated
		const results: EvaluationResult[] = [];

		// Primary is SLOWER than baseline (claim violation)
		for (let index = 0; index < 5; index++) {
			results.push(
				createMockResult({
					run: {
						runId: `primary-${index}`,
						sut: "primary-algorithm",
						sutRole: "primary",
						caseId: `case-${index}`,
					},
					metrics: { numeric: { "execution-time": 150 } },
				}),
			);
			results.push(
				createMockResult({
					run: {
						runId: `baseline-${index}`,
						sut: "baseline-algorithm",
						sutRole: "baseline",
						caseId: `case-${index}`,
					},
					metrics: { numeric: { "execution-time": 100 } },
				}),
			);
		}

		const aggregates = aggregateResults(results, { groupByCaseClass: false });

		const claim: EvaluationClaim = {
			claimId: "VIOLATED",
			description: "Primary should be faster (but isn't)",
			sut: "primary-algorithm",
			baseline: "baseline-algorithm",
			metric: "execution-time",
			direction: "less",
			scope: "global",
		};

		// Evaluate claims using the new evaluator API
		const context: EvaluationContext = {
			aggregates,
			metadata: { source: "test" },
		};
		const evalOutput = claimsEvaluator.evaluate({ claims: [claim] }, context);
		const evaluations = evalOutput.data.evaluations;

		assert.strictEqual(evaluations[0].status, "violated");
		assert.ok(evaluations[0].evidence.delta > 0); // 150 - 100 = 50
	});
});
