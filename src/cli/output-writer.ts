/**
 * Output Writer
 *
 * Handles writing results and aggregates to JSON files.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { AggregationOutput } from "../types/aggregate.js";
import type { EvaluationResult } from "../types/result.js";

/**
 * Output format options.
 */
export type OutputFormat = "json" | "json-pretty";

/**
 * Result batch output format.
 */
export interface ResultBatch {
	/** Batch format version */
	version: string;

	/** Timestamp of generation */
	timestamp: string;

	/** Total results in batch */
	count: number;

	/** Evaluation results */
	results: EvaluationResult[];
}

/**
 * Write results to a JSON file.
 *
 * @param results - Results to write
 * @param outputPath - Path to output file
 * @param format - Output format
 * @throws Error if file cannot be written
 */
export async function writeResults(
	results: EvaluationResult[],
	outputPath: string,
	format: OutputFormat = "json-pretty",
): Promise<void> {
	const batch: ResultBatch = {
		version: "1.0.0",
		timestamp: new Date().toISOString(),
		count: results.length,
		results,
	};

	const json = format === "json-pretty" ? JSON.stringify(batch, null, 2) : JSON.stringify(batch);

	await ensureDir(dirname(outputPath));
	await writeFile(outputPath, json, "utf-8");
}

/**
 * Write aggregated results to a JSON file.
 *
 * @param aggregation - Aggregation output to write
 * @param outputPath - Path to output file
 * @param format - Output format
 * @throws Error if file cannot be written
 */
export async function writeAggregates(
	aggregation: AggregationOutput,
	outputPath: string,
	format: OutputFormat = "json-pretty",
): Promise<void> {
	const json =
		format === "json-pretty" ? JSON.stringify(aggregation, null, 2) : JSON.stringify(aggregation);

	await ensureDir(dirname(outputPath));
	await writeFile(outputPath, json, "utf-8");
}

/**
 * Generate output filename based on experiment name and timestamp.
 *
 * @param experimentName - Name of the experiment
 * @param type - Type of output ("results" or "aggregates")
 * @returns Generated filename
 */
export function generateOutputFilename(
	experimentName: string,
	type: "results" | "aggregates",
): string {
	const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5);
	const sanitizedName = experimentName.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
	return `${sanitizedName}-${type}-${timestamp}.json`;
}

/**
 * Ensure a directory exists, creating it if necessary.
 *
 * @param dirPath - Directory path
 */
async function ensureDir(dirPath: string): Promise<void> {
	try {
		await mkdir(dirPath, { recursive: true });
	} catch {
		// Ignore errors (directory may already exist)
	}
}
