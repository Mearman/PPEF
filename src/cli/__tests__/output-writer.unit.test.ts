/**
 * Unit tests for CLI Output Writer
 *
 * Tests output writing functionality including:
 * - writeResults
 * - writeAggregates
 * - generateOutputFilename
 */

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { writeFile } from "node:fs/promises";
import { unlink } from "node:fs/promises";
import { join } from "node:path";
import { mkdtemp, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";

import { writeResults, writeAggregates, generateOutputFilename } from "../output-writer.js";
import type { AggregationOutput } from "../../types/aggregate.js";
import type { EvaluationResult } from "../../types/result.js";

describe("output-writer", () => {
	describe("generateOutputFilename", () => {
		it("should generate filename with timestamp", () => {
			const filename = generateOutputFilename("experiment", "results");
			// Format: experiment-results-YYYY-MM-DDTHH-MM-SS.json (ISO format with colons replaced)
			assert.match(filename, /experiment-results-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.json/);
		});

		it("should generate aggregates filename", () => {
			const filename = generateOutputFilename("test-exp", "aggregates");
			assert.ok(filename.includes("aggregates"));
			assert.ok(filename.endsWith(".json"));
		});

		it("should sanitize special characters in experiment name", () => {
			const filename = generateOutputFilename("Test Experiment!", "results");
			assert.ok(!filename.includes("!"));
			assert.ok(filename.includes("test-experiment"));
		});
	});

	describe("writeResults", () => {
		it("should write results to JSON file", async () => {
			const tempDir = await mkdtemp(join(tmpdir(), "ppef-test-"));
			const results: EvaluationResult[] = [
				{
					run: {
						runId: "test-run-id",
						sut: "test-sut",
						sutRole: "primary" as const,
						caseId: "test-case",
						caseClass: "test-class",
						repetition: 0,
						seed: 42,
					},
					correctness: {
						expectedExists: true,
						producedOutput: true,
						valid: true,
						matchesExpected: true,
					},
					outputs: {
						summary: {},
					},
					metrics: { numeric: { accuracy: 0.85 } },
					provenance: {
						runtime: {
							platform: "test",
							arch: "x64",
							nodeVersion: "20.0.0",
						},
					},
				},
			];

			const outputPath = join(tempDir, "results.json");
			await writeResults(results, outputPath, "json");

			// Verify file was written
			const written = await readFile(outputPath, "utf-8");
			const data = JSON.parse(written);
			assert.ok(data.results);
			assert.strictEqual(data.results.length, 1);
			assert.strictEqual(data.results[0].run.sut, "test-sut");

			await unlink(outputPath);
			await rmdir(tempDir);
		});

		it("should write results in pretty format", async () => {
			const tempDir = await mkdtemp(join(tmpdir(), "ppef-test-"));
			const results: EvaluationResult[] = [
				{
					run: {
						runId: "test-run-id",
						sut: "test-sut",
						sutRole: "primary" as const,
						sutVersion: "1.0.0",
						caseId: "test-case",
						caseClass: "test-class",
						repetition: 0,
						seed: 42,
					},
					correctness: {
						expectedExists: true,
						producedOutput: true,
						valid: true,
						matchesExpected: true,
					},
					outputs: {
						summary: {},
					},
					metrics: { numeric: { accuracy: 0.85 } },
					provenance: {
						runtime: {
							platform: "test",
							arch: "x64",
							nodeVersion: "20.0.0",
						},
					},
				},
			];

			const outputPath = join(tempDir, "results.json");
			await writeResults(results, outputPath, "json-pretty");

			// Verify file was written with formatting
			const written = await readFile(outputPath, "utf-8");
			assert.ok(written.includes("\n")); // Pretty format has newlines

			await unlink(outputPath);
			await rmdir(tempDir);
		});

		it("should create output directory if it does not exist", async () => {
			const tempDir = await mkdtemp(join(tmpdir(), "ppef-test-"));
			const nestedPath = join(tempDir, "nested", "dir", "results.json");
			const results: EvaluationResult[] = [];

			await writeResults(results, nestedPath, "json");

			// Verify file was created in nested directory
			const written = await readFile(nestedPath, "utf-8");
			const data = JSON.parse(written);
			assert.strictEqual(data.count, 0);

			// Cleanup
			await unlink(nestedPath);
			await rmdir(join(tempDir, "nested", "dir"));
			await rmdir(join(tempDir, "nested"));
			await rmdir(tempDir);
		});
	});

	describe("writeAggregates", () => {
		it("should write aggregates to JSON file", async () => {
			const tempDir = await mkdtemp(join(tmpdir(), "ppef-test-"));
			const aggregates: AggregationOutput = {
				version: "1.0.0",
				timestamp: new Date().toISOString(),
				aggregates: [
					{
						sut: "test-sut",
						sutRole: "primary" as const,
						caseClass: undefined,
						group: {
							runCount: 10,
							caseCount: 5,
						},
						correctness: {
							validRate: 1.0,
							producedOutputRate: 1.0,
						},
						metrics: {
							accuracy: {
								n: 10,
								mean: 0.85,
								median: 0.86,
								min: 0.75,
								max: 0.95,
								std: 0.05,
							},
						},
					},
				],
			};

			const outputPath = join(tempDir, "aggregates.json");
			await writeAggregates(aggregates, outputPath, "json");

			// Verify file was written
			const written = await readFile(outputPath, "utf-8");
			const data = JSON.parse(written);
			assert.ok(data.aggregates);
			assert.strictEqual(data.aggregates.length, 1);
			assert.strictEqual(data.aggregates[0].sut, "test-sut");

			await unlink(outputPath);
			await rmdir(tempDir);
		});

		it("should write aggregates in pretty format", async () => {
			const tempDir = await mkdtemp(join(tmpdir(), "ppef-test-"));
			const aggregates: AggregationOutput = {
				version: "1.0.0",
				timestamp: new Date().toISOString(),
				aggregates: [],
			};

			const outputPath = join(tempDir, "aggregates.json");
			await writeAggregates(aggregates, outputPath, "json-pretty");

			// Verify file was written with formatting
			const written = await readFile(outputPath, "utf-8");
			assert.ok(written.includes("\n")); // Pretty format has newlines

			await unlink(outputPath);
			await rmdir(tempDir);
		});

		it("should handle directory creation errors gracefully", async () => {
			const tempDir = await mkdtemp(join(tmpdir(), "ppef-test-"));
			const aggregates: AggregationOutput = {
				version: "1.0.0",
				timestamp: new Date().toISOString(),
				aggregates: [],
			};

			const outputPath = join(tempDir, "aggregates.json");
			// First write creates directory successfully
			await writeAggregates(aggregates, outputPath, "json");
			// Second write hits the catch block in ensureDir (directory already exists)
			await writeAggregates(aggregates, outputPath, "json");

			// Verify file was written
			const written = await readFile(outputPath, "utf-8");
			const data = JSON.parse(written);
			assert.strictEqual(data.version, "1.0.0");

			// Cleanup
			await unlink(outputPath);
			await rmdir(tempDir);
		});
	});
});
