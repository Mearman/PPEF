/**
 * Unit tests for ResultCollector
 *
 * Tests result collection, validation, querying, and serialization.
 */

import { beforeEach, describe, it } from "node:test";
import { strict as assert } from "node:assert";

import type { Primitive } from "../../types/case.js";
import type { EvaluationResult, ResultBatch } from "../../types/result.js";
import { ResultCollector } from "../result-collector.js";
import {
	createInvalidResult,
	createMinimalValidResult,
	createMockResult,
	createMockResults,
} from "../../__tests__/test-helpers.js";

describe("ResultCollector", () => {
	let collector: ResultCollector;

	beforeEach(() => {
		collector = new ResultCollector();
	});

	describe("record", () => {
		it("should add a valid result", () => {
			const result = createMockResult();
			collector.record(result);
			assert.strictEqual(collector.count, 1);
		});

		it("should throw on result with empty runId", () => {
			const result = createMockResult({
				run: { ...createMockResult().run, runId: "" },
			});
			assert.throws(() => {
				collector.record(result);
			}, /Invalid result/);
		});

		it("should throw on result with empty sut", () => {
			const result = createMockResult({
				run: { ...createMockResult().run, sut: "" },
			});
			assert.throws(() => {
				collector.record(result);
			}, /Invalid result/);
		});

		it("should throw on result with empty caseId", () => {
			const result = createMockResult({
				run: { ...createMockResult().run, caseId: "" },
			});
			assert.throws(() => {
				collector.record(result);
			}, /Invalid result/);
		});

		it("should throw on result with no numeric metrics", () => {
			const result = createMockResult({
				metrics: { numeric: {} },
			});
			assert.throws(() => {
				collector.record(result);
			}, /Invalid result/);
		});

		it("should throw on result with empty platform", () => {
			const result = createMockResult({
				provenance: {
					...createMockResult().provenance,
					runtime: {
						...createMockResult().provenance.runtime,
						platform: "",
					},
				},
			});
			assert.throws(() => {
				collector.record(result);
			}, /Invalid result/);
		});

		it("should throw on result with multiple validation errors", () => {
			const result = createMockResult({
				run: { runId: "", sut: "", sutRole: "primary", caseId: "" },
				metrics: { numeric: {} },
				provenance: {
					runtime: {
						platform: "",
						arch: "arm64",
						nodeVersion: "20.0.0",
					},
					timestamp: new Date().toISOString(),
				},
			});
			assert.throws(() => {
				collector.record(result);
			}, /Invalid result/);
		});

		it("should accept minimal valid result with at least one metric", () => {
			const result = createMinimalValidResult();
			// createMinimalValidResult creates empty metrics, so add one
			result.metrics.numeric = { test: 1 };
			collector.record(result);
			assert.strictEqual(collector.count, 1);
		});

		it("should accept result with undefined caseClass", () => {
			const result = createMockResult({
				run: { ...createMockResult().run, caseClass: undefined },
			});
			collector.record(result);
			assert.strictEqual(collector.count, 1);
		});

		it("should accept result with optional fields missing", () => {
			const result: EvaluationResult = {
				run: {
					runId: "test-001",
					sut: "test-sut",
					sutRole: "primary",
					caseId: "case-001",
				},
				correctness: {
					expectedExists: true,
					producedOutput: true,
					valid: true,
					matchesExpected: true,
				},
				outputs: { summary: {} },
				metrics: { numeric: { time: 100 } },
				provenance: {
					runtime: {
						platform: "test",
						arch: "test",
						nodeVersion: "20.0.0",
					},
					timestamp: new Date().toISOString(),
				},
			};
			collector.record(result);
			assert.strictEqual(collector.count, 1);
		});
	});

	describe("recordBatch", () => {
		it("should add multiple valid results", () => {
			const results = createMockResults(5, "sut-v1", "primary", "test-class");
			collector.recordBatch(results);
			assert.strictEqual(collector.count, 5);
		});

		it("should throw when batch contains invalid result", () => {
			const invalidResult = createMockResult({
				run: { runId: "", sut: "bad", sutRole: "primary", caseId: "bad" },
				metrics: { numeric: {} },
				provenance: {
					runtime: {
						platform: "",
						arch: "arm64",
						nodeVersion: "20.0.0",
					},
					timestamp: new Date().toISOString(),
				},
			});
			assert.throws(() => {
				collector.recordBatch([invalidResult]);
			});
			assert.strictEqual(collector.count, 0);
		});

		it("should handle empty batch", () => {
			collector.recordBatch([]);
			assert.strictEqual(collector.count, 0);
		});

		it("should add results from different SUTs", () => {
			const batch1 = createMockResults(2, "sut-1", "primary");
			const batch2 = createMockResults(3, "sut-2", "baseline");
			collector.recordBatch([...batch1, ...batch2]);
			assert.strictEqual(collector.count, 5);
		});

		it("should preserve insertion order", () => {
			const results = createMockResults(3, "sut-v1");
			collector.recordBatch(results);
			const all = collector.getAll();
			assert.strictEqual(all[0].run.runId, results[0].run.runId);
			assert.strictEqual(all[1].run.runId, results[1].run.runId);
			assert.strictEqual(all[2].run.runId, results[2].run.runId);
		});
	});

	describe("validate", () => {
		it("should return empty array for valid result", () => {
			const result = createMockResult();
			const errors = collector.validate(result);
			assert.deepStrictEqual(errors, []);
		});

		it("should detect empty runId", () => {
			const result = createMockResult({
				run: { ...createMockResult().run, runId: "" },
			});
			const errors = collector.validate(result);
			assert.ok(errors.some((e) => e.field === "run.runId"));
		});

		it("should detect empty sut", () => {
			const result = createMockResult({
				run: { ...createMockResult().run, sut: "" },
			});
			const errors = collector.validate(result);
			assert.ok(errors.some((e) => e.field === "run.sut"));
		});

		it("should detect empty caseId", () => {
			const result = createMockResult({
				run: { ...createMockResult().run, caseId: "" },
			});
			const errors = collector.validate(result);
			assert.ok(errors.some((e) => e.field === "run.caseId"));
		});

		it("should detect empty numeric metrics", () => {
			const result = createMockResult({
				metrics: { numeric: {} },
			});
			const errors = collector.validate(result);
			assert.ok(errors.some((e) => e.field === "metrics.numeric"));
		});

		it("should detect empty platform", () => {
			const result = createMockResult({
				provenance: {
					...createMockResult().provenance,
					runtime: {
						...createMockResult().provenance.runtime,
						platform: "",
					},
				},
			});
			const errors = collector.validate(result);
			assert.ok(errors.some((e) => e.field === "provenance.runtime.platform"));
		});

		it("should return multiple errors for invalid result", () => {
			const result = createMockResult({
				run: { runId: "", sut: "", sutRole: "primary", caseId: "" },
				metrics: { numeric: {} },
				provenance: {
					runtime: {
						platform: "",
						arch: "arm64",
						nodeVersion: "20.0.0",
					},
					timestamp: new Date().toISOString(),
				},
			});
			const errors = collector.validate(result);
			assert.ok(errors.length >= 4);
		});

		it("should not validate optional fields like caseClass", () => {
			const result = createMockResult({
				run: { ...createMockResult().run, caseClass: undefined },
			});
			const errors = collector.validate(result);
			assert.deepStrictEqual(errors, []);
		});
	});

	describe("query", () => {
		beforeEach(() => {
			const results = [
				createMockResult({
					run: {
						runId: "run-001",
						sut: "sut-1",
						sutRole: "primary",
						caseId: "case-001",
						caseClass: "class-a",
					},
					correctness: {
						expectedExists: true,
						producedOutput: true,
						valid: true,
						matchesExpected: true,
					},
					metrics: { numeric: { time: 100, memory: 50 } },
				}),
				createMockResult({
					run: {
						runId: "run-002",
						sut: "sut-1",
						sutRole: "primary",
						caseId: "case-002",
						caseClass: "class-b",
					},
					correctness: {
						expectedExists: true,
						producedOutput: true,
						valid: false,
						matchesExpected: false,
					},
					metrics: { numeric: { time: 200 } },
				}),
				createMockResult({
					run: {
						runId: "run-003",
						sut: "sut-2",
						sutRole: "baseline",
						caseId: "case-001",
						caseClass: "class-a",
					},
					correctness: {
						expectedExists: true,
						producedOutput: true,
						valid: true,
						matchesExpected: true,
					},
					metrics: { numeric: { time: 150, memory: 75 } },
				}),
			];
			collector.recordBatch(results);
		});

		it("should return all results with no filter", () => {
			const results = collector.query();
			assert.strictEqual(results.length, 3);
		});

		it("should filter by sut", () => {
			const results = collector.query({ sut: "sut-1" });
			assert.strictEqual(results.length, 2);
			assert.ok(results.every((r) => r.run.sut === "sut-1"));
		});

		it("should filter by sutRole", () => {
			const results = collector.query({ sutRole: "baseline" });
			assert.strictEqual(results.length, 1);
			assert.strictEqual(results[0].run.sutRole, "baseline");
		});

		it("should filter by caseId", () => {
			const results = collector.query({ caseId: "case-001" });
			assert.strictEqual(results.length, 2);
			assert.ok(results.every((r) => r.run.caseId === "case-001"));
		});

		it("should filter by caseClass", () => {
			const results = collector.query({ caseClass: "class-a" });
			assert.strictEqual(results.length, 2);
			assert.ok(results.every((r) => r.run.caseClass === "class-a"));
		});

		it("should filter by valid", () => {
			const results = collector.query({ valid: true });
			assert.strictEqual(results.length, 2);
			assert.ok(results.every((r) => r.correctness.valid));
		});

		it("should filter by hasMetric", () => {
			const results = collector.query({ hasMetric: "memory" });
			assert.strictEqual(results.length, 2);
			assert.ok(results.every((r) => "memory" in r.metrics.numeric));
		});

		it("should filter by custom predicate", () => {
			const results = collector.query({
				predicate: (r) => r.metrics.numeric.time > 120,
			});
			assert.strictEqual(results.length, 2);
		});

		it("should combine multiple filters", () => {
			const results = collector.query({
				sut: "sut-1",
				caseClass: "class-a",
				valid: true,
			});
			assert.strictEqual(results.length, 1);
			assert.strictEqual(results[0].run.runId, "run-001");
		});

		it("should return empty array for non-matching filter", () => {
			const results = collector.query({ sut: "non-existent" });
			assert.deepStrictEqual(results, []);
		});

		it("should handle undefined caseClass in filter", () => {
			const result = createMockResult({
				run: {
					runId: "run-no-class",
					sut: "sut-3",
					sutRole: "primary",
					caseId: "case-003",
				},
				metrics: { numeric: { time: 100 } },
			});
			collector.record(result);

			const withClass = collector.query({ caseClass: "class-a" });
			const withoutClass = collector.query({ sut: "sut-3" });

			assert.strictEqual(withClass.length, 2);
			assert.strictEqual(withoutClass.length, 1);
		});
	});

	describe("getBySut", () => {
		beforeEach(() => {
			const batch1 = createMockResults(3, "sut-1", "primary", "class-a");
			const batch2 = createMockResults(2, "sut-2", "baseline", "class-b");
			collector.recordBatch([...batch1, ...batch2]);
		});

		it("should return all results for specified SUT", () => {
			const results = collector.getBySut("sut-1");
			assert.strictEqual(results.length, 3);
			assert.ok(results.every((r) => r.run.sut === "sut-1"));
		});

		it("should return empty array for non-existent SUT", () => {
			const results = collector.getBySut("non-existent");
			assert.deepStrictEqual(results, []);
		});

		it("should return results with different roles for same SUT", () => {
			const result1 = createMockResult({
				run: {
					runId: "run-001",
					sut: "multi-role-sut",
					sutRole: "primary",
					caseId: "case-001",
				},
				metrics: { numeric: { time: 100 } },
			});
			const result2 = createMockResult({
				run: {
					runId: "run-002",
					sut: "multi-role-sut",
					sutRole: "baseline",
					caseId: "case-002",
				},
				metrics: { numeric: { time: 100 } },
			});
			collector.recordBatch([result1, result2]);

			const results = collector.getBySut("multi-role-sut");
			assert.strictEqual(results.length, 2);
		});
	});

	describe("getByCaseClass", () => {
		beforeEach(() => {
			const results = [
				createMockResult({
					run: {
						runId: "run-001",
						sut: "sut-1",
						sutRole: "primary",
						caseId: "case-001",
						caseClass: "graph",
					},
					metrics: { numeric: { time: 100 } },
				}),
				createMockResult({
					run: {
						runId: "run-002",
						sut: "sut-1",
						sutRole: "primary",
						caseId: "case-002",
						caseClass: "graph",
					},
					metrics: { numeric: { time: 100 } },
				}),
				createMockResult({
					run: {
						runId: "run-003",
						sut: "sut-2",
						sutRole: "baseline",
						caseId: "case-003",
						caseClass: "tree",
					},
					metrics: { numeric: { time: 100 } },
				}),
				createMockResult({
					run: {
						runId: "run-004",
						sut: "sut-1",
						sutRole: "primary",
						caseId: "case-004",
					},
					metrics: { numeric: { time: 100 } },
				}),
			];
			collector.recordBatch(results);
		});

		it("should return all results for specified case class", () => {
			const results = collector.getByCaseClass("graph");
			assert.strictEqual(results.length, 2);
			assert.ok(results.every((r) => r.run.caseClass === "graph"));
		});

		it("should return empty array for non-existent case class", () => {
			const results = collector.getByCaseClass("non-existent");
			assert.deepStrictEqual(results, []);
		});

		it("should not include results with undefined caseClass", () => {
			const results = collector.getByCaseClass("graph");
			assert.strictEqual(results.length, 2);
			assert.ok(results.every((r) => r.run.caseClass !== undefined));
		});
	});

	describe("getUniqueSuts", () => {
		it("should return empty array when no results", () => {
			const suts = collector.getUniqueSuts();
			assert.deepStrictEqual(suts, []);
		});

		it("should return unique SUT IDs", () => {
			const batch1 = createMockResults(3, "sut-1", "primary");
			const batch2 = createMockResults(2, "sut-2", "baseline");
			collector.recordBatch([...batch1, ...batch2]);

			const suts = collector.getUniqueSuts();
			assert.strictEqual(suts.length, 2);
			assert.ok(suts.includes("sut-1"));
			assert.ok(suts.includes("sut-2"));
		});

		it("should preserve insertion order", () => {
			collector.recordBatch(createMockResults(1, "sut-c", "primary"));
			collector.recordBatch(createMockResults(1, "sut-a", "primary"));
			collector.recordBatch(createMockResults(1, "sut-b", "primary"));

			const suts = collector.getUniqueSuts();
			assert.deepStrictEqual(suts, ["sut-c", "sut-a", "sut-b"]);
		});

		it("should handle same SUT with different roles", () => {
			const result1 = createMockResult({
				run: {
					runId: "run-001",
					sut: "same-sut",
					sutRole: "primary",
					caseId: "case-001",
				},
				metrics: { numeric: { time: 100 } },
			});
			const result2 = createMockResult({
				run: {
					runId: "run-002",
					sut: "same-sut",
					sutRole: "baseline",
					caseId: "case-002",
				},
				metrics: { numeric: { time: 100 } },
			});
			collector.recordBatch([result1, result2]);

			const suts = collector.getUniqueSuts();
			assert.deepStrictEqual(suts, ["same-sut"]);
		});
	});

	describe("getUniqueCaseClasses", () => {
		it("should return empty array when no results", () => {
			const classes = collector.getUniqueCaseClasses();
			assert.deepStrictEqual(classes, []);
		});

		it("should return unique case classes", () => {
			const results = [
				createMockResult({
					run: {
						runId: "run-001",
						sut: "sut-1",
						sutRole: "primary",
						caseId: "case-001",
						caseClass: "graph",
					},
					metrics: { numeric: { time: 100 } },
				}),
				createMockResult({
					run: {
						runId: "run-002",
						sut: "sut-1",
						sutRole: "primary",
						caseId: "case-002",
						caseClass: "tree",
					},
					metrics: { numeric: { time: 100 } },
				}),
				createMockResult({
					run: {
						runId: "run-003",
						sut: "sut-2",
						sutRole: "baseline",
						caseId: "case-003",
						caseClass: "graph",
					},
					metrics: { numeric: { time: 100 } },
				}),
			];
			collector.recordBatch(results);

			const classes = collector.getUniqueCaseClasses();
			assert.strictEqual(classes.length, 2);
			assert.ok(classes.includes("graph"));
			assert.ok(classes.includes("tree"));
		});

		it("should exclude undefined caseClass", () => {
			const results = [
				createMockResult({
					run: {
						runId: "run-001",
						sut: "sut-1",
						sutRole: "primary",
						caseId: "case-001",
						caseClass: "graph",
					},
					metrics: { numeric: { time: 100 } },
				}),
				createMockResult({
					run: {
						runId: "run-002",
						sut: "sut-1",
						sutRole: "primary",
						caseId: "case-002",
						caseClass: undefined as string | undefined,
					},
					metrics: { numeric: { time: 100 } },
				}),
			];
			collector.recordBatch(results);

			const classes = collector.getUniqueCaseClasses();
			assert.deepStrictEqual(classes, ["graph"]);
		});

		it("should preserve insertion order", () => {
			collector.record(
				createMockResult({
					run: {
						runId: "run-001",
						sut: "sut-1",
						sutRole: "primary",
						caseId: "case-001",
						caseClass: "class-c",
					},
					metrics: { numeric: { time: 100 } },
				}),
			);
			collector.record(
				createMockResult({
					run: {
						runId: "run-002",
						sut: "sut-1",
						sutRole: "primary",
						caseId: "case-002",
						caseClass: "class-a",
					},
					metrics: { numeric: { time: 100 } },
				}),
			);
			collector.record(
				createMockResult({
					run: {
						runId: "run-003",
						sut: "sut-2",
						sutRole: "baseline",
						caseId: "case-003",
						caseClass: "class-b",
					},
					metrics: { numeric: { time: 100 } },
				}),
			);

			const classes = collector.getUniqueCaseClasses();
			assert.deepStrictEqual(classes, ["class-c", "class-a", "class-b"]);
		});
	});

	describe("getUniqueMetrics", () => {
		it("should return empty array when no results", () => {
			const metrics = collector.getUniqueMetrics();
			assert.deepStrictEqual(metrics, []);
		});

		it("should return unique metric names across all results", () => {
			const results = [
				createMockResult({
					run: {
						runId: "run-001",
						sut: "sut-1",
						sutRole: "primary",
						caseId: "case-001",
					},
					metrics: { numeric: { time: 100, memory: 50 } },
				}),
				createMockResult({
					run: {
						runId: "run-002",
						sut: "sut-1",
						sutRole: "primary",
						caseId: "case-002",
					},
					metrics: { numeric: { time: 200, nodes: 10 } },
				}),
			];
			collector.recordBatch(results);

			const metrics = collector.getUniqueMetrics();
			assert.strictEqual(metrics.length, 3);
			assert.ok(metrics.includes("time"));
			assert.ok(metrics.includes("memory"));
			assert.ok(metrics.includes("nodes"));
		});

		it("should preserve insertion order of first occurrence", () => {
			collector.record(
				createMockResult({
					run: {
						runId: "run-001",
						sut: "sut-1",
						sutRole: "primary",
						caseId: "case-001",
					},
					metrics: { numeric: { z: 1, a: 2 } },
				}),
			);
			collector.record(
				createMockResult({
					run: {
						runId: "run-002",
						sut: "sut-1",
						sutRole: "primary",
						caseId: "case-002",
					},
					metrics: { numeric: { b: 3 } },
				}),
			);

			const metrics = collector.getUniqueMetrics();
			assert.deepStrictEqual(metrics, ["z", "a", "b"]);
		});
	});

	describe("getAll", () => {
		it("should return empty array when no results", () => {
			const results = collector.getAll();
			assert.deepStrictEqual(results, []);
		});

		it("should return copy of all results", () => {
			const original = createMockResults(3, "sut-1");
			collector.recordBatch(original);
			const retrieved = collector.getAll();
			assert.strictEqual(retrieved.length, 3);
			assert.deepStrictEqual(retrieved, original);
		});

		it("should not return reference to internal array", () => {
			collector.recordBatch(createMockResults(2, "sut-1"));
			const results1 = collector.getAll();
			const results2 = collector.getAll();
			assert.notStrictEqual(results1, results2);
		});

		it("should preserve insertion order", () => {
			const results = createMockResults(3, "sut-1");
			collector.recordBatch(results);
			const retrieved = collector.getAll();
			assert.strictEqual(retrieved[0].run.runId, results[0].run.runId);
			assert.strictEqual(retrieved[1].run.runId, results[1].run.runId);
			assert.strictEqual(retrieved[2].run.runId, results[2].run.runId);
		});
	});

	describe("count getter", () => {
		it("should return 0 when empty", () => {
			assert.strictEqual(collector.count, 0);
		});

		it("should return number of results", () => {
			collector.recordBatch(createMockResults(5, "sut-1"));
			assert.strictEqual(collector.count, 5);
		});

		it("should update after adding results", () => {
			assert.strictEqual(collector.count, 0);
			collector.record(createMockResult());
			assert.strictEqual(collector.count, 1);
			collector.recordBatch(createMockResults(3, "sut-1"));
			assert.strictEqual(collector.count, 4);
		});

		it("should update after clearing", () => {
			collector.recordBatch(createMockResults(5, "sut-1"));
			assert.strictEqual(collector.count, 5);
			collector.clear();
			assert.strictEqual(collector.count, 0);
		});
	});

	describe("isEmpty getter", () => {
		it("should return true when empty", () => {
			assert.strictEqual(collector.isEmpty, true);
		});

		it("should return false when has results", () => {
			collector.record(createMockResult());
			assert.strictEqual(collector.isEmpty, false);
		});

		it("should return true after clearing", () => {
			collector.record(createMockResult());
			assert.strictEqual(collector.isEmpty, false);
			collector.clear();
			assert.strictEqual(collector.isEmpty, true);
		});
	});

	describe("clear", () => {
		it("should remove all results", () => {
			collector.recordBatch(createMockResults(5, "sut-1"));
			assert.strictEqual(collector.count, 5);
			collector.clear();
			assert.strictEqual(collector.count, 0);
			assert.deepStrictEqual(collector.getAll(), []);
		});

		it("should be idempotent", () => {
			collector.recordBatch(createMockResults(3, "sut-1"));
			collector.clear();
			collector.clear();
			assert.strictEqual(collector.count, 0);
		});

		it("should clear empty collector", () => {
			collector.clear();
			assert.strictEqual(collector.count, 0);
		});
	});

	describe("serialize", () => {
		beforeEach(() => {
			const results = createMockResults(3, "sut-1", "primary", "test-class");
			collector.recordBatch(results);
		});

		it("should create ResultBatch with version", () => {
			const batch = collector.serialize();
			assert.strictEqual(batch.version, "1.0.0");
		});

		it("should include timestamp", () => {
			const before = new Date().toISOString();
			const batch = collector.serialize();
			const after = new Date().toISOString();
			assert.ok(batch.timestamp >= before);
			assert.ok(batch.timestamp <= after);
		});

		it("should include all results", () => {
			const batch = collector.serialize();
			assert.strictEqual(batch.results.length, 3);
		});

		it("should have undefined metadata by default", () => {
			const batch = collector.serialize();
			assert.strictEqual(batch.metadata, undefined);
		});

		it("should include custom metadata", () => {
			const metadata: Record<string, Primitive> = {
				experimentId: "exp-001",
				totalRuns: 10,
				successRate: 0.95,
			};
			const batch = collector.serialize(metadata);
			assert.deepStrictEqual(batch.metadata, metadata);
		});

		it("should create independent copy of results", () => {
			const batch = collector.serialize();
			const originalResults = collector.getAll();
			assert.notStrictEqual(batch.results, originalResults);
			assert.deepStrictEqual(batch.results, originalResults);
		});
	});

	describe("load", () => {
		it("should replace existing results when append is false", () => {
			collector.recordBatch(createMockResults(3, "sut-1", "primary"));
			assert.strictEqual(collector.count, 3);

			const batch: ResultBatch = {
				version: "1.0.0",
				timestamp: new Date().toISOString(),
				results: createMockResults(2, "sut-2", "baseline"),
			};
			collector.load(batch);

			assert.strictEqual(collector.count, 2);
			const suts = collector.getUniqueSuts();
			assert.deepStrictEqual(suts, ["sut-2"]);
		});

		it("should append results when append is true", () => {
			collector.recordBatch(createMockResults(2, "sut-1", "primary"));
			assert.strictEqual(collector.count, 2);

			const batch: ResultBatch = {
				version: "1.0.0",
				timestamp: new Date().toISOString(),
				results: createMockResults(3, "sut-2", "baseline"),
			};
			collector.load(batch, true);

			assert.strictEqual(collector.count, 5);
			const suts = collector.getUniqueSuts();
			assert.ok(suts.includes("sut-1"));
			assert.ok(suts.includes("sut-2"));
		});

		it("should validate results during load", () => {
			const batch: ResultBatch = {
				version: "1.0.0",
				timestamp: new Date().toISOString(),
				results: [
					createMockResult(),
					createMockResult({
						run: { runId: "", sut: "", sutRole: "primary", caseId: "" },
						metrics: { numeric: {} },
						provenance: {
							runtime: {
								platform: "",
								arch: "arm64",
								nodeVersion: "20.0.0",
							},
							timestamp: new Date().toISOString(),
						},
					}),
				],
			};
			assert.throws(() => {
				collector.load(batch);
			});
		});

		it("should handle empty batch", () => {
			collector.recordBatch(createMockResults(3, "sut-1"));
			const batch: ResultBatch = {
				version: "1.0.0",
				timestamp: new Date().toISOString(),
				results: [],
			};
			collector.load(batch);
			assert.strictEqual(collector.count, 0);
		});

		it("should preserve results when append is true and load fails", () => {
			const originalResults = createMockResults(2, "sut-1");
			collector.recordBatch(originalResults);

			const batch: ResultBatch = {
				version: "1.0.0",
				timestamp: new Date().toISOString(),
				results: [
					createMockResult({
						run: { runId: "", sut: "", sutRole: "primary", caseId: "" },
						metrics: { numeric: {} },
						provenance: {
							runtime: {
								platform: "",
								arch: "arm64",
								nodeVersion: "20.0.0",
							},
							timestamp: new Date().toISOString(),
						},
					}),
				],
			};
			assert.throws(() => {
				collector.load(batch, true);
			});
			assert.strictEqual(collector.count, 2);
		});
	});

	describe("extractMetric", () => {
		beforeEach(() => {
			const results = [
				createMockResult({
					run: {
						runId: "run-001",
						sut: "sut-1",
						sutRole: "primary",
						caseId: "case-001",
					},
					metrics: { numeric: { time: 100, memory: 50 } },
				}),
				createMockResult({
					run: {
						runId: "run-002",
						sut: "sut-1",
						sutRole: "primary",
						caseId: "case-002",
					},
					metrics: { numeric: { time: 200 } },
				}),
				createMockResult({
					run: {
						runId: "run-003",
						sut: "sut-2",
						sutRole: "baseline",
						caseId: "case-003",
					},
					metrics: { numeric: { memory: 75 } },
				}),
			];
			collector.recordBatch(results);
		});

		it("should extract metric values across all results", () => {
			const extracted = collector.extractMetric("time");
			assert.strictEqual(extracted.length, 2);
			assert.deepStrictEqual(extracted, [
				{ runId: "run-001", value: 100 },
				{ runId: "run-002", value: 200 },
			]);
		});

		it("should return empty array for non-existent metric", () => {
			const extracted = collector.extractMetric("non-existent");
			assert.deepStrictEqual(extracted, []);
		});

		it("should preserve order of insertion", () => {
			const extracted = collector.extractMetric("time");
			assert.strictEqual(extracted[0].runId, "run-001");
			assert.strictEqual(extracted[1].runId, "run-002");
		});

		it("should extract metric that exists in all results", () => {
			const results = [
				createMockResult({
					run: {
						runId: "run-001",
						sut: "sut-1",
						sutRole: "primary",
						caseId: "case-001",
					},
					metrics: { numeric: { score: 0.8 } },
				}),
				createMockResult({
					run: {
						runId: "run-002",
						sut: "sut-1",
						sutRole: "primary",
						caseId: "case-002",
					},
					metrics: { numeric: { score: 0.9 } },
				}),
			];
			collector.clear();
			collector.recordBatch(results);

			const extracted = collector.extractMetric("score");
			assert.strictEqual(extracted.length, 2);
		});
	});

	describe("getMetricValues", () => {
		beforeEach(() => {
			const results = [
				createMockResult({
					run: {
						runId: "run-001",
						sut: "sut-1",
						sutRole: "primary",
						caseId: "case-001",
					},
					metrics: { numeric: { time: 100, memory: 50 } },
				}),
				createMockResult({
					run: {
						runId: "run-002",
						sut: "sut-1",
						sutRole: "primary",
						caseId: "case-002",
					},
					metrics: { numeric: { time: 200 } },
				}),
				createMockResult({
					run: {
						runId: "run-003",
						sut: "sut-2",
						sutRole: "baseline",
						caseId: "case-003",
					},
					metrics: { numeric: { time: 150 } },
				}),
			];
			collector.recordBatch(results);
		});

		it("should return metric values for specified SUT", () => {
			const values = collector.getMetricValues("sut-1", "time");
			assert.strictEqual(values.length, 2);
			assert.deepStrictEqual(values, [100, 200]);
		});

		it("should return empty array for non-existent SUT", () => {
			const values = collector.getMetricValues("non-existent", "time");
			assert.deepStrictEqual(values, []);
		});

		it("should return empty array for non-existent metric", () => {
			const values = collector.getMetricValues("sut-1", "non-existent");
			assert.deepStrictEqual(values, []);
		});

		it("should return empty array when SUT has metric but other SUTs do not", () => {
			const values = collector.getMetricValues("sut-1", "memory");
			assert.deepStrictEqual(values, [50]);
		});

		it("should preserve insertion order", () => {
			const values = collector.getMetricValues("sut-1", "time");
			assert.strictEqual(values[0], 100);
			assert.strictEqual(values[1], 200);
		});

		it("should handle SUT with single result", () => {
			const values = collector.getMetricValues("sut-2", "time");
			assert.deepStrictEqual(values, [150]);
		});
	});
});
