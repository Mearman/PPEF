/**
 * Index Export Tests
 *
 * Verifies that all index.ts files can be imported and export expected symbols.
 * These files have 0% coverage but are critical for the public API.
 */

import assert from "node:assert/strict";
import { test, describe } from "node:test";

describe("index.ts export verification", () => {
	test("src/aggregation/index.ts exports aggregators and pipeline", async () => {
		// Import should not throw
		const aggregationModule = await import("../aggregation/index.js");

		// Verify exports exist
		assert.ok(aggregationModule, "aggregation module should import");
		assert.ok(
			typeof aggregationModule.computeComparison === "function",
			"should export computeComparison",
		);
		assert.ok(
			typeof aggregationModule.computeMaxSpeedup === "function",
			"should export computeMaxSpeedup",
		);
		assert.ok(
			typeof aggregationModule.computeRankings === "function",
			"should export computeRankings",
		);
		assert.ok(
			typeof aggregationModule.computeSpeedup === "function",
			"should export computeSpeedup",
		);
		assert.ok(
			typeof aggregationModule.computeSummaryStats === "function",
			"should export computeSummaryStats",
		);
		assert.ok(
			typeof aggregationModule.aggregateResults === "function",
			"should export aggregateResults",
		);
		assert.ok(
			typeof aggregationModule.createAggregationOutput === "function",
			"should export createAggregationOutput",
		);
	});

	test("src/claims/index.ts exports evaluator", async () => {
		const claimsModule = await import("../claims/index.js");

		assert.ok(claimsModule, "claims module should import");
		assert.ok(typeof claimsModule.evaluateClaim === "function", "should export evaluateClaim");
		assert.ok(typeof claimsModule.evaluateClaims === "function", "should export evaluateClaims");
		assert.ok(
			typeof claimsModule.createClaimSummary === "function",
			"should export createClaimSummary",
		);
	});

	test("src/collector/index.ts exports result-collector and schema", async () => {
		const collectorModule = await import("../collector/index.js");

		assert.ok(collectorModule, "collector module should import");
		assert.ok(
			typeof collectorModule.ResultCollector === "function",
			"should export ResultCollector",
		);
		assert.ok(collectorModule.resultCollector, "should export resultCollector instance");
		assert.ok(typeof collectorModule.deepFreeze === "function", "should export deepFreeze");
		assert.ok(typeof collectorModule.validateCase === "function", "should export validateCase");
		assert.ok(typeof collectorModule.validateResult === "function", "should export validateResult");
		assert.ok(
			typeof collectorModule.validateSutRegistration === "function",
			"should export validateSutRegistration",
		);
	});

	test("src/executor/index.ts exports executor types and functions", async () => {
		const executorModule = await import("../executor/index.js");

		assert.ok(executorModule, "executor module should import");
		assert.ok(
			typeof executorModule.CheckpointManager === "function",
			"should export CheckpointManager",
		);
		assert.ok(
			typeof executorModule.createFileCheckpointManager === "function",
			"should export createFileCheckpointManager",
		);
		assert.ok(typeof executorModule.getGitCommit === "function", "should export getGitCommit");
		assert.ok(
			typeof executorModule.createCheckpointStorage === "function",
			"should export createCheckpointStorage",
		);
		assert.ok(typeof executorModule.FileStorage === "function", "should export FileStorage");
		assert.ok(typeof executorModule.GitStorage === "function", "should export GitStorage");
		assert.ok(typeof executorModule.InMemoryLock === "function", "should export InMemoryLock");
		assert.ok(typeof executorModule.NodeFileSystem === "function", "should export NodeFileSystem");
		assert.ok(
			typeof executorModule.getGitNamespace === "function",
			"should export getGitNamespace",
		);
		assert.ok(typeof executorModule.createExecutor === "function", "should export createExecutor");
		assert.ok(typeof executorModule.Executor === "function", "should export Executor");
		assert.ok(
			typeof executorModule.executeParallel === "function",
			"should export executeParallel",
		);
		assert.ok(typeof executorModule.shardPath === "function", "should export shardPath");
		assert.ok(
			typeof executorModule.generateConfigHash === "function",
			"should export generateConfigHash",
		);
		assert.ok(typeof executorModule.generateRunId === "function", "should export generateRunId");
		assert.ok(typeof executorModule.parseRunId === "function", "should export parseRunId");
		assert.ok(typeof executorModule.validateRunId === "function", "should export validateRunId");
		assert.ok(executorModule.DEFAULT_EXECUTOR_CONFIG, "should export DEFAULT_EXECUTOR_CONFIG");
	});

	test("src/registry/index.ts exports registries", async () => {
		const registryModule = await import("../registry/index.js");

		assert.ok(registryModule, "registry module should import");
		assert.ok(typeof registryModule.CaseRegistry === "function", "should export CaseRegistry");
		assert.ok(typeof registryModule.SUTRegistry === "function", "should export SUTRegistry");
		assert.ok(registryModule.caseRegistry, "should export caseRegistry instance");
		assert.ok(registryModule.sutRegistry, "should export sutRegistry instance");
	});

	test("src/renderers/index.ts exports renderers and types", async () => {
		const renderersModule = await import("../renderers/index.js");

		assert.ok(renderersModule, "renderers module should import");
		assert.ok(typeof renderersModule.LaTeXRenderer === "function", "should export LaTeXRenderer");
		assert.ok(
			typeof renderersModule.createLatexRenderer === "function",
			"should export createLatexRenderer",
		);
		assert.ok(typeof renderersModule.escapeLatex === "function", "should export escapeLatex");
		assert.ok(renderersModule.LATEX_CLAIM_STATUS, "should export LATEX_CLAIM_STATUS");
		assert.ok(renderersModule.UNICODE_CLAIM_STATUS, "should export UNICODE_CLAIM_STATUS");
	});

	test("src/robustness/index.ts exports analyzer and perturbations", async () => {
		const robustnessModule = await import("../robustness/index.js");

		assert.ok(robustnessModule, "robustness module should import");
		assert.ok(
			typeof robustnessModule.analyzeRobustnessForMetric === "function",
			"should export analyzeRobustnessForMetric",
		);
		assert.ok(
			typeof robustnessModule.analyzeRobustnessWithCurve === "function",
			"should export analyzeRobustnessWithCurve",
		);
		assert.ok(
			typeof robustnessModule.compareRobustness === "function",
			"should export compareRobustness",
		);
		assert.ok(
			typeof robustnessModule.createRobustnessAnalysis === "function",
			"should export createRobustnessAnalysis",
		);
		assert.ok(
			typeof robustnessModule.createPerturbation === "function",
			"should export createPerturbation",
		);
		assert.ok(robustnessModule.edgeRemovalPerturbation, "should export edgeRemovalPerturbation");
		assert.ok(
			typeof robustnessModule.getPerturbation === "function",
			"should export getPerturbation",
		);
		assert.ok(robustnessModule.nodeRemovalPerturbation, "should export nodeRemovalPerturbation");
		assert.ok(robustnessModule.seedShiftPerturbation, "should export seedShiftPerturbation");
		assert.ok(robustnessModule.weightNoisePerturbation, "should export weightNoisePerturbation");
		assert.ok(robustnessModule.PERTURBATIONS, "should export PERTURBATIONS");
	});

	test("src/statistical/index.ts exports mann-whitney-u", async () => {
		const statisticalModule = await import("../statistical/index.js");

		assert.ok(statisticalModule, "statistical module should import");
		assert.ok(
			typeof statisticalModule.mannWhitneyUTest === "function",
			"should export mannWhitneyUTest",
		);
		assert.ok(typeof statisticalModule.normalCDF === "function", "should export normalCDF");
		assert.ok(typeof statisticalModule.cohensD === "function", "should export cohensD");
		assert.ok(
			typeof statisticalModule.confidenceInterval === "function",
			"should export confidenceInterval",
		);
	});

	test("src/types/index.ts exports all type definitions", async () => {
		// Types are re-exported, so we verify the module loads successfully
		// TypeScript types are erased at runtime, but we can verify the module exists
		const typesModule = await import("../types/index.js");

		assert.ok(typesModule, "types module should import");
		// Note: Type-only exports are not available at runtime in JavaScript
		// The fact that the import succeeds is sufficient verification
	});

	test("src/index.ts exports all modules (main entry point)", async () => {
		const mainModule = await import("../index.js");

		assert.ok(mainModule, "main module should import");

		// Verify all sub-modules are re-exported
		// Types module (type-only exports, so we check other modules)
		assert.ok(
			typeof mainModule.CaseRegistry === "function",
			"should export CaseRegistry from registry",
		);
		assert.ok(
			typeof mainModule.SUTRegistry === "function",
			"should export SUTRegistry from registry",
		);
		assert.ok(typeof mainModule.Executor === "function", "should export Executor from executor");
		assert.ok(
			typeof mainModule.createExecutor === "function",
			"should export createExecutor from executor",
		);
		assert.ok(
			typeof mainModule.ResultCollector === "function",
			"should export ResultCollector from collector",
		);
		assert.ok(
			typeof mainModule.mannWhitneyUTest === "function",
			"should export mannWhitneyUTest from statistical",
		);
		assert.ok(
			typeof mainModule.computeSpeedup === "function",
			"should export computeSpeedup from aggregation",
		);
		assert.ok(
			typeof mainModule.evaluateClaim === "function",
			"should export evaluateClaim from claims",
		);
		assert.ok(
			typeof mainModule.analyzeRobustnessForMetric === "function",
			"should export analyzeRobustnessForMetric from robustness",
		);
		assert.ok(
			typeof mainModule.LaTeXRenderer === "function",
			"should export LaTeXRenderer from renderers",
		);
	});
});
