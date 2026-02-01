/**
 * Example Integration Tests
 *
 * Runs example experiments via the CLI binary to verify
 * end-to-end functionality. Requires `pnpm build` first.
 */

import { describe, it, before, after } from "node:test";
import { strict as assert } from "node:assert";
import { execFile } from "node:child_process";
import { mkdtemp, rm, readdir, readFile, access, writeFile, copyFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const PROJECT_ROOT = join(import.meta.dirname, "..", "..");
const BIN_PATH = join(PROJECT_ROOT, "bin", "ppef.mjs");
const EXAMPLES_DIR = join(PROJECT_ROOT, "examples");

/**
 * Verify dist/ exists before running tests.
 */
async function assertDistExists(): Promise<void> {
	try {
		await access(join(PROJECT_ROOT, "dist"));
	} catch {
		throw new Error("dist/ not found — run `pnpm build` before running integration tests");
	}
}

/**
 * Copy all files matching extensions from a source directory to a destination.
 */
async function copyExampleFiles(
	srcDir: string,
	destDir: string,
	extensions: string[],
): Promise<void> {
	const files = await readdir(srcDir);
	for (const file of files) {
		if (extensions.some((ext) => file.endsWith(ext))) {
			await copyFile(join(srcDir, file), join(destDir, file));
		}
	}
}

/**
 * Run an experiment and return the output directory contents.
 */
async function runExperiment(
	configPath: string,
	outputDir: string,
	cwd: string,
	timeout = 60000,
): Promise<{ files: string[]; jsonFiles: string[] }> {
	const configContent = JSON.parse(await readFile(configPath, "utf-8"));
	configContent.output.path = outputDir;

	const tempConfig = join(cwd, `experiment-${Date.now()}.json`);
	await writeFile(tempConfig, JSON.stringify(configContent));

	const { stdout } = await execFileAsync(
		"node",
		[BIN_PATH, "run", tempConfig, "--unsafe-in-process"],
		{ cwd, timeout },
	);

	assert.ok(stdout.length > 0, "Expected CLI output");

	const files = await readdir(outputDir);
	assert.ok(files.length > 0, `Expected result files in ${outputDir}`);

	const jsonFiles = files.filter((f) => f.endsWith(".json"));
	assert.ok(jsonFiles.length > 0, "Expected at least one JSON result file");

	return { files, jsonFiles };
}

/**
 * Find the aggregates file in an output directory.
 */
async function findAggregatesPath(outputDir: string): Promise<string> {
	const files = await readdir(outputDir);
	const aggregatesFiles = files.filter((f) => f.includes("aggregates"));
	assert.ok(aggregatesFiles.length > 0, "Expected aggregates file");
	return join(outputDir, aggregatesFiles[0]);
}

/**
 * Run an evaluator against aggregates and return the parsed output.
 */
async function runEvaluator(
	aggregatesPath: string,
	evalType: string,
	evalConfigPath: string,
	outputPath: string,
	cwd: string,
	timeout = 15000,
): Promise<Record<string, unknown>> {
	const { stdout } = await execFileAsync(
		"node",
		[
			BIN_PATH,
			"evaluate",
			aggregatesPath,
			"-t",
			evalType,
			"-c",
			evalConfigPath,
			"-o",
			outputPath,
			"-v",
		],
		{ cwd, timeout },
	);

	assert.ok(stdout.length > 0, "Expected CLI output");

	return JSON.parse(await readFile(outputPath, "utf-8")) as Record<string, unknown>;
}

describe("Example Integration Tests", () => {
	let tempDir: string;

	before(async () => {
		await assertDistExists();
		tempDir = await mkdtemp(join(tmpdir(), "ppef-examples-"));
	});

	after(async () => {
		if (tempDir) {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	describe("string-length example", () => {
		it("runs end-to-end and produces results", async () => {
			const outputDir = join(tempDir, "string-length-results");
			const configPath = join(EXAMPLES_DIR, "string-length", "experiment.json");

			// Read the config and override output path
			const configContent = JSON.parse(await readFile(configPath, "utf-8"));
			configContent.output.path = outputDir;

			// Write modified config to temp dir
			const tempConfig = join(tempDir, "experiment.json");
			await writeFile(tempConfig, JSON.stringify(configContent));

			// Copy example modules to temp dir so relative paths resolve
			await copyFile(join(EXAMPLES_DIR, "string-length", "sut.mjs"), join(tempDir, "sut.mjs"));
			await copyFile(join(EXAMPLES_DIR, "string-length", "case.mjs"), join(tempDir, "case.mjs"));
			await copyFile(
				join(EXAMPLES_DIR, "string-length", "metrics.mjs"),
				join(tempDir, "metrics.mjs"),
			);

			const { stdout } = await execFileAsync(
				"node",
				[BIN_PATH, "run", tempConfig, "--unsafe-in-process"],
				{
					cwd: tempDir,
					timeout: 30000,
				},
			);

			assert.ok(stdout.length > 0, "Expected CLI output");

			// Verify output directory exists with results
			const files = await readdir(outputDir);
			assert.ok(files.length > 0, `Expected result files in ${outputDir}, found none`);

			// Find a results JSON file and verify structure
			const jsonFiles = files.filter((f) => f.endsWith(".json"));
			assert.ok(jsonFiles.length > 0, "Expected at least one JSON result file");

			const resultContent = JSON.parse(await readFile(join(outputDir, jsonFiles[0]), "utf-8"));

			// Verify results have the expected structure
			assert.ok(
				resultContent.results ?? resultContent.aggregates,
				"Expected results or aggregates in output",
			);
		});

		it("validates config successfully", async () => {
			const configPath = join(EXAMPLES_DIR, "string-length", "experiment.json");

			const { stdout } = await execFileAsync("node", [BIN_PATH, "validate", configPath], {
				cwd: PROJECT_ROOT,
				timeout: 10000,
			});

			assert.ok(stdout.length > 0, "Expected validation output");
		});

		it("dry-run produces no output files", async () => {
			const outputDir = join(tempDir, "dry-run-results");
			const configPath = join(EXAMPLES_DIR, "string-length", "experiment.json");

			// Read config and override output path
			const configContent = JSON.parse(await readFile(configPath, "utf-8"));
			configContent.output.path = outputDir;

			const tempConfig = join(tempDir, "dry-run-experiment.json");
			await writeFile(tempConfig, JSON.stringify(configContent));

			// Copy modules
			// (already copied from previous test, but be explicit)
			for (const file of ["sut.mjs", "case.mjs", "metrics.mjs"]) {
				await copyFile(join(EXAMPLES_DIR, "string-length", file), join(tempDir, file));
			}

			await execFileAsync("node", [BIN_PATH, "plan", tempConfig], {
				cwd: tempDir,
				timeout: 10000,
			});

			// Verify no output directory was created
			try {
				await access(outputDir);
				assert.fail("Expected output directory to not exist after dry-run");
			} catch {
				// Expected — directory should not exist
			}
		});
	});

	describe("two-sut evaluation pipeline", () => {
		let twoSutOutputDir: string;
		let twoSutAggregatesPath: string;

		it("runs two-SUT experiment end-to-end", async () => {
			twoSutOutputDir = join(tempDir, "two-sut-results");
			const configPath = join(EXAMPLES_DIR, "string-length", "experiment-two-suts.json");

			// Read config and override output path
			const configContent = JSON.parse(await readFile(configPath, "utf-8"));
			configContent.output.path = twoSutOutputDir;

			const tempConfig = join(tempDir, "experiment-two-suts.json");
			await writeFile(tempConfig, JSON.stringify(configContent));

			// Copy all required modules
			for (const file of [
				"sut.mjs",
				"sut-spread.mjs",
				"case.mjs",
				"case-unicode.mjs",
				"metrics.mjs",
			]) {
				await copyFile(join(EXAMPLES_DIR, "string-length", file), join(tempDir, file));
			}

			const { stdout } = await execFileAsync(
				"node",
				[BIN_PATH, "run", tempConfig, "--unsafe-in-process"],
				{
					cwd: tempDir,
					timeout: 30000,
				},
			);

			assert.ok(stdout.length > 0, "Expected CLI output");

			// Find the aggregates file
			const files = await readdir(twoSutOutputDir);
			const aggregatesFiles = files.filter((f) => f.includes("aggregates"));
			assert.ok(aggregatesFiles.length > 0, "Expected aggregates file");
			twoSutAggregatesPath = join(twoSutOutputDir, aggregatesFiles[0]);

			// Verify aggregates structure
			const aggContent = JSON.parse(await readFile(twoSutAggregatesPath, "utf-8"));
			assert.ok(Array.isArray(aggContent.aggregates), "Expected aggregates array in output");
			assert.ok(aggContent.aggregates.length >= 2, "Expected at least 2 aggregated results");
		});

		it("evaluates claims on two-SUT results", async () => {
			assert.ok(twoSutAggregatesPath, "Aggregates path must be set by previous test");

			const claimsConfig = join(EXAMPLES_DIR, "string-length", "eval-claims.json");
			const claimsOutput = join(tempDir, "claims-output.json");

			const { stdout } = await execFileAsync(
				"node",
				[
					BIN_PATH,
					"evaluate",
					twoSutAggregatesPath,
					"-t",
					"claims",
					"-c",
					claimsConfig,
					"-o",
					claimsOutput,
					"-v",
				],
				{
					cwd: tempDir,
					timeout: 15000,
				},
			);

			assert.ok(stdout.length > 0, "Expected CLI output");

			const output = JSON.parse(await readFile(claimsOutput, "utf-8"));
			assert.strictEqual(output.type, "claims", "Expected claims evaluation type");
		});

		it("evaluates exploratory analysis on two-SUT results", async () => {
			assert.ok(twoSutAggregatesPath, "Aggregates path must be set by previous test");

			const exploratoryConfig = join(EXAMPLES_DIR, "string-length", "eval-exploratory.json");
			const exploratoryOutput = join(tempDir, "exploratory-output.json");

			const { stdout } = await execFileAsync(
				"node",
				[
					BIN_PATH,
					"evaluate",
					twoSutAggregatesPath,
					"-t",
					"exploratory",
					"-c",
					exploratoryConfig,
					"-o",
					exploratoryOutput,
					"-v",
				],
				{
					cwd: tempDir,
					timeout: 15000,
				},
			);

			assert.ok(stdout.length > 0, "Expected CLI output");

			const output = JSON.parse(await readFile(exploratoryOutput, "utf-8"));
			assert.strictEqual(output.type, "exploratory", "Expected exploratory evaluation type");
			assert.ok(output.data.rankings, "Expected rankings in exploratory output");
			assert.ok(
				Array.isArray(output.data.pairwiseComparisons),
				"Expected pairwiseComparisons array",
			);
		});

		it("evaluates metrics on two-SUT results", async () => {
			assert.ok(twoSutAggregatesPath, "Aggregates path must be set by previous test");

			const metricsConfig = join(EXAMPLES_DIR, "metrics-only", "eval-config.json");
			const metricsOutput = join(tempDir, "metrics-output.json");

			const { stdout } = await execFileAsync(
				"node",
				[
					BIN_PATH,
					"evaluate",
					twoSutAggregatesPath,
					"-t",
					"metrics",
					"-c",
					metricsConfig,
					"-o",
					metricsOutput,
					"-v",
				],
				{
					cwd: tempDir,
					timeout: 15000,
				},
			);

			assert.ok(stdout.length > 0, "Expected CLI output");

			const output = JSON.parse(await readFile(metricsOutput, "utf-8"));
			assert.strictEqual(output.type, "metrics", "Expected metrics evaluation type");
		});
	});

	describe("sorting-algorithms example", () => {
		let sortingOutputDir: string;
		let sortingAggregatesPath: string;
		let sortingTempDir: string;

		it("runs end-to-end and produces results", async () => {
			sortingTempDir = join(tempDir, "sorting-work");
			const { mkdir } = await import("node:fs/promises");
			await mkdir(sortingTempDir, { recursive: true });

			sortingOutputDir = join(tempDir, "sorting-results");
			const srcDir = join(EXAMPLES_DIR, "sorting-algorithms");

			// Copy all example files
			await copyExampleFiles(srcDir, sortingTempDir, [".ts", ".json"]);

			const { jsonFiles } = await runExperiment(
				join(srcDir, "experiment.json"),
				sortingOutputDir,
				sortingTempDir,
				120000,
			);

			// Verify results structure
			const resultContent = JSON.parse(
				await readFile(join(sortingOutputDir, jsonFiles[0]), "utf-8"),
			);
			assert.ok(
				resultContent.results ?? resultContent.aggregates,
				"Expected results or aggregates in output",
			);

			// Find aggregates
			sortingAggregatesPath = await findAggregatesPath(sortingOutputDir);
			const aggContent = JSON.parse(await readFile(sortingAggregatesPath, "utf-8"));
			assert.ok(Array.isArray(aggContent.aggregates), "Expected aggregates array");
			assert.ok(aggContent.aggregates.length >= 4, "Expected at least 4 SUT aggregates");
		});

		it("evaluates claims", async () => {
			assert.ok(sortingAggregatesPath, "Aggregates path must be set by previous test");

			const output = await runEvaluator(
				sortingAggregatesPath,
				"claims",
				join(EXAMPLES_DIR, "sorting-algorithms", "eval-claims.json"),
				join(tempDir, "sorting-claims-output.json"),
				sortingTempDir,
			);

			assert.strictEqual(output.type, "claims", "Expected claims evaluation type");
		});

		it("evaluates metrics", async () => {
			assert.ok(sortingAggregatesPath, "Aggregates path must be set by previous test");

			const output = await runEvaluator(
				sortingAggregatesPath,
				"metrics",
				join(EXAMPLES_DIR, "sorting-algorithms", "eval-metrics.json"),
				join(tempDir, "sorting-metrics-output.json"),
				sortingTempDir,
			);

			assert.strictEqual(output.type, "metrics", "Expected metrics evaluation type");
		});

		it("evaluates exploratory analysis", async () => {
			assert.ok(sortingAggregatesPath, "Aggregates path must be set by previous test");

			const output = await runEvaluator(
				sortingAggregatesPath,
				"exploratory",
				join(EXAMPLES_DIR, "sorting-algorithms", "eval-exploratory.json"),
				join(tempDir, "sorting-exploratory-output.json"),
				sortingTempDir,
			);

			assert.strictEqual(output.type, "exploratory", "Expected exploratory evaluation type");
			const data = output.data as Record<string, unknown>;
			assert.ok(data.rankings, "Expected rankings in exploratory output");
			assert.ok(Array.isArray(data.pairwiseComparisons), "Expected pairwiseComparisons array");
		});
	});

	describe("search-algorithms example", () => {
		let searchOutputDir: string;
		let searchAggregatesPath: string;
		let searchTempDir: string;

		it("runs end-to-end and produces results", async () => {
			searchTempDir = join(tempDir, "search-work");
			const { mkdir } = await import("node:fs/promises");
			await mkdir(searchTempDir, { recursive: true });

			searchOutputDir = join(tempDir, "search-results");
			const srcDir = join(EXAMPLES_DIR, "search-algorithms");

			// Copy all example files
			await copyExampleFiles(srcDir, searchTempDir, [".ts", ".json"]);

			const { jsonFiles } = await runExperiment(
				join(srcDir, "experiment.json"),
				searchOutputDir,
				searchTempDir,
				120000,
			);

			// Verify results structure
			const resultContent = JSON.parse(
				await readFile(join(searchOutputDir, jsonFiles[0]), "utf-8"),
			);
			assert.ok(
				resultContent.results ?? resultContent.aggregates,
				"Expected results or aggregates in output",
			);

			// Find aggregates
			searchAggregatesPath = await findAggregatesPath(searchOutputDir);
			const aggContent = JSON.parse(await readFile(searchAggregatesPath, "utf-8"));
			assert.ok(Array.isArray(aggContent.aggregates), "Expected aggregates array");
			assert.ok(aggContent.aggregates.length >= 4, "Expected at least 4 SUT aggregates");
		});

		it("evaluates claims", async () => {
			assert.ok(searchAggregatesPath, "Aggregates path must be set by previous test");

			const output = await runEvaluator(
				searchAggregatesPath,
				"claims",
				join(EXAMPLES_DIR, "search-algorithms", "eval-claims.json"),
				join(tempDir, "search-claims-output.json"),
				searchTempDir,
			);

			assert.strictEqual(output.type, "claims", "Expected claims evaluation type");
		});

		it("evaluates metrics", async () => {
			assert.ok(searchAggregatesPath, "Aggregates path must be set by previous test");

			const output = await runEvaluator(
				searchAggregatesPath,
				"metrics",
				join(EXAMPLES_DIR, "search-algorithms", "eval-metrics.json"),
				join(tempDir, "search-metrics-output.json"),
				searchTempDir,
			);

			assert.strictEqual(output.type, "metrics", "Expected metrics evaluation type");
		});

		it("evaluates exploratory analysis", async () => {
			assert.ok(searchAggregatesPath, "Aggregates path must be set by previous test");

			const output = await runEvaluator(
				searchAggregatesPath,
				"exploratory",
				join(EXAMPLES_DIR, "search-algorithms", "eval-exploratory.json"),
				join(tempDir, "search-exploratory-output.json"),
				searchTempDir,
			);

			assert.strictEqual(output.type, "exploratory", "Expected exploratory evaluation type");
			const data = output.data as Record<string, unknown>;
			assert.ok(data.rankings, "Expected rankings in exploratory output");
			assert.ok(Array.isArray(data.pairwiseComparisons), "Expected pairwiseComparisons array");
		});
	});

	describe("invalid config", () => {
		it("rejects malformed config with non-zero exit code", async () => {
			const invalidConfig = join(tempDir, "invalid.json");
			await writeFile(invalidConfig, JSON.stringify({ invalid: true }));

			try {
				await execFileAsync("node", [BIN_PATH, invalidConfig], {
					cwd: tempDir,
					timeout: 10000,
				});
				assert.fail("Expected non-zero exit code for invalid config");
			} catch (error) {
				// execFile rejects on non-zero exit code
				assert.ok(error, "Expected error for invalid config");
			}
		});
	});
});
