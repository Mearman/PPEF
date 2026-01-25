/**
 * Binary SUT Unit Tests
 *
 * Tests for the BinarySut class that enables arbitrary binaries
 * to be used as System Under Test in ppef experiments.
 */

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { writeFile, unlink, mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { BinarySut } from "../binary-sut.js";

describe("BinarySut", () => {
	/**
	 * Helper to create a temporary test script.
	 */
	async function createTestScript(
		name: string,
		content: string,
	): Promise<{ dir: string; path: string }> {
		const dir = await mkdtemp(join(tmpdir(), `binary-sut-test-${name}-`));
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

	describe("JSON I/O format", () => {
		it("should execute node script with JSON input and output", async () => {
			const { path } = await createTestScript(
				"json-test",
				`
				// Read JSON input from stdin
				let inputData = '';
				process.stdin.on('data', (chunk) => { inputData += chunk; });
				process.stdin.on('end', () => {
					const inputs = JSON.parse(inputData);
					// Write JSON output to stdout
					console.log(JSON.stringify({ result: inputs.x * 2 }));
				});
				`,
			);

			try {
				const sut = new BinarySut("test-json", {
					command: "node",
					args: [path],
					inputFormat: "json",
					outputFormat: "json",
				});

				const result = await sut.run({ x: 21 });
				assert.deepEqual(result, { result: 42 });
			} finally {
				await cleanup(path);
			}
		});

		it("should handle nested JSON structures", async () => {
			const { path } = await createTestScript(
				"nested-json",
				`
				let inputData = '';
				process.stdin.on('data', (chunk) => { inputData += chunk; });
				process.stdin.on('end', () => {
					const inputs = JSON.parse(inputData);
					console.log(JSON.stringify({
						sum: inputs.numbers.reduce((a, b) => a + b, 0),
						count: inputs.numbers.length
					}));
				});
				`,
			);

			try {
				const sut = new BinarySut("test-nested-json", {
					command: "node",
					args: [path],
					inputFormat: "json",
					outputFormat: "json",
				});

				const result = await sut.run({ numbers: [1, 2, 3, 4, 5] });
				assert.deepEqual(result, { sum: 15, count: 5 });
			} finally {
				await cleanup(path);
			}
		});
	});

	describe("raw I/O format", () => {
		it("should pass through raw text input and output", async () => {
			const { path } = await createTestScript(
				"raw-test",
				`
				let inputData = '';
				process.stdin.on('data', (chunk) => { inputData += chunk; });
				process.stdin.on('end', () => {
					// Echo with prefix
					console.log('ECHO: ' + inputData.trim());
				});
				`,
			);

			try {
				const sut = new BinarySut("test-raw", {
					command: "node",
					args: [path],
					inputFormat: "raw",
					outputFormat: "raw",
				});

				const result = await sut.run("hello world");
				assert.equal(result, "ECHO: hello world");
			} finally {
				await cleanup(path);
			}
		});
	});

	describe("lines I/O format", () => {
		it("should handle line-separated input and output", async () => {
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
				const sut = new BinarySut("test-lines", {
					command: "node",
					args: [path],
					inputFormat: "lines",
					outputFormat: "lines",
				});

				const result = await sut.run(["hello", "world", "test"]);
				assert.deepEqual(result, ["HELLO", "WORLD", "TEST"]);
			} finally {
				await cleanup(path);
			}
		});

		it("should handle single value as lines input", async () => {
			const { path } = await createTestScript(
				"single-lines",
				`
				let inputData = '';
				process.stdin.on('data', (chunk) => { inputData += chunk; });
				process.stdin.on('end', () => {
					console.log(inputData.trim().toUpperCase());
				});
				`,
			);

			try {
				const sut = new BinarySut("test-single-lines", {
					command: "node",
					args: [path],
					inputFormat: "lines",
					outputFormat: "lines",
				});

				const result = await sut.run("single");
				assert.deepEqual(result, ["SINGLE"]);
			} finally {
				await cleanup(path);
			}
		});
	});

	describe("timeout handling", () => {
		it("should timeout after configured milliseconds", async () => {
			const { path } = await createTestScript(
				"timeout-test",
				`
				// Sleep for 10 seconds
				setTimeout(() => {
					console.log('{"result": "too-late"}');
				}, 10000);
				`,
			);

			try {
				const sut = new BinarySut("test-timeout", {
					command: "node",
					args: [path],
					timeout: 100, // 100ms timeout
				});

				await assert.rejects(() => sut.run({}), /BinarySut timeout after 100ms/);
			} finally {
				await cleanup(path);
			}
		});

		it("should not timeout within configured time", async () => {
			const { path } = await createTestScript(
				"no-timeout",
				`
				console.log('{"result": "quick"}');
				`,
			);

			try {
				const sut = new BinarySut("test-no-timeout", {
					command: "node",
					args: [path],
					timeout: 5000, // 5 second timeout
				});

				const result = await sut.run({});
				assert.deepEqual(result, { result: "quick" });
			} finally {
				await cleanup(path);
			}
		});

		it("should handle timeout=0 as no timeout", async () => {
			const { path } = await createTestScript(
				"no-timeout-zero",
				`
				setTimeout(() => {
					console.log('{"result": "eventually"}');
				}, 100);
				`,
			);

			try {
				const sut = new BinarySut("test-zero-timeout", {
					command: "node",
					args: [path],
					timeout: 0, // No timeout
				});

				const result = await sut.run({});
				assert.deepEqual(result, { result: "eventually" });
			} finally {
				await cleanup(path);
			}
		});
	});

	describe("error handling", () => {
		it("should handle non-zero exit codes as errors", async () => {
			const { path } = await createTestScript(
				"exit-code",
				`
				console.error('Something went wrong');
				process.exit(1);
				`,
			);

			try {
				const sut = new BinarySut("test-exit-code", {
					command: "node",
					args: [path],
				});

				await assert.rejects(() => sut.run({}), /exited with code 1/i);
			} finally {
				await cleanup(path);
			}
		});

		it("should handle custom success exit code", async () => {
			const { path } = await createTestScript(
				"custom-exit",
				`
				console.log('{"result": "success"}');
				process.exit(42); // Custom success code
				`,
			);

			try {
				const sut = new BinarySut("test-custom-exit", {
					command: "node",
					args: [path],
					successExitCode: 42,
				});

				const result = await sut.run({});
				assert.deepEqual(result, { result: "success" });
			} finally {
				await cleanup(path);
			}
		});

		it("should handle process spawn failures", async () => {
			const sut = new BinarySut("test-spawn-fail", {
				command: "nonexistent-command-xyz-123",
			});

			await assert.rejects(() => sut.run({}), /failed to spawn/i);
		});
	});

	describe("auto-detection mode", () => {
		it("should auto-detect JSON when outputFormat not specified", async () => {
			const { path } = await createTestScript(
				"auto-json",
				`
				console.log('{"result": "auto-detected"}');
				`,
			);

			try {
				const sut = new BinarySut("test-auto-json", {
					command: "node",
					args: [path],
					// outputFormat not specified - should auto-detect
				});

				const result = await sut.run({});
				assert.deepEqual(result, { result: "auto-detected" });
			} finally {
				await cleanup(path);
			}
		});

		it("should fall back to raw when JSON parsing fails", async () => {
			const { path } = await createTestScript(
				"auto-raw",
				`
				console.log('plain text output');
				`,
			);

			try {
				const sut = new BinarySut("test-auto-raw", {
					command: "node",
					args: [path],
					// outputFormat not specified - should fall back to raw
				});

				const result = await sut.run({});
				assert.equal(result, "plain text output");
			} finally {
				await cleanup(path);
			}
		});
	});

	describe("SUT interface compliance", () => {
		it("should have required id and config properties", async () => {
			const sut = new BinarySut("test-id", {
				command: "echo",
			});

			assert.equal(sut.id, "test-id");
			assert.equal(sut.config.command, "echo");
		});

		it("should have run method that returns a Promise", async () => {
			const sut = new BinarySut("test-run-method", {
				command: "echo",
				args: ["test"],
			});

			const result = sut.run("test");
			assert.ok(result instanceof Promise);
		});
	});
});
