/**
 * Module Loader
 *
 * Dynamically loads JavaScript/TypeScript modules containing SUT factories,
 * case definitions, and metrics extractors.
 */

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import type { CaseDefinition, SutDefinition } from "../types/index.js";
import type { CaseDefinitionExport, MetricsExtractorExport, SutFactoryExport } from "./types.js";

/**
 * Binary SUT configuration for module loader.
 */
interface BinaryConfig {
	/** Type discriminator */
	type: "binary";

	/** Command to execute */
	command: string;

	/** Arguments to pass to command */
	args?: string[];

	/** How to serialize inputs to stdin */
	inputFormat?: "json" | "raw" | "lines";

	/** How to deserialize stdout */
	outputFormat?: "json" | "raw" | "lines";

	/** Timeout per run in milliseconds */
	timeout?: number;

	/** Exit code that indicates success */
	successExitCode?: number;

	/** Working directory */
	cwd?: string;
}

/**
 * Load a module from a file path.
 *
 * @param modulePath - Path to module file (relative to base directory)
 * @param baseDir - Base directory for resolving relative paths
 * @returns Loaded module exports
 * @throws Error if module cannot be loaded
 */
async function loadModule(modulePath: string, baseDir: string): Promise<Record<string, unknown>> {
	const absolutePath = resolve(baseDir, modulePath);

	// Use import with file:// URL for proper ESM support
	const moduleUrl = pathToFileURL(absolutePath).href;

	try {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
		const module = await import(moduleUrl);
		// eslint-disable-next-line @typescript-eslint/no-unsafe-return
		return module;
	} catch (error) {
		if (error instanceof Error) {
			throw new Error(`Failed to load module from ${modulePath}: ${error.message}`);
		}
		throw error;
	}
}

/**
 * Load a SUT factory from a module.
 *
 * @param modulePath - Path to module file
 * @param exportName - Name of the export to use
 * @param baseDir - Base directory for resolving paths
 * @returns SUT definition ready for registration
 * @throws Error if export cannot be found or loaded
 */
export async function loadSutFactory(
	modulePath: string,
	exportName: string,
	baseDir: string,
	registration: {
		id: string;
		name: string;
		version: string;
		role: "primary" | "baseline" | "oracle";
		config: Readonly<Record<string, unknown>>;
		tags: readonly string[];
		description?: string;
	},
	config?: Record<string, unknown>,
	binaryConfig?: BinaryConfig,
): Promise<SutDefinition> {
	// Handle binary SUTs
	if (binaryConfig?.type === "binary") {
		const { createBinarySut } = await import("../executor/binary-sut.js");
		const factory = createBinarySut({
			id: registration.id,
			command: binaryConfig.command,
			args: binaryConfig.args,
			inputFormat: binaryConfig.inputFormat ?? "json",
			outputFormat: binaryConfig.outputFormat ?? "json",
			timeout: binaryConfig.timeout,
			successExitCode: binaryConfig.successExitCode,
			cwd: binaryConfig.cwd ?? resolve(baseDir),
		});

		return {
			registration,
			factory: factory as (config?: Record<string, unknown>) => {
				id: string;
				config: Readonly<Record<string, unknown>>;
				run: (inputs: unknown) => Promise<unknown>;
			},
		};
	}

	const module = await loadModule(modulePath, baseDir);
	const factoryExport = module[exportName] as SutFactoryExport | undefined;

	if (typeof factoryExport !== "function") {
		throw new Error(
			`Export "${exportName}" in ${modulePath} is not a function. ` +
				`Found type: ${typeof factoryExport}`,
		);
	}

	// Wrap the factory to match our expected SutFactory type
	const factory: (config?: Record<string, unknown>) => {
		id: string;
		config: Readonly<Record<string, unknown>>;
		run: (inputs: unknown) => Promise<unknown>;
	} = (userConfig?: Record<string, unknown>) => {
		const instance = factoryExport({ ...config, ...userConfig });
		const mergedConfig = { ...config, ...userConfig, ...(instance.config ?? {}) };

		return {
			id: registration.id,
			config: mergedConfig as Readonly<Record<string, unknown>>,
			run: instance.run as (inputs: unknown) => Promise<unknown>,
		};
	};

	return {
		registration,
		factory,
		sourceModule: modulePath,
		sourceExportName: exportName,
	};
}

/**
 * Load a case definition from a module.
 *
 * @param modulePath - Path to module file
 * @param exportName - Name of the export to use
 * @param baseDir - Base directory for resolving paths
 * @returns Case definition ready for use
 * @throws Error if export cannot be found or loaded
 */
export async function loadCaseDefinition(
	modulePath: string,
	exportName: string,
	baseDir: string,
): Promise<CaseDefinition> {
	const module = await loadModule(modulePath, baseDir);
	const caseExport = module[exportName] as CaseDefinitionExport | undefined;

	if (typeof caseExport !== "function") {
		throw new Error(
			`Export "${exportName}" in ${modulePath} is not a function. ` +
				`Found type: ${typeof caseExport}`,
		);
	}

	const definition = caseExport();

	// Validate structure
	// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
	if (!definition.case?.caseId) {
		throw new Error(
			`Export "${exportName}" in ${modulePath} does not return a valid case definition. ` +
				`Missing case.caseId.`,
		);
	}

	if (typeof definition.getInput !== "function") {
		throw new Error(
			`Export "${exportName}" in ${modulePath} does not return a valid case definition. ` +
				`Missing getInput function.`,
		);
	}

	if (typeof definition.getInputs !== "function") {
		throw new Error(
			`Export "${exportName}" in ${modulePath} does not return a valid case definition. ` +
				`Missing getInputs function.`,
		);
	}

	const result = definition as CaseDefinition;
	result.sourceModule = modulePath;
	result.sourceExportName = exportName;
	return result;
}

/**
 * Load a metrics extractor from a module.
 *
 * @param modulePath - Path to module file
 * @param exportName - Name of the export to use
 * @param baseDir - Base directory for resolving paths
 * @returns Metrics extractor function
 * @throws Error if export cannot be found or loaded
 */
export async function loadMetricsExtractor(
	modulePath: string,
	exportName: string,
	baseDir: string,
): Promise<(result: unknown) => Record<string, number>> {
	const module = await loadModule(modulePath, baseDir);
	const extractorExport = module[exportName] as MetricsExtractorExport | undefined;

	if (typeof extractorExport !== "function") {
		throw new Error(
			`Export "${exportName}" in ${modulePath} is not a function. ` +
				`Found type: ${typeof extractorExport}`,
		);
	}

	return extractorExport;
}
