/**
 * Result Collector
 *
 * Collects, validates, and stores evaluation results.
 * Replaces the simple MetricsCollector with a schema-aware implementation.
 */

import type { Primitive } from "../types/case.js";
import type { EvaluationResult, ResultBatch } from "../types/result.js";
import type { SutRole } from "../types/sut.js";

/**
 * Filter criteria for querying results.
 */
export interface ResultFilter {
	/** Filter by SUT ID */
	sut?: string;

	/** Filter by SUT role */
	sutRole?: SutRole;

	/** Filter by case ID */
	caseId?: string;

	/** Filter by case class */
	caseClass?: string;

	/** Filter by validity */
	valid?: boolean;

	/** Filter by metric presence */
	hasMetric?: string;

	/** Custom predicate */
	predicate?: (result: EvaluationResult) => boolean;
}

/**
 * Aggregation options.
 */
export interface AggregationOptions {
	/** Group by SUT */
	groupBySut?: boolean;

	/** Group by case class */
	groupByCaseClass?: boolean;

	/** Metrics to aggregate */
	metrics?: string[];
}

/**
 * Schema validation error.
 */
export interface ValidationError {
	field: string;
	message: string;
}

/**
 * Result collector with schema validation and querying.
 */
export class ResultCollector {
	private results: EvaluationResult[] = [];
	private readonly schemaVersion = "1.0.0";

	/**
	 * Record a single result with validation.
	 *
	 * @param result - Result to record
	 * @throws Error if result fails validation
	 */
	record(result: EvaluationResult): void {
		const errors = this.validate(result);
		if (errors.length > 0) {
			throw new Error(
				`Invalid result: ${errors.map((e) => `${e.field}: ${e.message}`).join(", ")}`,
			);
		}
		this.results.push(result);
	}

	/**
	 * Record multiple results.
	 *
	 * @param results - Results to record
	 */
	recordBatch(results: EvaluationResult[]): void {
		for (const result of results) {
			this.record(result);
		}
	}

	/**
	 * Validate a result against the schema.
	 *
	 * @param result - Result to validate
	 * @returns Array of validation errors (empty if valid)
	 */
	validate(result: EvaluationResult): ValidationError[] {
		const errors: ValidationError[] = [];

		// Validate required nested properties have non-empty values
		if (result.run.runId === "") {
			errors.push({ field: "run.runId", message: "Missing run ID" });
		}
		if (result.run.sut === "") {
			errors.push({ field: "run.sut", message: "Missing SUT identifier" });
		}
		if (result.run.caseId === "") {
			errors.push({ field: "run.caseId", message: "Missing case ID" });
		}

		if (Object.keys(result.metrics.numeric).length === 0) {
			errors.push({ field: "metrics.numeric", message: "Missing numeric metrics" });
		}

		if (result.provenance.runtime.platform === "") {
			errors.push({ field: "provenance.runtime.platform", message: "Missing platform" });
		}

		return errors;
	}

	/**
	 * Query results with filters.
	 *
	 * @param filter - Filter criteria
	 * @returns Matching results
	 */
	query(filter: ResultFilter = {}): EvaluationResult[] {
		return this.results.filter((result) => {
			if (filter.sut && result.run.sut !== filter.sut) return false;
			if (filter.sutRole && result.run.sutRole !== filter.sutRole) return false;
			if (filter.caseId && result.run.caseId !== filter.caseId) return false;
			if (filter.caseClass && result.run.caseClass !== filter.caseClass) return false;
			if (filter.valid !== undefined && result.correctness.valid !== filter.valid) return false;
			if (filter.hasMetric && !(filter.hasMetric in result.metrics.numeric)) return false;
			if (filter.predicate && !filter.predicate(result)) return false;
			return true;
		});
	}

	/**
	 * Get all results for a specific SUT.
	 *
	 * @param sutId - SUT identifier
	 * @returns Results for that SUT
	 */
	getBySut(sutId: string): EvaluationResult[] {
		return this.query({ sut: sutId });
	}

	/**
	 * Get all results for a specific case class.
	 *
	 * @param caseClass - Case class
	 * @returns Results for that case class
	 */
	getByCaseClass(caseClass: string): EvaluationResult[] {
		return this.query({ caseClass });
	}

	/**
	 * Get unique SUT IDs in the collection.
	 */
	getUniqueSuts(): string[] {
		return [...new Set(this.results.map((r) => r.run.sut))];
	}

	/**
	 * Get unique case classes in the collection.
	 */
	getUniqueCaseClasses(): string[] {
		const classes = this.results
			.map((r) => r.run.caseClass)
			.filter((c): c is string => c !== undefined);
		return [...new Set(classes)];
	}

	/**
	 * Get unique metric names in the collection.
	 */
	getUniqueMetrics(): string[] {
		const metrics = new Set<string>();
		for (const result of this.results) {
			for (const metric of Object.keys(result.metrics.numeric)) {
				metrics.add(metric);
			}
		}
		return [...metrics];
	}

	/**
	 * Get all results.
	 */
	getAll(): EvaluationResult[] {
		return [...this.results];
	}

	/**
	 * Get result count.
	 */
	get count(): number {
		return this.results.length;
	}

	/**
	 * Check if empty.
	 */
	get isEmpty(): boolean {
		return this.results.length === 0;
	}

	/**
	 * Clear all results.
	 */
	clear(): void {
		this.results = [];
	}

	/**
	 * Serialize to ResultBatch format.
	 *
	 * @param metadata - Optional batch metadata
	 * @returns Serializable batch
	 */
	serialize(metadata?: Record<string, Primitive>): ResultBatch {
		return {
			version: this.schemaVersion,
			timestamp: new Date().toISOString(),
			results: this.results,
			metadata,
		};
	}

	/**
	 * Load from a ResultBatch.
	 *
	 * @param batch - Batch to load
	 * @param append - Whether to append to existing results
	 */
	load(batch: ResultBatch, append = false): void {
		if (!append) {
			this.results = [];
		}
		this.recordBatch(batch.results);
	}

	/**
	 * Extract a specific metric across all results.
	 *
	 * @param metricName - Metric to extract
	 * @returns Array of { runId, value } pairs
	 */
	extractMetric(metricName: string): { runId: string; value: number }[] {
		return this.results
			.filter((r) => metricName in r.metrics.numeric)
			.map((r) => ({
				runId: r.run.runId,
				value: r.metrics.numeric[metricName],
			}));
	}

	/**
	 * Get metric values for a specific SUT.
	 *
	 * @param sutId - SUT identifier
	 * @param metricName - Metric name
	 * @returns Array of metric values
	 */
	getMetricValues(sutId: string, metricName: string): number[] {
		return this.results
			.filter((r) => r.run.sut === sutId && metricName in r.metrics.numeric)
			.map((r) => r.metrics.numeric[metricName]);
	}
}

/**
 * Global result collector instance.
 */
export const resultCollector = new ResultCollector();
