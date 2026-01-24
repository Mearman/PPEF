/**
 * Config Loader
 *
 * Loads and validates experiment configuration from JSON files.
 */

import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";

import type { ExperimentConfig, LoadedConfig, ValidationResult } from "./types.js";

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
 * @param config - Configuration to validate
 * @returns Validation result with errors and warnings
 */
export function validateConfig(config: ExperimentConfig): ValidationResult {
	const errors: string[] = [];
	const warnings: string[] = [];

	// Validate experiment metadata
	// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
	if (!config.experiment?.name) {
		errors.push("experiment.name is required");
	}

	// Validate executor config
	// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
	if (!config.executor) {
		errors.push("executor configuration is required");
	} else {
		if (config.executor.repetitions !== undefined && config.executor.repetitions < 1) {
			errors.push("executor.repetitions must be at least 1");
		}
		if (config.executor.seedBase !== undefined && config.executor.seedBase < 0) {
			errors.push("executor.seedBase must be non-negative");
		}
		if (config.executor.timeoutMs !== undefined && config.executor.timeoutMs < 0) {
			errors.push("executor.timeoutMs must be non-negative");
		}
		if (config.executor.concurrency !== undefined && config.executor.concurrency < 1) {
			errors.push("executor.concurrency must be at least 1");
		}
	}

	// Validate SUTs
	// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
	if (!config.suts || config.suts.length === 0) {
		warnings.push("No SUTs configured - experiment will have nothing to execute");
	} else {
		for (let i = 0; i < config.suts.length; i++) {
			const sut = config.suts[i];
			if (!sut.id) {
				errors.push(`suts[${i}].id is required`);
			}
			if (!sut.module) {
				errors.push(`suts[${i}].module is required`);
			}
			if (!sut.exportName) {
				errors.push(`suts[${i}].exportName is required`);
			}
			// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
			if (!sut.registration?.name) {
				errors.push(`suts[${i}].registration.name is required`);
			}
			// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
			if (!sut.registration?.version) {
				errors.push(`suts[${i}].registration.version is required`);
			}
			// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
			if (!sut.registration?.role) {
				errors.push(`suts[${i}].registration.role is required`);
			} else if (!["primary", "baseline", "oracle"].includes(sut.registration.role)) {
				errors.push(`suts[${i}].registration.role must be one of: primary, baseline, oracle`);
			}
		}

		// Check for duplicate SUT IDs
		const sutIds = new Set<string>();
		for (const sut of config.suts) {
			if (sut.id && sutIds.has(sut.id)) {
				errors.push(`Duplicate SUT ID: ${sut.id}`);
			}
			sutIds.add(sut.id);
		}
	}

	// Validate cases
	// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
	if (!config.cases || config.cases.length === 0) {
		warnings.push("No cases configured - experiment will have nothing to execute");
	} else {
		for (let i = 0; i < config.cases.length; i++) {
			const testCase = config.cases[i];
			if (!testCase.id) {
				errors.push(`cases[${i}].id is required`);
			}
			if (!testCase.module) {
				errors.push(`cases[${i}].module is required`);
			}
			if (!testCase.exportName) {
				errors.push(`cases[${i}].exportName is required`);
			}
		}

		// Check for duplicate case IDs
		const caseIds = new Set<string>();
		for (const testCase of config.cases) {
			if (testCase.id && caseIds.has(testCase.id)) {
				errors.push(`Duplicate case ID: ${testCase.id}`);
			}
			caseIds.add(testCase.id);
		}
	}

	// Validate metrics extractor
	// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
	if (!config.metricsExtractor) {
		errors.push("metricsExtractor configuration is required");
	} else {
		if (!config.metricsExtractor.module) {
			errors.push("metricsExtractor.module is required");
		}
		if (!config.metricsExtractor.exportName) {
			errors.push("metricsExtractor.exportName is required");
		}
	}

	// Validate output config
	// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
	if (!config.output) {
		warnings.push("No output configuration specified - using defaults");
	} else {
		if (config.output.format && !["json", "json-pretty"].includes(config.output.format)) {
			errors.push('output.format must be one of: "json", "json-pretty"');
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
