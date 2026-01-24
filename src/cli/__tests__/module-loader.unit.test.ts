/**
 * Unit tests for CLI Module Loader
 *
 * Tests module loading functionality including:
 * - Loading SUT factories
 * - Loading case definitions
 * - Loading metrics extractors
 * - Error handling for invalid modules
 */

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { writeFile } from "node:fs/promises";
import { unlink } from "node:fs/promises";
import { join } from "node:path";
import { mkdtemp, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";

import { loadSutFactory, loadCaseDefinition, loadMetricsExtractor } from "../module-loader.js";

describe("module-loader", () => {
	describe("loadSutFactory", () => {
		it("should load SUT factory from module", async () => {
			// Create a temporary module file
			const tempDir = await mkdtemp(join(tmpdir(), "ppef-test-"));
			const modulePath = join(tempDir, "test-sut.js");
			const moduleContent = `
export function createSUT(config) {
  return {
    id: 'test-sut-v1.0.0',
    config: config || {},
    run: async (inputs) => ({ result: 'test' })
  };
}
`;
			await writeFile(modulePath, moduleContent, "utf-8");

			const sut = await loadSutFactory("./test-sut.js", "createSUT", tempDir, {
				id: "test-sut",
				name: "Test SUT",
				version: "1.0.0",
				role: "primary" as const,
				config: {},
				tags: [],
			});

			assert.strictEqual(sut.registration.id, "test-sut");
			assert.strictEqual(typeof sut.factory, "function");

			const instance = sut.factory({ testOption: true });
			assert.strictEqual(instance.id, "test-sut");
			assert.strictEqual(instance.config.testOption, true);

			// Cleanup
			await unlink(modulePath);
			await rmdir(tempDir);
		});

		it("should merge configs correctly", async () => {
			const tempDir = await mkdtemp(join(tmpdir(), "ppef-test-"));
			const modulePath = join(tempDir, "test-sut.js");
			const moduleContent = `
export function createSUT(config) {
  return {
    id: 'test-sut-v1.0.0',
    config: { internalOption: 'internal', ...config },
    run: async (inputs) => ({ result: 'test' })
  };
}
`;
			await writeFile(modulePath, moduleContent, "utf-8");

			const sut = await loadSutFactory(
				"./test-sut.js",
				"createSUT",
				tempDir,
				{
					id: "test-sut",
					name: "Test SUT",
					version: "1.0.0",
					role: "primary" as const,
					config: { baseOption: "base" },
					tags: [],
				},
				{ userOption: "user" },
			);

			const instance = sut.factory();
			// The factory merges: { baseOption, userOption, internalOption } from instance.config
			assert.strictEqual(instance.config.internalOption, "internal");
			assert.strictEqual(instance.config.userOption, "user");

			// Cleanup
			await unlink(modulePath);
			await rmdir(tempDir);
		});

		it("should throw error for non-function export", async () => {
			const tempDir = await mkdtemp(join(tmpdir(), "ppef-test-"));
			const modulePath = join(tempDir, "test-sut.js");
			const moduleContent = `
export const createSUT = "not a function";
`;
			await writeFile(modulePath, moduleContent, "utf-8");

			await assert.rejects(
				async () =>
					loadSutFactory("./test-sut.js", "createSUT", tempDir, {
						id: "test-sut",
						name: "Test SUT",
						version: "1.0.0",
						role: "primary" as const,
						config: {},
						tags: [],
					}),
				/is not a function/,
			);

			// Cleanup
			await unlink(modulePath);
			await rmdir(tempDir);
		});

		it("should throw error for missing export", async () => {
			const tempDir = await mkdtemp(join(tmpdir(), "ppef-test-"));
			const modulePath = join(tempDir, "test-sut.js");
			const moduleContent = `
export const somethingElse = "value";
`;
			await writeFile(modulePath, moduleContent, "utf-8");

			await assert.rejects(
				async () =>
					loadSutFactory("./test-sut.js", "missingExport", tempDir, {
						id: "test-sut",
						name: "Test SUT",
						version: "1.0.0",
						role: "primary" as const,
						config: {},
						tags: [],
					}),
				/is not a function/,
			);

			// Cleanup
			await unlink(modulePath);
			await rmdir(tempDir);
		});
	});

	describe("loadCaseDefinition", () => {
		it("should load case definition from module", async () => {
			const tempDir = await mkdtemp(join(tmpdir(), "ppef-test-"));
			const modulePath = join(tempDir, "test-case.js");
			const moduleContent = `
export function createCase() {
  return {
    case: {
      caseId: 'test-case-001',
      name: 'Test Case',
      inputs: {}
    },
    getInput: async () => ({ test: 'input' }),
    getInputs: () => ({ seed: 42 })
  };
}
`;
			await writeFile(modulePath, moduleContent, "utf-8");

			const caseDef = await loadCaseDefinition("./test-case.js", "createCase", tempDir);

			assert.strictEqual(caseDef.case.caseId, "test-case-001");
			assert.strictEqual(typeof caseDef.getInput, "function");
			assert.strictEqual(typeof caseDef.getInputs, "function");

			// Cleanup
			await unlink(modulePath);
			await rmdir(tempDir);
		});

		it("should throw error for invalid case definition", async () => {
			const tempDir = await mkdtemp(join(tmpdir(), "ppef-test-"));
			const modulePath = join(tempDir, "test-case.js");
			const moduleContent = `
export function createCase() {
  return { invalid: 'structure' };
}
`;
			await writeFile(modulePath, moduleContent, "utf-8");

			await assert.rejects(
				async () => loadCaseDefinition("./test-case.js", "createCase", tempDir),
				/does not return a valid case definition/,
			);

			// Cleanup
			await unlink(modulePath);
			await rmdir(tempDir);
		});

		it("should throw error for non-function export", async () => {
			const tempDir = await mkdtemp(join(tmpdir(), "ppef-test-"));
			const modulePath = join(tempDir, "test-case.js");
			const moduleContent = `
export const createCase = "not a function";
`;
			await writeFile(modulePath, moduleContent, "utf-8");

			await assert.rejects(
				async () => loadCaseDefinition("./test-case.js", "createCase", tempDir),
				/is not a function/,
			);

			// Cleanup
			await unlink(modulePath);
			await rmdir(tempDir);
		});

		it("should throw error when getInput is missing", async () => {
			const tempDir = await mkdtemp(join(tmpdir(), "ppef-test-"));
			const modulePath = join(tempDir, "test-case.js");
			const moduleContent = `
export function createCase() {
  return {
    case: { caseId: 'test-case-001' },
    getInputs: () => ({})
  };
}
`;
			await writeFile(modulePath, moduleContent, "utf-8");

			await assert.rejects(
				async () => loadCaseDefinition("./test-case.js", "createCase", tempDir),
				/Missing getInput function/,
			);

			// Cleanup
			await unlink(modulePath);
			await rmdir(tempDir);
		});

		it("should throw error when getInputs is missing", async () => {
			const tempDir = await mkdtemp(join(tmpdir(), "ppef-test-"));
			const modulePath = join(tempDir, "test-case.js");
			const moduleContent = `
export function createCase() {
  return {
    case: { caseId: 'test-case-001' },
    getInput: async () => ({})
  };
}
`;
			await writeFile(modulePath, moduleContent, "utf-8");

			await assert.rejects(
				async () => loadCaseDefinition("./test-case.js", "createCase", tempDir),
				/Missing getInputs function/,
			);

			// Cleanup
			await unlink(modulePath);
			await rmdir(tempDir);
		});
	});

	describe("loadMetricsExtractor", () => {
		it("should load metrics extractor from module", async () => {
			const tempDir = await mkdtemp(join(tmpdir(), "ppef-test-"));
			const modulePath = join(tempDir, "test-extractor.js");
			const moduleContent = `
export function extractMetrics(result) {
  return {
    accuracy: result.accuracy || 0.5,
    count: result.items?.length || 0
  };
}
`;
			await writeFile(modulePath, moduleContent, "utf-8");

			const extractor = await loadMetricsExtractor(
				"./test-extractor.js",
				"extractMetrics",
				tempDir,
			);

			assert.strictEqual(typeof extractor, "function");

			const metrics = extractor({ accuracy: 0.85, items: [1, 2, 3] });
			assert.strictEqual(metrics.accuracy, 0.85);
			assert.strictEqual(metrics.count, 3);

			// Cleanup
			await unlink(modulePath);
			await rmdir(tempDir);
		});

		it("should handle missing result fields gracefully", async () => {
			const tempDir = await mkdtemp(join(tmpdir(), "ppef-test-"));
			const modulePath = join(tempDir, "test-extractor.js");
			const moduleContent = `
export function extractMetrics(result) {
  return {
    accuracy: result.accuracy || 0.5,
    count: result.items?.length || 0
  };
}
`;
			await writeFile(modulePath, moduleContent, "utf-8");

			const extractor = await loadMetricsExtractor(
				"./test-extractor.js",
				"extractMetrics",
				tempDir,
			);

			const metrics = extractor({});
			assert.strictEqual(metrics.accuracy, 0.5);
			assert.strictEqual(metrics.count, 0);

			// Cleanup
			await unlink(modulePath);
			await rmdir(tempDir);
		});

		it("should throw error for non-function export", async () => {
			const tempDir = await mkdtemp(join(tmpdir(), "ppef-test-"));
			const modulePath = join(tempDir, "test-extractor.js");
			const moduleContent = `
export const extractMetrics = "not a function";
`;
			await writeFile(modulePath, moduleContent, "utf-8");

			await assert.rejects(
				async () => loadMetricsExtractor("./test-extractor.js", "extractMetrics", tempDir),
				/is not a function/,
			);

			// Cleanup
			await unlink(modulePath);
			await rmdir(tempDir);
		});
	});
});
