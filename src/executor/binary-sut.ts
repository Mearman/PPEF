/**
 * Binary SUT Wrapper
 *
 * Enables arbitrary binaries (Python scripts, compiled executables, etc.)
 * to be used as System Under Test in ppef experiments.
 *
 * The BinarySut class implements the SUT interface and bridges to external
 * processes via stdin/stdout IPC, with proper timeout handling and error isolation.
 *
 * Supported I/O formats:
 * - json: Structured data serialization (default)
 * - raw: Plain text passthrough
 * - lines: Line-separated values
 */

import { spawn } from "node:child_process";

import type { SUT } from "../types/sut.js";

/**
 * Configuration for binary SUT execution.
 */
export interface BinarySutConfig {
	/** Command to execute (e.g., "python3", "./my-script", "node") */
	command: string;

	/** Arguments to pass to the command */
	args?: string[];

	/** Working directory (defaults to current directory) */
	cwd?: string;

	/** Environment variables (merged with process.env) */
	env?: Record<string, string>;

	/** How to serialize inputs to stdin */
	inputFormat?: "json" | "raw" | "lines";

	/** How to deserialize stdout */
	outputFormat?: "json" | "raw" | "lines";

	/** Timeout per run in milliseconds (0 = no timeout, default: 30000) */
	timeout?: number;

	/** Exit code that indicates success (default: 0) */
	successExitCode?: number;
}

/**
 * Result from binary process execution.
 */
interface ProcessResult {
	stdout: string;
	stderr: string;
	exitCode: number | null;
}

/**
 * Binary SUT wrapper implementing the SUT interface.
 *
 * Spawns external processes, communicates via stdin/stdout,
 * and provides timeout handling and error isolation.
 */
export class BinarySut implements SUT<unknown, unknown> {
	readonly id: string;
	readonly config: Readonly<BinarySutConfig>;

	constructor(id: string, config: BinarySutConfig) {
		this.id = id;
		this.config = {
			...config,
			inputFormat: config.inputFormat ?? "json",
			timeout: config.timeout ?? 30000,
			successExitCode: config.successExitCode ?? 0,
		};
	}

	/**
	 * Execute the binary with the given inputs.
	 *
	 * @param inputs - Algorithm inputs (will be serialized based on inputFormat)
	 * @returns Promise resolving to deserialized output
	 * @throws Error on timeout, non-zero exit code, or spawn failure
	 */
	async run(inputs: unknown): Promise<unknown> {
		const proc = spawn(this.config.command, this.config.args ?? [], {
			cwd: this.config.cwd,
			env: { ...process.env, ...this.config.env },
			stdio: ["pipe", "pipe", "pipe"],
		});

		// Serialize inputs based on format
		const inputData = this._serializeInputs(inputs);
		proc.stdin.write(inputData);
		proc.stdin.end();

		// Collect output with timeout
		const result = await this._collectOutput(proc);
		return this._deserializeOutput(result);
	}

	/**
	 * Serialize inputs to stdin format.
	 */
	private _serializeInputs(inputs: unknown): string {
		switch (this.config.inputFormat) {
			case "json":
				return JSON.stringify(inputs);
			case "raw":
				return String(inputs);
			case "lines":
				return Array.isArray(inputs) ? inputs.join("\n") + "\n" : String(inputs) + "\n";
			default:
				return JSON.stringify(inputs);
		}
	}

	/**
	 * Collect stdout/stderr from process with timeout handling.
	 */
	private async _collectOutput(proc: ReturnType<typeof spawn>): Promise<ProcessResult> {
		return new Promise((resolve, reject) => {
			let stdout = "";
			let stderr = "";

			proc.stdout?.on("data", (data: Buffer) => {
				stdout += data.toString();
			});

			proc.stderr?.on("data", (data: Buffer) => {
				stderr += data.toString();
			});

			const timeoutMs = this.config.timeout ?? 0;
			let timer: ReturnType<typeof setTimeout> | undefined;

			if (timeoutMs > 0) {
				timer = setTimeout(() => {
					proc.kill("SIGKILL");
					reject(new Error(`BinarySut timeout after ${timeoutMs}ms`));
				}, timeoutMs);
			}

			proc.on("close", (exitCode) => {
				if (timer) clearTimeout(timer);

				const successCode = this.config.successExitCode ?? 0;
				if (exitCode === successCode) {
					resolve({ stdout, stderr, exitCode });
				} else {
					reject(new Error(`BinarySut exited with code ${exitCode}: ${stderr}`));
				}
			});

			proc.on("error", (error: Error) => {
				if (timer) clearTimeout(timer);
				reject(new Error(`BinarySut failed to spawn: ${error.message}`));
			});
		});
	}

	/**
	 * Deserialize stdout to output format.
	 */
	private _deserializeOutput(output: ProcessResult): unknown {
		const trimmed = output.stdout.trim();
		if (!trimmed) return null;

		switch (this.config.outputFormat) {
			case "json":
				return JSON.parse(trimmed);
			case "raw":
				return trimmed;
			case "lines":
				return trimmed.split("\n").filter(Boolean);
			default:
				// Auto-detect: try JSON first, fall back to raw
				try {
					return JSON.parse(trimmed);
				} catch {
					return trimmed;
				}
		}
	}
}

/**
 * Options for creating a binary SUT factory.
 */
export interface CreateBinarySutOptions extends BinarySutConfig {
	/** SUT ID (defaults to command name) */
	id?: string;
}

/**
 * SUT factory type for binary SUTs.
 *
 * Matches the expected SutFactory signature from the SUT interface.
 */
export type BinarySutFactory = (config?: Record<string, unknown>) => SUT<unknown, unknown>;

/**
 * Create a binary SUT factory function.
 *
 * The returned factory matches the SutFactory signature and can be used
 * interchangeably with other SUT factories in the ppef framework.
 *
 * @example
 * ```typescript
 * import { createBinarySut } from "ppef";
 *
 * const pythonSutFactory = createBinarySut({
 *   id: "python-classifier",
 *   command: "python3",
 *   args: ["classifier.py"],
 *   inputFormat: "json",
 *   outputFormat: "json",
 *   timeout: 30000,
 * });
 *
 * const sut = pythonSutFactory({ modelPath: "./model.pkl" });
 * const result = await sut.run({ features: [1, 2, 3] });
 * ```
 */
export function createBinarySut(options: CreateBinarySutOptions): BinarySutFactory {
	return (config?: Record<string, unknown>) => {
		const mergedConfig: BinarySutConfig = {
			command: options.command,
			args: options.args,
			cwd: options.cwd,
			env: options.env,
			inputFormat: options.inputFormat,
			outputFormat: options.outputFormat,
			timeout: options.timeout,
			successExitCode: options.successExitCode,
			...config,
		};

		const id = (config?.id as string | undefined) ?? options.id ?? `binary-${options.command}`;
		return new BinarySut(id, mergedConfig);
	};
}
