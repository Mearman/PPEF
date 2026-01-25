/**
 * Binary SUT Integration Tests
 *
 * End-to-end tests for binary SUT support.
 * Tests that binary SUTs can be loaded and executed through the CLI.
 */

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { writeFile, unlink } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { loadSutFactory } from "../module-loader.js";

describe("Binary SUT Integration", () => {
	/**
	 * Helper to create a temporary test script.
	 */
	async function createTestScript(
		name: string,
		content: string,
	): Promise<{ dir: string; path: string }> {
		const dir = await mkdtemp(join(tmpdir(), `binary-sut-integration-${name}-`));
		const path = join(dir, `${name}.js`);
		await writeFile(path, content, "utf8");
		return { dir, path };
	}

	/**
	 * Helper to cleanup temporary files.
	 */
	async function cleanup(path: string): Promise<void> {
		try {
			await unlink(path);
		} catch {
			// Ignore
		}
	}

	describe("module loader with binary SUTs", () => {
		it("should load binary SUT factory from binaryConfig", async () => {
			const { path } = await createTestScript(
				"doubler",
				`
				let inputData = '';
				process.stdin.on('data', (chunk) => { inputData += chunk; });
				process.stdin.on('end', () => {
					const inputs = JSON.parse(inputData);
					console.log(JSON.stringify({ result: inputs.x * 2 }));
				});
				`,
			);

			try {
				const sutDefinition = await loadSutFactory(
					"@ppef/binary-sut", // modulePath - not used for binary SUTs
					"createBinarySut", // exportName - not used for binary SUTs
					process.cwd(),
					{
						id: "test-doubler",
						name: "Test Doubler",
						version: "1.0.0",
						role: "primary",
						config: {},
						tags: [],
					},
					undefined,
					{
						type: "binary",
						command: "node",
						args: [path],
						inputFormat: "json",
						outputFormat: "json",
					},
				);

				// Verify SUT definition structure
				assert.equal(sutDefinition.registration.id, "test-doubler");
				assert.equal(sutDefinition.registration.name, "Test Doubler");
				assert.equal(sutDefinition.registration.version, "1.0.0");
				assert.equal(sutDefinition.registration.role, "primary");

				// Create SUT instance
				const sut = sutDefinition.factory();

				// Execute SUT
				const result = await sut.run({ x: 21 });
				assert.deepEqual(result, { result: 42 });
			} finally {
				await cleanup(path);
			}
		});

		it("should handle non-zero exit codes as errors", async () => {
			const { path } = await createTestScript(
				"error-exit",
				`
				console.error('Something went wrong');
				process.exit(1);
				`,
			);

			try {
				const sutDefinition = await loadSutFactory(
					"@ppef/binary-sut",
					"createBinarySut",
					process.cwd(),
					{
						id: "test-error-exit",
						name: "Test Error Exit",
						version: "1.0.0",
						role: "primary",
						config: {},
						tags: [],
					},
					undefined,
					{
						type: "binary",
						command: "node",
						args: [path],
					},
				);

				const sut = sutDefinition.factory();

				await assert.rejects(() => sut.run({}), /exited with code 1/);
			} finally {
				await cleanup(path);
			}
		});

		it("should handle different I/O formats", async () => {
			const { path } = await createTestScript(
				"lines-test",
				`
				let inputData = '';
				process.stdin.on('data', (chunk) => { inputData += chunk; });
				process.stdin.on('end', () => {
					const lines = inputData.trim().split('\\n');
					const uppercased = lines.map(line => line.toUpperCase());
					console.log(uppercased.join('\\n'));
				});
				`,
			);

			try {
				const sutDefinition = await loadSutFactory(
					"@ppef/binary-sut",
					"createBinarySut",
					process.cwd(),
					{
						id: "test-lines",
						name: "Test Lines",
						version: "1.0.0",
						role: "primary",
						config: {},
						tags: [],
					},
					undefined,
					{
						type: "binary",
						command: "node",
						args: [path],
						inputFormat: "lines",
						outputFormat: "lines",
					},
				);

				const sut = sutDefinition.factory();
				const result = await sut.run(["hello", "world"]);
				assert.deepEqual(result, ["HELLO", "WORLD"]);
			} finally {
				await cleanup(path);
			}
		});

		it("should handle timeout configuration", async () => {
			const { path } = await createTestScript(
				"timeout-sut",
				`
				// Sleep for 10 seconds
				setTimeout(() => {
					console.log('{"result": "too-late"}');
				}, 10000);
				`,
			);

			try {
				const sutDefinition = await loadSutFactory(
					"@ppef/binary-sut",
					"createBinarySut",
					process.cwd(),
					{
						id: "test-timeout",
						name: "Test Timeout",
						version: "1.0.0",
						role: "primary",
						config: {},
						tags: [],
					},
					undefined,
					{
						type: "binary",
						command: "node",
						args: [path],
						timeout: 100, // 100ms timeout
					},
				);

				const sut = sutDefinition.factory();

				await assert.rejects(() => sut.run({}), /BinarySut timeout after 100ms/);
			} finally {
				await cleanup(path);
			}
		});
	});
});
