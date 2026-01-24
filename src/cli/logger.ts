/**
 * CLI Logger
 *
 * Handles progress reporting, error messages, and output formatting.
 */

import type { ExecutionProgress } from "../executor/index.js";

/**
 * Log level for controlling verbosity.
 */
export type LogLevel = "silent" | "error" | "warn" | "info" | "debug";

/**
 * CLI logger for formatted output.
 */
export class CliLogger {
	private readonly level: LogLevel;
	private readonly quiet: boolean;
	private showProgress = false;
	private lastProgress = "";

	constructor(options: { verbose?: boolean; quiet?: boolean }) {
		this.quiet = options.quiet ?? false;
		this.level = options.verbose ? "debug" : this.quiet ? "silent" : "info";
	}

	/**
	 * Enable or disable progress bar updates.
	 */
	setProgress(enabled: boolean): void {
		this.showProgress = enabled;
	}

	/**
	 * Log a debug message (only shown in verbose mode).
	 */
	debug(message: string): void {
		if (this.level === "debug") {
			this.log(`[DEBUG] ${message}`);
		}
	}

	/**
	 * Log an info message.
	 */
	info(message: string): void {
		if (this.level !== "silent") {
			this.log(message);
		}
	}

	/**
	 * Log a warning message.
	 */
	warn(message: string): void {
		if (this.level !== "silent") {
			this.log(`Warning: ${message}`);
		}
	}

	/**
	 * Log an error message (always shown unless quiet).
	 */
	error(message: string): void {
		if (this.level !== "silent") {
			this.log(`Error: ${message}`);
		}
	}

	/**
	 * Log execution progress.
	 */
	progress(progress: ExecutionProgress): void {
		if (!this.showProgress || this.level === "silent") {
			return;
		}

		const percentage = Math.round((progress.completed / progress.total) * 100);
		const currentSut = progress.currentSut ?? "unknown";
		const currentCase = progress.currentCase ?? "unknown";
		const currentRep = progress.currentRepetition ?? 0;
		const elapsed = Math.round(progress.elapsedMs / 1000);

		const message = `[${percentage}%] ${currentSut} / ${currentCase} (rep ${currentRep + 1}) - ${elapsed}s`;

		// Only update if message changed (avoid flickering)
		if (message !== this.lastProgress) {
			// Use carriage return to overwrite line
			process.stdout.write(`\r${message.padEnd(80)}`);
			this.lastProgress = message;
		}

		// New line when complete
		if (progress.completed >= progress.total) {
			process.stdout.write("\n");
		}
	}

	/**
	 * Clear the current progress line.
	 */
	clearProgress(): void {
		if (this.lastProgress) {
			process.stdout.write("\r" + " ".repeat(80) + "\r");
			this.lastProgress = "";
		}
	}

	/**
	 * Log a header section.
	 */
	header(title: string): void {
		if (this.level === "silent") {
			return;
		}
		this.log("");
		this.log(`=== ${title} ===`);
	}

	/**
	 * Log a sub-header.
	 */
	subheader(title: string): void {
		if (this.level === "silent") {
			return;
		}
		this.log(`--- ${title}`);
	}

	/**
	 * Create a progress reporter callback for the executor.
	 */
	createProgressReporter(): (progress: ExecutionProgress) => void {
		return (progress) => {
			this.progress(progress);
		};
	}

	/**
	 * Internal log method.
	 */
	private log(message: string): void {
		// Clear progress line before logging
		this.clearProgress();
		console.log(message);
	}
}

/**
 * Create a default logger instance.
 */
export function createLogger(options: { verbose?: boolean; quiet?: boolean } = {}): CliLogger {
	return new CliLogger(options);
}
