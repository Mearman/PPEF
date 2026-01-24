/**
 * Integration tests for SUT Registry and Case Registry
 */

import { beforeEach, describe, it } from "node:test";
import { strict as assert } from "node:assert";

import { CaseRegistry } from "../registry/case-registry.js";
import { SUTRegistry } from "../registry/sut-registry.js";
import type { CaseDefinition } from "../types/case.js";
import type { SutRegistration } from "../types/sut.js";

describe("Registry + Executor Integration", () => {
	describe("SUTRegistry", () => {
		let sutRegistry: SUTRegistry<unknown, { result: string }>;

		beforeEach(() => {
			sutRegistry = new SUTRegistry();
		});

		it("should register and retrieve SUTs", () => {
			const registration: SutRegistration = {
				id: "test-sut-v1.0.0",
				name: "Test SUT",
				version: "1.0.0",
				role: "primary",
				config: { maxDepth: 3 },
				tags: ["test", "primary"],
			};

			const factory = () => ({
				id: "test-sut-v1.0.0",
				config: {},
				run: async () => ({ result: "success" }),
			});

			sutRegistry.register(registration, factory);

			assert.strictEqual(sutRegistry.has("test-sut-v1.0.0"), true);
			assert.strictEqual(sutRegistry.size, 1);

			const retrieved = sutRegistry.get("test-sut-v1.0.0");
			assert.ok(retrieved);
			assert.strictEqual(retrieved.registration.name, "Test SUT");
			assert.strictEqual(retrieved.registration.role, "primary");
		});

		it("should prevent duplicate registration", () => {
			const registration: SutRegistration = {
				id: "duplicate-sut",
				name: "Duplicate",
				version: "1.0.0",
				role: "primary",
				config: {},
				tags: [],
			};

			const factory = () => ({
				id: "duplicate-sut",
				config: {},
				run: async () => ({ result: "ok" }),
			});

			sutRegistry.register(registration, factory);

			assert.throws(() => sutRegistry.register(registration, factory), Error);
		});

		it("should filter by role", () => {
			sutRegistry
				.register(
					{ id: "primary-1", name: "P1", version: "1.0.0", role: "primary", config: {}, tags: [] },
					() => ({ id: "primary-1", config: {}, run: async () => ({ result: "p1" }) }),
				)
				.register(
					{ id: "primary-2", name: "P2", version: "1.0.0", role: "primary", config: {}, tags: [] },
					() => ({ id: "primary-2", config: {}, run: async () => ({ result: "p2" }) }),
				)
				.register(
					{
						id: "baseline-1",
						name: "B1",
						version: "1.0.0",
						role: "baseline",
						config: {},
						tags: [],
					},
					() => ({ id: "baseline-1", config: {}, run: async () => ({ result: "b1" }) }),
				);

			const primarySuts = sutRegistry.getByRole("primary");
			const baselineSuts = sutRegistry.getByRole("baseline");

			assert.strictEqual(primarySuts.length, 2);
			assert.strictEqual(baselineSuts.length, 1);
		});

		it("should filter by tag", () => {
			sutRegistry
				.register(
					{
						id: "sut-1",
						name: "S1",
						version: "1.0.0",
						role: "primary",
						config: {},
						tags: ["expansion", "bidirectional"],
					},
					() => ({ id: "sut-1", config: {}, run: async () => ({ result: "s1" }) }),
				)
				.register(
					{
						id: "sut-2",
						name: "S2",
						version: "1.0.0",
						role: "primary",
						config: {},
						tags: ["expansion"],
					},
					() => ({ id: "sut-2", config: {}, run: async () => ({ result: "s2" }) }),
				)
				.register(
					{
						id: "sut-3",
						name: "S3",
						version: "1.0.0",
						role: "baseline",
						config: {},
						tags: ["ranking"],
					},
					() => ({ id: "sut-3", config: {}, run: async () => ({ result: "s3" }) }),
				);

			const expansionSuts = sutRegistry.getByTag("expansion");
			const bidirectionalSuts = sutRegistry.getByTag("bidirectional");

			assert.strictEqual(expansionSuts.length, 2);
			assert.strictEqual(bidirectionalSuts.length, 1);
		});

		it("should throw for unknown SUT in getOrThrow", () => {
			assert.throws(() => sutRegistry.getOrThrow("nonexistent"), Error);
		});

		it("should create SUT instances", () => {
			let capturedConfig: Record<string, unknown> | undefined;

			sutRegistry.register(
				{
					id: "configurable-sut",
					name: "Config",
					version: "1.0.0",
					role: "primary",
					config: {},
					tags: [],
				},
				(config?: Record<string, unknown>) => {
					capturedConfig = config;
					return {
						id: "configurable-sut",
						config: { ...config },
						run: async () => ({ result: "configured" }),
					};
				},
			);

			const instance = sutRegistry.create("configurable-sut", { maxDepth: 5 });

			assert.ok(instance);
			assert.deepStrictEqual(capturedConfig, { maxDepth: 5 });
		});

		it("should list all registrations", () => {
			sutRegistry
				.register(
					{ id: "sut-a", name: "A", version: "1.0.0", role: "primary", config: {}, tags: [] },
					() => ({ id: "sut-a", config: {}, run: async () => ({ result: "a" }) }),
				)
				.register(
					{ id: "sut-b", name: "B", version: "1.0.0", role: "baseline", config: {}, tags: [] },
					() => ({ id: "sut-b", config: {}, run: async () => ({ result: "b" }) }),
				);

			const ids = sutRegistry.list();
			const registrations = sutRegistry.listRegistrations();

			assert.ok(ids.includes("sut-a"));
			assert.ok(ids.includes("sut-b"));
			assert.strictEqual(registrations.length, 2);
			assert.strictEqual(registrations.find((r) => r.id === "sut-a")?.name, "A");
		});

		it("should clear all registrations", () => {
			sutRegistry.register(
				{ id: "sut", name: "S", version: "1.0.0", role: "primary", config: {}, tags: [] },
				() => ({ id: "sut", config: {}, run: async () => ({ result: "s" }) }),
			);

			assert.strictEqual(sutRegistry.size, 1);

			sutRegistry.clear();

			assert.strictEqual(sutRegistry.size, 0);
			assert.strictEqual(sutRegistry.has("sut"), false);
		});
	});

	describe("CaseRegistry", () => {
		let caseRegistry: CaseRegistry<{ nodes: string[] }, string[]>;

		beforeEach(() => {
			caseRegistry = new CaseRegistry();
		});

		const createTestCase = (
			id: string,
			caseClass?: string,
			tags?: string[],
		): CaseDefinition<{ nodes: string[] }, string[]> => ({
			case: {
				caseId: id,
				name: `Test Case ${id}`,
				caseClass,
				inputs: { summary: { graphName: id } },
				tags,
			},
			getInput: async () => ({ nodes: ["a", "b", "c"] }),
			getInputs: () => ["a", "b"],
		});

		it("should register and retrieve cases", () => {
			const caseDefinition = createTestCase("case-001", "scale-free");

			caseRegistry.register(caseDefinition);

			assert.strictEqual(caseRegistry.has("case-001"), true);
			assert.strictEqual(caseRegistry.size, 1);

			const retrieved = caseRegistry.get("case-001");
			assert.ok(retrieved);
			assert.strictEqual(retrieved.case.name, "Test Case case-001");
			assert.strictEqual(retrieved.case.caseClass, "scale-free");
		});

		it("should prevent duplicate case registration", () => {
			const caseDefinition = createTestCase("duplicate-case");

			caseRegistry.register(caseDefinition);

			assert.throws(() => caseRegistry.register(caseDefinition), Error);
		});

		it("should register multiple cases", () => {
			const cases = [
				createTestCase("case-1", "scale-free"),
				createTestCase("case-2", "scale-free"),
				createTestCase("case-3", "random"),
			];

			caseRegistry.registerAll(cases);

			assert.strictEqual(caseRegistry.size, 3);
		});

		it("should filter by case class", () => {
			caseRegistry.registerAll([
				createTestCase("sf-1", "scale-free"),
				createTestCase("sf-2", "scale-free"),
				createTestCase("rand-1", "random"),
			]);

			const scaleFree = caseRegistry.getByClass("scale-free");
			const random = caseRegistry.getByClass("random");

			assert.strictEqual(scaleFree.length, 2);
			assert.strictEqual(random.length, 1);
		});

		it("should filter by tag", () => {
			caseRegistry.registerAll([
				createTestCase("case-1", undefined, ["small", "synthetic"]),
				createTestCase("case-2", undefined, ["large", "real-world"]),
				createTestCase("case-3", undefined, ["small"]),
			]);

			const smallCases = caseRegistry.getByTag("small");
			const realWorldCases = caseRegistry.getByTag("real-world");

			assert.strictEqual(smallCases.length, 2);
			assert.strictEqual(realWorldCases.length, 1);
		});

		it("should list unique case classes", () => {
			caseRegistry.registerAll([
				createTestCase("c1", "scale-free"),
				createTestCase("c2", "scale-free"),
				createTestCase("c3", "random"),
				createTestCase("c4", "small-world"),
			]);

			const classes = caseRegistry.listClasses();

			assert.strictEqual(classes.length, 3);
			assert.ok(classes.includes("scale-free"));
			assert.ok(classes.includes("random"));
			assert.ok(classes.includes("small-world"));
		});

		it("should create input from case", async () => {
			caseRegistry.register(createTestCase("expandable-case"));

			const input = await caseRegistry.getInput("expandable-case");

			assert.deepStrictEqual(input.nodes, ["a", "b", "c"]);
		});

		it("should get inputs from case", () => {
			caseRegistry.register(createTestCase("seeded-case"));

			const inputs = caseRegistry.getInputs("seeded-case");

			assert.deepStrictEqual(inputs, ["a", "b"]);
		});

		it("should throw for unknown case in getOrThrow", () => {
			assert.throws(() => caseRegistry.getOrThrow("nonexistent"), Error);
		});

		it("should list all cases", () => {
			caseRegistry.registerAll([createTestCase("c1"), createTestCase("c2")]);

			const ids = caseRegistry.list();
			const cases = caseRegistry.listCases();

			assert.ok(ids.includes("c1"));
			assert.ok(ids.includes("c2"));
			assert.strictEqual(cases.length, 2);
		});

		it("should clear all cases", () => {
			caseRegistry.register(createTestCase("c1"));

			assert.strictEqual(caseRegistry.size, 1);

			caseRegistry.clear();

			assert.strictEqual(caseRegistry.size, 0);
		});
	});

	describe("Combined Registry Usage", () => {
		it("should support typical experiment setup pattern", async () => {
			// Create registries with proper input types
			interface TestInputs {
				expander: { nodes: string[] };
				seeds: string[];
			}
			const sutRegistry = new SUTRegistry<TestInputs, { paths: string[][] }>();
			const caseRegistry = new CaseRegistry<{ nodes: string[] }, TestInputs>();

			// Register SUTs
			sutRegistry
				.register(
					{
						id: "degree-prioritised-v1.0.0",
						name: "Degree-Prioritised Expansion",
						version: "1.0.0",
						role: "primary",
						config: { hubThreshold: 0.9 },
						tags: ["expansion", "bidirectional"],
					},
					() => ({
						id: "degree-prioritised-v1.0.0",
						config: {},
						run: async ({ expander, seeds }) => ({
							paths: seeds.map((s) => [s, ...expander.nodes.slice(0, 2)]),
						}),
					}),
				)
				.register(
					{
						id: "standard-bfs-v1.0.0",
						name: "Standard BFS",
						version: "1.0.0",
						role: "baseline",
						config: {},
						tags: ["expansion"],
					},
					() => ({
						id: "standard-bfs-v1.0.0",
						config: {},
						run: async ({ expander, seeds }) => ({
							paths: seeds.map((s) => [s, ...expander.nodes]),
						}),
					}),
				);

			// Register cases
			caseRegistry.registerAll([
				{
					case: {
						caseId: "karate-v1",
						name: "Zachary Karate Club",
						caseClass: "social-network",
						inputs: { summary: { nodes: 34, edges: 78 } },
					},
					getInput: async () => ({ nodes: ["1", "2", "3", "34"] }),
					getInputs: () => ({
						expander: null as unknown as { nodes: string[] },
						seeds: ["1", "34"],
					}),
				},
				{
					case: {
						caseId: "dolphins-v1",
						name: "Dolphin Network",
						caseClass: "social-network",
						inputs: { summary: { nodes: 62, edges: 159 } },
					},
					getInput: async () => ({ nodes: ["beak", "fin", "tail"] }),
					getInputs: () => ({
						expander: null as unknown as { nodes: string[] },
						seeds: ["beak", "tail"],
					}),
				},
			]);

			// Verify setup
			assert.strictEqual(sutRegistry.size, 2);
			assert.strictEqual(caseRegistry.size, 2);

			// Get primary and baselines
			const primarySuts = sutRegistry.getByRole("primary");
			const baselineSuts = sutRegistry.getByRole("baseline");

			assert.strictEqual(primarySuts.length, 1);
			assert.strictEqual(primarySuts[0].registration.id, "degree-prioritised-v1.0.0");
			assert.strictEqual(baselineSuts.length, 1);

			// Execute for one case
			const expander = await caseRegistry.getInput("karate-v1");
			const inputs = caseRegistry.getInputs("karate-v1");

			const instance = sutRegistry.create("degree-prioritised-v1.0.0");

			const result = await instance.run({ expander, seeds: inputs.seeds });

			assert.strictEqual(result.paths.length, 2); // One path per seed
			assert.strictEqual(result.paths[0][0], "1"); // First seed
		});

		it("should verify registration data is accessible", () => {
			const sutRegistry = new SUTRegistry();

			sutRegistry.register(
				{
					id: "dp-v1.0.0",
					name: "Degree-Prioritised",
					version: "1.0.0",
					role: "primary",
					config: { maxDepth: 3, hubThreshold: 0.9 },
					tags: ["bidirectional"],
					description: "Hub-avoiding expansion algorithm",
				},
				() => ({
					id: "dp-v1.0.0",
					config: {},
					run: async () => ({}),
				}),
			);

			const dp = sutRegistry.get("dp-v1.0.0");
			assert.ok(dp);

			assert.strictEqual(dp.registration.role, "primary");
			assert.strictEqual(dp.registration.config.maxDepth, 3);
			assert.strictEqual(dp.registration.config.hubThreshold, 0.9);
			assert.ok(dp.registration.tags.includes("bidirectional"));
			assert.strictEqual(dp.registration.description, "Hub-avoiding expansion algorithm");
		});
	});
});
