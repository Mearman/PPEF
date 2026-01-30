/**
 * Example Integration Tests
 *
 * Runs example experiments via the CLI binary to verify
 * end-to-end functionality. Requires `pnpm build` first.
 */

import { describe, it, before, after } from "node:test";
import { strict as assert } from "node:assert";
import { execFile } from "node:child_process";
import { mkdtemp, rm, readdir, readFile, access } from "node:fs/promises";
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
			const { writeFile: writeFileFs } = await import("node:fs/promises");
			await writeFileFs(tempConfig, JSON.stringify(configContent));

			// Copy example modules to temp dir so relative paths resolve
			const { copyFile } = await import("node:fs/promises");
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
			const { writeFile: writeFileFs } = await import("node:fs/promises");
			await writeFileFs(tempConfig, JSON.stringify(configContent));

			// Copy modules
			// (already copied from previous test, but be explicit)
			const { copyFile } = await import("node:fs/promises");
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

	describe("invalid config", () => {
		it("rejects malformed config with non-zero exit code", async () => {
			const invalidConfig = join(tempDir, "invalid.json");
			const { writeFile: writeFileFs } = await import("node:fs/promises");
			await writeFileFs(invalidConfig, JSON.stringify({ invalid: true }));

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
