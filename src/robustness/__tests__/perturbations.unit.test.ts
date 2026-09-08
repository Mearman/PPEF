/**
 * Unit tests for Perturbations
 *
 * Tests perturbation application including:
 * - Edge removal perturbation
 * - Seed shift perturbation
 * - Node removal perturbation
 * - Weight noise perturbation
 */

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import type { ArtefactReference, EvaluationCase } from "../../types/case.js";
import {
	PERTURBATIONS,
	createPerturbation,
	edgeRemovalPerturbation,
	getPerturbation,
	nodeRemovalPerturbation,
	seedShiftPerturbation,
	weightNoisePerturbation,
} from "../perturbations.js";

/**
 * Create a mock evaluation case for testing.
 */
const createMockCase = (caseId: string): EvaluationCase => ({
	caseId,
	name: `Test Case ${caseId}`,
	caseClass: "test-class",
	version: "1.0.0",
	tags: ["baseline"],
	inputs: {
		summary: {
			nodes: 100,
			edges: 500,
			seeds: ["node1", "node2"],
		},
		artefacts: [
			{
				type: "graph",
				uri: `/data/${caseId}.graph.json`,
				hash: "abc123",
				metadata: { format: "json" },
			},
		],
	},
});

describe("perturbations", () => {
	describe("edgeRemovalPerturbation", () => {
		it("should preserve required fields (caseId, inputs)", () => {
			const mockCase = createMockCase("case-001");
			const perturbed = edgeRemovalPerturbation.apply(mockCase, 42);

			assert.ok(perturbed.caseId);
			assert.ok(perturbed.inputs);
			assert.ok(perturbed.inputs.summary);
			assert.ok(perturbed.inputs.artefacts);
		});

		it("should generate a unique caseId for perturbed case", () => {
			const mockCase = createMockCase("case-001");
			const perturbed = edgeRemovalPerturbation.apply(mockCase, 42);

			assert.notStrictEqual(perturbed.caseId, mockCase.caseId);
			assert.strictEqual(perturbed.caseId.length, 16); // SHA-256 slice
		});

		it("should add perturbation metadata to summary", () => {
			const mockCase = createMockCase("case-001");
			const perturbed = edgeRemovalPerturbation.apply(mockCase, 42);

			assert.ok(perturbed.inputs.summary);
			const summary = perturbed.inputs.summary;
			assert.strictEqual(summary.perturbation, "edge-removal");
			assert.strictEqual(summary.perturbationIntensity, 0.1);
			assert.strictEqual(summary.perturbationSeed, 42);
		});

		it("should add perturbation metadata to artefacts", () => {
			const mockCase = createMockCase("case-001");
			const perturbed = edgeRemovalPerturbation.apply(mockCase, 42);

			assert.ok(perturbed.inputs.artefacts);
			const artefacts = perturbed.inputs.artefacts;
			assert.strictEqual(artefacts.length, 1);
			assert.ok(artefacts[0].metadata);
			const metadata = artefacts[0].metadata;
			assert.strictEqual(metadata.perturbation, "edge-removal");
			assert.strictEqual(metadata.perturbationIntensity, 0.1);
			assert.strictEqual(metadata.perturbationSeed, 42);
		});

		it("should add perturbation tags", () => {
			const mockCase = createMockCase("case-001");
			const perturbed = edgeRemovalPerturbation.apply(mockCase, 42);

			assert.ok(perturbed.tags?.includes("perturbed"));
			assert.ok(perturbed.tags?.includes("edge-removal"));
			assert.ok(perturbed.tags?.includes("baseline")); // Original tag preserved
		});

		it("should update name with intensity percentage", () => {
			const mockCase = createMockCase("case-001");
			const perturbed = edgeRemovalPerturbation.apply(mockCase, 42);

			assert.ok(perturbed.name?.includes("10%"));
			assert.ok(perturbed.name?.includes("edges removed"));
		});

		it("should preserve other inputs.summary fields", () => {
			const mockCase = createMockCase("case-001");
			const perturbed = edgeRemovalPerturbation.apply(mockCase, 42);

			assert.ok(perturbed.inputs.summary);
			const summary = perturbed.inputs.summary;
			assert.strictEqual(summary.nodes, 100);
			assert.strictEqual(summary.edges, 500);
			assert.deepStrictEqual(summary.seeds, ["node1", "node2"]);
		});
	});

	describe("seedShiftPerturbation", () => {
		it("should preserve required fields (caseId, inputs)", () => {
			const mockCase = createMockCase("case-002");
			const perturbed = seedShiftPerturbation.apply(mockCase, 42);

			assert.ok(perturbed.caseId);
			assert.ok(perturbed.inputs);
			assert.ok(perturbed.inputs.summary);
		});

		it("should generate a unique caseId for perturbed case", () => {
			const mockCase = createMockCase("case-002");
			const perturbed = seedShiftPerturbation.apply(mockCase, 42);

			assert.notStrictEqual(perturbed.caseId, mockCase.caseId);
			assert.strictEqual(perturbed.caseId.length, 16);
		});

		it("should add perturbation metadata to summary", () => {
			const mockCase = createMockCase("case-002");
			const perturbed = seedShiftPerturbation.apply(mockCase, 42);

			assert.ok(perturbed.inputs.summary);
			const summary = perturbed.inputs.summary;
			assert.strictEqual(summary.perturbation, "seed-shift");
			assert.strictEqual(summary.perturbationSeed, 42);
		});

		it("should add perturbation tags", () => {
			const mockCase = createMockCase("case-002");
			const perturbed = seedShiftPerturbation.apply(mockCase, 42);

			assert.ok(perturbed.tags?.includes("perturbed"));
			assert.ok(perturbed.tags?.includes("seed-shift"));
		});

		it("should update name with perturbation description", () => {
			const mockCase = createMockCase("case-002");
			const perturbed = seedShiftPerturbation.apply(mockCase, 42);

			assert.ok(perturbed.name?.includes("seeds shifted"));
		});
	});

	describe("nodeRemovalPerturbation", () => {
		it("should preserve required fields (caseId, inputs)", () => {
			const mockCase = createMockCase("case-003");
			const perturbed = nodeRemovalPerturbation.apply(mockCase, 42);

			assert.ok(perturbed.caseId);
			assert.ok(perturbed.inputs);
			assert.ok(perturbed.inputs.summary);
		});

		it("should generate a unique caseId for perturbed case", () => {
			const mockCase = createMockCase("case-003");
			const perturbed = nodeRemovalPerturbation.apply(mockCase, 42);

			assert.notStrictEqual(perturbed.caseId, mockCase.caseId);
			assert.strictEqual(perturbed.caseId.length, 16);
		});

		it("should add perturbation metadata to summary", () => {
			const mockCase = createMockCase("case-003");
			const perturbed = nodeRemovalPerturbation.apply(mockCase, 42);

			assert.ok(perturbed.inputs.summary);
			const summary = perturbed.inputs.summary;
			assert.strictEqual(summary.perturbation, "node-removal");
			assert.strictEqual(summary.perturbationIntensity, 0.05);
			assert.strictEqual(summary.perturbationSeed, 42);
		});

		it("should add perturbation tags", () => {
			const mockCase = createMockCase("case-003");
			const perturbed = nodeRemovalPerturbation.apply(mockCase, 42);

			assert.ok(perturbed.tags?.includes("perturbed"));
			assert.ok(perturbed.tags?.includes("node-removal"));
		});

		it("should update name with intensity percentage", () => {
			const mockCase = createMockCase("case-003");
			const perturbed = nodeRemovalPerturbation.apply(mockCase, 42);

			assert.ok(perturbed.name?.includes("5%"));
			assert.ok(perturbed.name?.includes("nodes removed"));
		});
	});

	describe("weightNoisePerturbation", () => {
		it("should preserve required fields (caseId, inputs)", () => {
			const mockCase = createMockCase("case-004");
			const perturbed = weightNoisePerturbation.apply(mockCase, 42);

			assert.ok(perturbed.caseId);
			assert.ok(perturbed.inputs);
			assert.ok(perturbed.inputs.summary);
		});

		it("should generate a unique caseId for perturbed case", () => {
			const mockCase = createMockCase("case-004");
			const perturbed = weightNoisePerturbation.apply(mockCase, 42);

			assert.notStrictEqual(perturbed.caseId, mockCase.caseId);
			assert.strictEqual(perturbed.caseId.length, 16);
		});

		it("should add perturbation metadata to summary", () => {
			const mockCase = createMockCase("case-004");
			const perturbed = weightNoisePerturbation.apply(mockCase, 42);

			assert.ok(perturbed.inputs.summary);
			const summary = perturbed.inputs.summary;
			assert.strictEqual(summary.perturbation, "weight-noise");
			assert.strictEqual(summary.perturbationIntensity, 0.1);
			assert.strictEqual(summary.perturbationSeed, 42);
		});

		it("should add perturbation tags", () => {
			const mockCase = createMockCase("case-004");
			const perturbed = weightNoisePerturbation.apply(mockCase, 42);

			assert.ok(perturbed.tags?.includes("perturbed"));
			assert.ok(perturbed.tags?.includes("weight-noise"));
		});

		it("should update name with intensity percentage", () => {
			const mockCase = createMockCase("case-004");
			const perturbed = weightNoisePerturbation.apply(mockCase, 42);

			assert.ok(perturbed.name?.includes("10%"));
			assert.ok(perturbed.name?.includes("weight noise"));
		});
	});

	describe("PERTURBATIONS array", () => {
		it("should contain all four built-in perturbations", () => {
			assert.strictEqual(PERTURBATIONS.length, 4);
			assert.ok(
				PERTURBATIONS.some((p) => p.id === "edge-removal"),
				"Should contain edge-removal",
			);
			assert.ok(
				PERTURBATIONS.some((p) => p.id === "seed-shift"),
				"Should contain seed-shift",
			);
			assert.ok(
				PERTURBATIONS.some((p) => p.id === "node-removal"),
				"Should contain node-removal",
			);
			assert.ok(
				PERTURBATIONS.some((p) => p.id === "weight-noise"),
				"Should contain weight-noise",
			);
		});
	});

	describe("getPerturbation", () => {
		it("should return perturbation by id", () => {
			const edgeRemoval = getPerturbation("edge-removal");
			assert.ok(edgeRemoval);
			assert.strictEqual(edgeRemoval.id, "edge-removal");
		});

		it("should return undefined for unknown id", () => {
			const unknown = getPerturbation("unknown-perturbation");
			assert.strictEqual(unknown, undefined);
		});

		it("should find all built-in perturbations by id", () => {
			const ids = ["edge-removal", "seed-shift", "node-removal", "weight-noise"];

			for (const id of ids) {
				const perturbation = getPerturbation(id);
				assert.ok(perturbation, `Should find perturbation with id: ${id}`);
				assert.strictEqual(perturbation.id, id);
			}
		});
	});

	describe("createPerturbation", () => {
		it("should create perturbation with custom intensity", () => {
			const custom = createPerturbation({
				type: "edge-removal",
				intensity: 0.25,
			});

			assert.strictEqual(custom.id, "edge-removal");
			assert.strictEqual(custom.intensity, 0.25);
		});

		it("should apply custom intensity to perturbed case", () => {
			const mockCase = createMockCase("case-005");
			const custom = createPerturbation({
				type: "node-removal",
				intensity: 0.15,
			});
			const perturbed = custom.apply(mockCase, 42);

			assert.strictEqual(perturbed.inputs.summary?.perturbationIntensity, 0.15);
			assert.ok(perturbed.name?.includes("15%"));
		});

		it("should throw error for unknown perturbation type", () => {
			assert.throws(
				() =>
					createPerturbation({
						type: "unknown-type" as never,
						intensity: 0.1,
					}),
				/Unknown perturbation type: unknown-type/,
			);
		});

		it("should preserve name and description from base perturbation", () => {
			const custom = createPerturbation({
				type: "edge-removal",
				intensity: 0.2,
			});

			assert.strictEqual(custom.name, "Edge Removal");
			assert.strictEqual(custom.description, "Randomly remove a fraction of edges");
		});

		it("should preserve type from base perturbation", () => {
			const custom = createPerturbation({
				type: "weight-noise",
				intensity: 0.05,
			});

			assert.strictEqual(custom.type, "noise");
		});
	});

	describe("perturbation determinism", () => {
		it("should produce same caseId for same inputs", () => {
			const mockCase = createMockCase("case-006");

			const perturbed1 = edgeRemovalPerturbation.apply(mockCase, 42);
			const perturbed2 = edgeRemovalPerturbation.apply(mockCase, 42);

			assert.strictEqual(perturbed1.caseId, perturbed2.caseId);
		});

		it("should produce different caseId for different seeds", () => {
			const mockCase = createMockCase("case-007");

			const perturbed1 = nodeRemovalPerturbation.apply(mockCase, 42);
			const perturbed2 = nodeRemovalPerturbation.apply(mockCase, 100);

			assert.notStrictEqual(perturbed1.caseId, perturbed2.caseId);
		});

		it("should produce different caseId for different intensities", () => {
			const mockCase = createMockCase("case-008");
			const custom1 = createPerturbation({
				type: "edge-removal",
				intensity: 0.1,
			});
			const custom2 = createPerturbation({
				type: "edge-removal",
				intensity: 0.2,
			});

			const perturbed1 = custom1.apply(mockCase, 42);
			const perturbed2 = custom2.apply(mockCase, 42);

			assert.notStrictEqual(perturbed1.caseId, perturbed2.caseId);
		});
	});
});
