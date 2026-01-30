/**
 * Config Loader
 *
 * Loads and validates experiment configuration from JSON files.
 */

import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";

import { ExperimentConfig } from "./types.js";
import type { LoadedConfig, ValidationResult } from "./types.js";

/**
 * Load and parse experiment configuration from a JSON file.
 *
 * @param configPath - Path to config file (can be absolute or relative)
 * @returns Loaded configuration with base directory
 * @throws Error if file cannot be read or parsed
 */
export async function loadConfig(configPath: string): Promise<LoadedConfig> {
	// Resolve absolute path
	const absolutePath = resolve(configPath);

	// Read and parse JSON
	const content = await readFile(absolutePath, "utf-8");
	const config = JSON.parse(content) as ExperimentConfig;

	// Get base directory (for resolving module paths)
	const baseDir = dirname(absolutePath);

	return {
		config,
		baseDir,
		configPath: absolutePath,
	};
}

/**
 * Validate experiment configuration.
 *
 * Accepts raw parsed JSON (unknown) and validates it against the Zod schema.
 * Returns a ValidationResult with errors and warnings for backward compatibility.
 *
 * @param config - Configuration to validate (unknown input from JSON)
 * @returns Validation result with errors and warnings
 */
export function validateConfig(config: unknown): ValidationResult {
	const errors: string[] = [];
	const warnings: string[] = [];

	const result = ExperimentConfig.safeParse(config);

	if (!result.success) {
		for (const issue of result.error.issues) {
			const path = issue.path.join(".");
			errors.push(path ? `${path}: ${issue.message}` : issue.message);
		}
	}

	// Post-parse warnings (Zod doesn't have a warnings concept)
	if (result.success) {
		if (result.data.suts.length === 0) {
			warnings.push("No SUTs configured - experiment will have nothing to execute");
		}
		if (result.data.cases.length === 0) {
			warnings.push("No cases configured - experiment will have nothing to execute");
		}
	} else {
		// Even on parse failure, try to extract warnings from the raw input
		const raw = config as Record<string, unknown> | null;
		if (raw && typeof raw === "object") {
			if (!raw.output) {
				warnings.push("No output configuration specified - using defaults");
			}
			if (Array.isArray(raw.suts) && raw.suts.length === 0) {
				warnings.push("No SUTs configured - experiment will have nothing to execute");
			}
			if (Array.isArray(raw.cases) && raw.cases.length === 0) {
				warnings.push("No cases configured - experiment will have nothing to execute");
			}
		}
	}

	return {
		valid: errors.length === 0,
		errors,
		warnings,
	};
}

/**
 * Load and validate experiment configuration.
 *
 * @param configPath - Path to config file
 * @returns Loaded and validated configuration
 * @throws Error if validation fails
 */
export async function loadAndValidateConfig(configPath: string): Promise<LoadedConfig> {
	const loaded = await loadConfig(configPath);
	const validation = validateConfig(loaded.config);

	if (!validation.valid) {
		throw new Error(
			`Configuration validation failed:\n${validation.errors.map((e) => `  - ${e}`).join("\n")}`,
		);
	}

	// Print warnings if any
	if (validation.warnings.length > 0) {
		for (const warning of validation.warnings) {
			console.warn(`Warning: ${warning}`);
		}
	}

	return loaded;
}
