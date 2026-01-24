/**
 * Unit tests for CLI Validate Command
 *
 * Tests validate command functionality including:
 * - Config validation
 * - Error handling for invalid configs
 * - Display of parsed configuration
 */

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { writeFile } from "node:fs/promises";
import { unlink } from "node:fs/promises";
import { join } from "node:path";
import { mkdtemp, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";

import { validateConfig } from "../config-loader.js";

describe("validate command", () => {
	it("should validate a valid config", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "ppef-test-"));
		const configPath = join(tempDir, "config.json");

		const validConfig = {
			experiment: {
				name: "Test Experiment",
				version: "1.0.0",
			},
			executor: {
				repetitions: 10,
			},
			suts: [
				{
					id: "test-sut",
					module: "./test.js",
					exportName: "createSUT",
					registration: {
						name: "Test SUT",
						version: "1.0.0",
						role: "primary" as const,
						tags: [],
					},
				},
			],
			cases: [
				{
					id: "test-case",
					module: "./case.js",
					exportName: "createCase",
				},
			],
			metricsExtractor: {
				module: "./metrics.js",
				exportName: "extractMetrics",
			},
		};

		await writeFile(configPath, JSON.stringify(validConfig), "utf-8");

		const result = validateConfig(validConfig as any);
		assert.strictEqual(result.valid, true);
		assert.strictEqual(result.errors.length, 0);

		await unlink(configPath);
		await rmdir(tempDir);
	});

	it("should detect missing experiment name", () => {
		const invalidConfig = {
			experiment: {},
			executor: {},
			suts: [],
			cases: [],
			metricsExtractor: {
				module: "./metrics.js",
				exportName: "extractMetrics",
			},
		};

		const result = validateConfig(invalidConfig as any);
		assert.strictEqual(result.valid, false);
		assert.ok(result.errors.some((e) => e.includes("experiment.name is required")));
	});

	it("should detect invalid role values", () => {
		const invalidConfig = {
			experiment: {
				name: "Test",
			},
			executor: {},
			suts: [
				{
					id: "test-sut",
					module: "./test.js",
					exportName: "createSUT",
					registration: {
						name: "Test SUT",
						version: "1.0.0",
						role: "invalid" as any,
						tags: [],
					},
				},
			],
			cases: [],
			metricsExtractor: {
				module: "./metrics.js",
				exportName: "extractMetrics",
			},
		};

		const result = validateConfig(invalidConfig as any);
		assert.strictEqual(result.valid, false);
		assert.ok(result.errors.some((e) => e.includes("role must be one of")));
	});

	it("should detect duplicate SUT IDs", () => {
		const invalidConfig = {
			experiment: {
				name: "Test",
			},
			executor: {},
			suts: [
				{
					id: "duplicate-sut",
					module: "./test1.js",
					exportName: "createSUT",
					registration: {
						name: "Test SUT 1",
						version: "1.0.0",
						role: "primary" as const,
						tags: [],
					},
				},
				{
					id: "duplicate-sut",
					module: "./test2.js",
					exportName: "createSUT",
					registration: {
						name: "Test SUT 2",
						version: "1.0.0",
						role: "baseline" as const,
						tags: [],
					},
				},
			],
			cases: [],
			metricsExtractor: {
				module: "./metrics.js",
				exportName: "extractMetrics",
			},
		};

		const result = validateConfig(invalidConfig as any);
		assert.strictEqual(result.valid, false);
		assert.ok(result.errors.some((e) => e.includes("Duplicate SUT ID")));
	});

	it("should detect negative repetitions", () => {
		const invalidConfig = {
			experiment: {
				name: "Test",
			},
			executor: {
				repetitions: -1,
			},
			suts: [],
			cases: [],
			metricsExtractor: {
				module: "./metrics.js",
				exportName: "extractMetrics",
			},
		};

		const result = validateConfig(invalidConfig as any);
		assert.strictEqual(result.valid, false);
		assert.ok(result.errors.some((e) => e.includes("repetitions must be at least 1")));
	});

	it("should validate required SUT fields", () => {
		const invalidConfig = {
			experiment: {
				name: "Test",
			},
			executor: {},
			suts: [
				{
					id: "test-sut",
					module: "./test.js",
					exportName: "createSUT",
					registration: {
						name: "Test SUT",
						// Missing version
						role: "primary" as const,
						tags: [],
					},
				},
			],
			cases: [],
			metricsExtractor: {
				module: "./metrics.js",
				exportName: "extractMetrics",
			},
		};

		const result = validateConfig(invalidConfig as any);
		assert.strictEqual(result.valid, false);
		assert.ok(
			result.errors.some((e) => e.includes("registration.version") && e.includes("required")),
		);
	});

	it("should detect missing required case fields", () => {
		const invalidConfig = {
			experiment: {
				name: "Test",
			},
			executor: {},
			suts: [],
			cases: [
				{
					// Missing id
					module: "./case.js",
					exportName: "createCase",
				},
			],
			metricsExtractor: {
				module: "./metrics.js",
				exportName: "extractMetrics",
			},
		};

		const result = validateConfig(invalidConfig as any);
		assert.strictEqual(result.valid, false);
		assert.ok(result.errors.some((e) => e.includes("id") && e.includes("required")));
	});
});
