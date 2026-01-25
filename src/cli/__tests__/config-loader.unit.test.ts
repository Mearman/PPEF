/**
 * Unit tests for Config Loader
 *
 * Tests configuration loading, validation, and error handling.
 */

import { describe, it, before, after } from "node:test";
import { strict as assert } from "node:assert";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import type { ExperimentConfig } from "../types.js";
import { loadConfig, validateConfig, loadAndValidateConfig } from "../config-loader.js";

describe("config-loader", () => {
	let tempDir: string;

	// Setup before all tests
	before(async () => {
		const dir = join(tmpdir(), `config-loader-test-${Date.now()}`);
		await mkdir(dir, { recursive: true });
		tempDir = dir;
	});

	// Cleanup after all tests
	after(async () => {
		if (tempDir) {
			try {
				await rm(tempDir, { recursive: true, force: true });
			} catch {
				// Ignore
			}
		}
	});

	async function createConfigFile(
		config: ExperimentConfig,
		filename = "config.json",
	): Promise<string> {
		const filePath = join(tempDir, filename);
		await writeFile(filePath, JSON.stringify(config, null, 2));
		return filePath;
	}

	describe("loadConfig", () => {
		it("should load and parse a valid config file", async () => {
			const config: ExperimentConfig = {
				experiment: { name: "Test Experiment" },
				executor: { repetitions: 1 },
				suts: [
					{
						id: "sut1",
						module: "./sut.js",
						exportName: "createSut",
						registration: { name: "SUT 1", version: "1.0.0", role: "primary", tags: [] },
					},
				],
				cases: [{ id: "case1", module: "./case.js", exportName: "createCase" }],
				metricsExtractor: { module: "./metrics.js", exportName: "extractMetrics" },
				output: {},
			};

			const configPath = await createConfigFile(config);
			const loaded = await loadConfig(configPath);

			assert.strictEqual(loaded.config.experiment.name, "Test Experiment");
			assert.ok(loaded.baseDir);
			assert.ok(loaded.configPath.endsWith("config.json"));
		});

		it("should resolve relative paths to absolute", async () => {
			const config: ExperimentConfig = {
				experiment: { name: "Test" },
				executor: { repetitions: 1 },
				suts: [
					{
						id: "sut1",
						module: "./sut.js",
						exportName: "createSut",
						registration: { name: "SUT", version: "1.0.0", role: "primary", tags: [] },
					},
				],
				cases: [{ id: "case1", module: "./case.js", exportName: "createCase" }],
				metricsExtractor: { module: "./metrics.js", exportName: "extract" },
				output: {},
				output: {},
			};

			const configPath = await createConfigFile(config);
			const loaded = await loadConfig(configPath);

			assert.ok(loaded.configPath.startsWith("/"));
		});

		it("should throw on invalid JSON", async () => {
			const filePath = join(tempDir, "invalid.json");
			await writeFile(filePath, "{ invalid json }");

			await assert.rejects(() => loadConfig(filePath));
		});

		it("should throw on missing file", async () => {
			await assert.rejects(() => loadConfig(join(tempDir, "missing.json")));
		});
	});

	describe("validateConfig", () => {
		it("should pass validation for a complete valid config", () => {
			const config: ExperimentConfig = {
				experiment: { name: "Test" },
				executor: { repetitions: 1 },
				suts: [
					{
						id: "sut1",
						module: "./sut.js",
						exportName: "createSut",
						registration: { name: "SUT 1", version: "1.0.0", role: "primary", tags: [] },
					},
				],
				cases: [{ id: "case1", module: "./case.js", exportName: "createCase" }],
				metricsExtractor: { module: "./metrics.js", exportName: "extractMetrics" },
				output: {},
			};

			const result = validateConfig(config);

			assert.strictEqual(result.valid, true);
			assert.strictEqual(result.errors.length, 0);
		});

		it("should error when experiment.name is missing", () => {
			const config = {
				experiment: {},
				executor: { repetitions: 1 },
				suts: [],
				cases: [],
				metricsExtractor: { module: "./m.js", exportName: "e" },
			} as never;

			const result = validateConfig(config);

			assert.strictEqual(result.valid, false);
			assert.ok(result.errors.some((e) => e.includes("experiment.name is required")));
		});

		it("should error when executor is missing", () => {
			const config = {
				experiment: { name: "Test" },
				suts: [],
				cases: [],
				metricsExtractor: { module: "./m.js", exportName: "e" },
			} as never;

			const result = validateConfig(config);

			assert.strictEqual(result.valid, false);
			assert.ok(result.errors.some((e) => e.includes("executor configuration is required")));
		});

		it("should validate executor.repetitions is at least 1", () => {
			const config: ExperimentConfig = {
				experiment: { name: "Test" },
				executor: { repetitions: 0 },
				suts: [
					{
						id: "sut1",
						module: "./sut.js",
						exportName: "createSut",
						registration: { name: "SUT", version: "1.0.0", role: "primary", tags: [] },
					},
				],
				cases: [{ id: "case1", module: "./case.js", exportName: "createCase" }],
				metricsExtractor: { module: "./metrics.js", exportName: "extractMetrics" },
				output: {},
			};

			const result = validateConfig(config);

			assert.strictEqual(result.valid, false);
			assert.ok(result.errors.some((e) => e.includes("repetitions must be at least 1")));
		});

		it("should validate executor.seedBase is non-negative", () => {
			const config: ExperimentConfig = {
				experiment: { name: "Test" },
				executor: { seedBase: -1 },
				suts: [
					{
						id: "sut1",
						module: "./sut.js",
						exportName: "createSut",
						registration: { name: "SUT", version: "1.0.0", role: "primary", tags: [] },
					},
				],
				cases: [{ id: "case1", module: "./case.js", exportName: "createCase" }],
				metricsExtractor: { module: "./metrics.js", exportName: "extractMetrics" },
				output: {},
			};

			const result = validateConfig(config);

			assert.strictEqual(result.valid, false);
			assert.ok(result.errors.some((e) => e.includes("seedBase must be non-negative")));
		});

		it("should validate executor.timeoutMs is non-negative", () => {
			const config: ExperimentConfig = {
				experiment: { name: "Test" },
				executor: { timeoutMs: -1 },
				suts: [
					{
						id: "sut1",
						module: "./sut.js",
						exportName: "createSut",
						registration: { name: "SUT", version: "1.0.0", role: "primary", tags: [] },
					},
				],
				cases: [{ id: "case1", module: "./case.js", exportName: "createCase" }],
				metricsExtractor: { module: "./metrics.js", exportName: "extractMetrics" },
				output: {},
			};

			const result = validateConfig(config);

			assert.strictEqual(result.valid, false);
			assert.ok(result.errors.some((e) => e.includes("timeoutMs must be non-negative")));
		});

		it("should validate executor.concurrency is at least 1", () => {
			const config: ExperimentConfig = {
				experiment: { name: "Test" },
				executor: { concurrency: 0 },
				suts: [
					{
						id: "sut1",
						module: "./sut.js",
						exportName: "createSut",
						registration: { name: "SUT", version: "1.0.0", role: "primary", tags: [] },
					},
				],
				cases: [{ id: "case1", module: "./case.js", exportName: "createCase" }],
				metricsExtractor: { module: "./metrics.js", exportName: "extractMetrics" },
				output: {},
			};

			const result = validateConfig(config);

			assert.strictEqual(result.valid, false);
			assert.ok(result.errors.some((e) => e.includes("concurrency must be at least 1")));
		});

		it("should warn when no SUTs are configured", () => {
			const config: ExperimentConfig = {
				experiment: { name: "Test" },
				executor: { repetitions: 1 },
				suts: [],
				cases: [{ id: "case1", module: "./case.js", exportName: "createCase" }],
				metricsExtractor: { module: "./metrics.js", exportName: "extractMetrics" },
				output: {},
			};

			const result = validateConfig(config);

			assert.ok(result.warnings.some((w) => w.includes("No SUTs configured")));
		});

		it("should error when SUT is missing required fields", () => {
			const config: ExperimentConfig = {
				experiment: { name: "Test" },
				executor: { repetitions: 1 },
				suts: [
					{
						id: "sut1",
						module: "",
						exportName: "",
						registration: { name: "", version: "", role: "primary", tags: [] },
					},
				],
				cases: [{ id: "case1", module: "./case.js", exportName: "createCase" }],
				metricsExtractor: { module: "./metrics.js", exportName: "extractMetrics" },
				output: {},
			};

			const result = validateConfig(config);

			assert.ok(result.errors.some((e) => e.includes("suts[0].module is required")));
			assert.ok(result.errors.some((e) => e.includes("suts[0].exportName is required")));
		});

		it("should error when SUT registration.name is missing", () => {
			const config: ExperimentConfig = {
				experiment: { name: "Test" },
				executor: { repetitions: 1 },
				suts: [
					{
						id: "sut1",
						module: "./sut.js",
						exportName: "createSut",
						registration: { name: "", version: "1.0.0", role: "primary", tags: [] },
					},
				],
				cases: [{ id: "case1", module: "./case.js", exportName: "createCase" }],
				metricsExtractor: { module: "./metrics.js", exportName: "extractMetrics" },
				output: {},
			};

			const result = validateConfig(config);

			assert.ok(result.errors.some((e) => e.includes("suts[0].registration.name is required")));
		});

		it("should error when SUT registration.version is missing", () => {
			const config: ExperimentConfig = {
				experiment: { name: "Test" },
				executor: { repetitions: 1 },
				suts: [
					{
						id: "sut1",
						module: "./sut.js",
						exportName: "createSut",
						registration: { name: "SUT 1", version: "", role: "primary", config: {}, tags: [] },
					},
				],
				cases: [{ id: "case1", module: "./case.js", exportName: "createCase" }],
				metricsExtractor: { module: "./metrics.js", exportName: "extractMetrics" },
				output: {},
			};

			const result = validateConfig(config);

			assert.ok(result.errors.some((e) => e.includes("suts[0].registration.version is required")));
		});

		it("should error when SUT registration.role is missing", () => {
			const config: ExperimentConfig = {
				experiment: { name: "Test" },
				executor: { repetitions: 1 },
				suts: [
					{
						id: "sut1",
						module: "./sut.js",
						exportName: "createSut",
						registration: {
							name: "SUT 1",
							version: "1.0.0",
							role: undefined as never,
							config: {},
							tags: [],
						},
					},
				],
				cases: [{ id: "case1", module: "./case.js", exportName: "createCase" }],
				metricsExtractor: { module: "./metrics.js", exportName: "extractMetrics" },
				output: {},
			};

			const result = validateConfig(config);

			assert.ok(result.errors.some((e) => e.includes("suts[0].registration.role is required")));
		});

		it("should error when SUT registration.role is invalid", () => {
			const config: ExperimentConfig = {
				experiment: { name: "Test" },
				executor: { repetitions: 1 },
				suts: [
					{
						id: "sut1",
						module: "./sut.js",
						exportName: "createSut",
						registration: {
							name: "SUT 1",
							version: "1.0.0",
							role: "invalid" as never,
							config: {},
							tags: [],
						},
					},
				],
				cases: [{ id: "case1", module: "./case.js", exportName: "createCase" }],
				metricsExtractor: { module: "./metrics.js", exportName: "extractMetrics" },
				output: {},
			};

			const result = validateConfig(config);

			assert.ok(result.errors.some((e) => e.includes("suts[0].registration.role must be one of")));
		});

		it("should accept valid SUT roles", () => {
			for (const role of ["primary", "baseline", "oracle"] as const) {
				const config: ExperimentConfig = {
					experiment: { name: "Test" },
					executor: { repetitions: 1 },
					suts: [
						{
							id: "sut1",
							module: "./sut.js",
							exportName: "createSut",
							registration: { name: "SUT 1", version: "1.0.0", role, config: {}, tags: [] },
						},
					],
					cases: [{ id: "case1", module: "./case.js", exportName: "createCase" }],
					metricsExtractor: { module: "./metrics.js", exportName: "extractMetrics" },
				};

				const result = validateConfig(config);
				assert.ok(
					!result.errors.some((e) => e.includes("role must be one of")),
					`Role ${role} should be valid`,
				);
			}
		});

		it("should detect duplicate SUT IDs", () => {
			const config: ExperimentConfig = {
				experiment: { name: "Test" },
				executor: { repetitions: 1 },
				suts: [
					{
						id: "duplicate",
						module: "./sut1.js",
						exportName: "createSut1",
						registration: { name: "SUT 1", version: "1.0.0", role: "primary", tags: [] },
					},
					{
						id: "duplicate",
						module: "./sut2.js",
						exportName: "createSut2",
						registration: {
							name: "SUT 2",
							version: "1.0.0",
							role: "baseline",
							config: {},
							tags: [],
						},
					},
				],
				cases: [{ id: "case1", module: "./case.js", exportName: "createCase" }],
				metricsExtractor: { module: "./metrics.js", exportName: "extractMetrics" },
				output: {},
			};

			const result = validateConfig(config);

			assert.ok(result.errors.some((e) => e.includes("Duplicate SUT ID: duplicate")));
		});

		it("should warn when no cases are configured", () => {
			const config: ExperimentConfig = {
				experiment: { name: "Test" },
				executor: { repetitions: 1 },
				suts: [
					{
						id: "sut1",
						module: "./sut.js",
						exportName: "createSut",
						registration: { name: "SUT", version: "1.0.0", role: "primary", tags: [] },
					},
				],
				cases: [],
				metricsExtractor: { module: "./metrics.js", exportName: "extractMetrics" },
				output: {},
			};

			const result = validateConfig(config);

			assert.ok(result.warnings.some((w) => w.includes("No cases configured")));
		});

		it("should error when case is missing required fields", () => {
			const config: ExperimentConfig = {
				experiment: { name: "Test" },
				executor: { repetitions: 1 },
				suts: [
					{
						id: "sut1",
						module: "./sut.js",
						exportName: "createSut",
						registration: { name: "SUT", version: "1.0.0", role: "primary", tags: [] },
					},
				],
				cases: [{ id: "case1", module: "", exportName: "" }],
				metricsExtractor: { module: "./metrics.js", exportName: "extractMetrics" },
				output: {},
			};

			const result = validateConfig(config);

			assert.ok(result.errors.some((e) => e.includes("cases[0].module is required")));
			assert.ok(result.errors.some((e) => e.includes("cases[0].exportName is required")));
		});

		it("should detect duplicate case IDs", () => {
			const config: ExperimentConfig = {
				experiment: { name: "Test" },
				executor: { repetitions: 1 },
				suts: [
					{
						id: "sut1",
						module: "./sut.js",
						exportName: "createSut",
						registration: { name: "SUT", version: "1.0.0", role: "primary", tags: [] },
					},
				],
				cases: [
					{ id: "duplicate", module: "./case1.js", exportName: "createCase1" },
					{ id: "duplicate", module: "./case2.js", exportName: "createCase2" },
				],
				metricsExtractor: { module: "./metrics.js", exportName: "extractMetrics" },
				output: {},
			};

			const result = validateConfig(config);

			assert.ok(result.errors.some((e) => e.includes("Duplicate case ID: duplicate")));
		});

		it("should error when metricsExtractor is missing", () => {
			const config: ExperimentConfig = {
				experiment: { name: "Test" },
				executor: { repetitions: 1 },
				suts: [
					{
						id: "sut1",
						module: "./sut.js",
						exportName: "createSut",
						registration: { name: "SUT", version: "1.0.0", role: "primary", tags: [] },
					},
				],
				cases: [{ id: "case1", module: "./case.js", exportName: "createCase" }],
				metricsExtractor: undefined as never,
			};

			const result = validateConfig(config);

			assert.ok(
				result.errors.some((e) => e.includes("metricsExtractor configuration is required")),
			);
		});

		it("should error when metricsExtractor.module is missing", () => {
			const config: ExperimentConfig = {
				experiment: { name: "Test" },
				executor: { repetitions: 1 },
				suts: [
					{
						id: "sut1",
						module: "./sut.js",
						exportName: "createSut",
						registration: { name: "SUT", version: "1.0.0", role: "primary", tags: [] },
					},
				],
				cases: [{ id: "case1", module: "./case.js", exportName: "createCase" }],
				metricsExtractor: { module: "", exportName: "extractMetrics" },
			};

			const result = validateConfig(config);

			assert.ok(result.errors.some((e) => e.includes("metricsExtractor.module is required")));
		});

		it("should error when metricsExtractor.exportName is missing", () => {
			const config: ExperimentConfig = {
				experiment: { name: "Test" },
				executor: { repetitions: 1 },
				suts: [
					{
						id: "sut1",
						module: "./sut.js",
						exportName: "createSut",
						registration: { name: "SUT", version: "1.0.0", role: "primary", tags: [] },
					},
				],
				cases: [{ id: "case1", module: "./case.js", exportName: "createCase" }],
				metricsExtractor: { module: "./metrics.js", exportName: "" },
				output: {},
			};

			const result = validateConfig(config);

			assert.ok(result.errors.some((e) => e.includes("metricsExtractor.exportName is required")));
		});

		it("should warn when output configuration is missing", () => {
			const config = {
				experiment: { name: "Test" },
				executor: { repetitions: 1 },
				suts: [
					{
						id: "sut1",
						module: "./sut.js",
						exportName: "createSut",
						registration: { name: "SUT", version: "1.0.0", role: "primary", tags: [] },
					},
				],
				cases: [{ id: "case1", module: "./case.js", exportName: "createCase" }],
				metricsExtractor: { module: "./metrics.js", exportName: "extractMetrics" },
				output: undefined,
			} as unknown as ExperimentConfig;

			const result = validateConfig(config);

			assert.ok(result.warnings.some((w) => w.includes("No output configuration specified")));
		});

		it("should error when output.format is invalid", () => {
			const config: ExperimentConfig = {
				experiment: { name: "Test" },
				executor: { repetitions: 1 },
				suts: [
					{
						id: "sut1",
						module: "./sut.js",
						exportName: "createSut",
						registration: { name: "SUT", version: "1.0.0", role: "primary", tags: [] },
					},
				],
				cases: [{ id: "case1", module: "./case.js", exportName: "createCase" }],
				metricsExtractor: { module: "./metrics.js", exportName: "extractMetrics" },
				output: { format: "invalid" as never },
			};

			const result = validateConfig(config);

			assert.ok(result.errors.some((e) => e.includes("output.format must be one of")));
		});

		it("should accept valid output formats", () => {
			for (const format of ["json", "json-pretty"] as const) {
				const config: ExperimentConfig = {
					experiment: { name: "Test" },
					executor: { repetitions: 1 },
					suts: [
						{
							id: "sut1",
							module: "./sut.js",
							exportName: "createSut",
							registration: { name: "SUT", version: "1.0.0", role: "primary", tags: [] },
						},
					],
					cases: [{ id: "case1", module: "./case.js", exportName: "createCase" }],
					metricsExtractor: { module: "./metrics.js", exportName: "extractMetrics" },
					output: { format },
				};

				const result = validateConfig(config);
				assert.ok(
					!result.errors.some((e) => e.includes("output.format must be one of")),
					`Format ${format} should be valid`,
				);
			}
		});
	});

	describe("loadAndValidateConfig", () => {
		it("should load and validate a valid config", async () => {
			const config: ExperimentConfig = {
				experiment: { name: "Test Experiment" },
				executor: { repetitions: 1 },
				suts: [
					{
						id: "sut1",
						module: "./sut.js",
						exportName: "createSut",
						registration: { name: "SUT 1", version: "1.0.0", role: "primary", tags: [] },
					},
				],
				cases: [{ id: "case1", module: "./case.js", exportName: "createCase" }],
				metricsExtractor: { module: "./metrics.js", exportName: "extractMetrics" },
				output: {},
			};

			const configPath = await createConfigFile(config);
			const loaded = await loadAndValidateConfig(configPath);

			assert.strictEqual(loaded.config.experiment.name, "Test Experiment");
		});

		it("should throw when validation fails", async () => {
			const config = {
				experiment: {},
				executor: { repetitions: 1 },
				suts: [],
				cases: [],
				metricsExtractor: { module: "./m.js", exportName: "e" },
			} as never;

			const configPath = await createConfigFile(config);

			await assert.rejects(
				() => loadAndValidateConfig(configPath),
				/Configuration validation failed/,
			);
		});

		it("should throw with detailed error messages", async () => {
			const config = {
				experiment: {},
				executor: { repetitions: 1 },
				suts: [],
				cases: [],
				metricsExtractor: { module: "./m.js", exportName: "e" },
			} as never;

			const configPath = await createConfigFile(config);

			try {
				await loadAndValidateConfig(configPath);
				assert.fail("Should have thrown");
			} catch (error) {
				assert.ok(error instanceof Error);
				assert.ok(error.message.includes("experiment.name is required"));
			}
		});
	});
});
