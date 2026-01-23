/**
 * Renderer Type Definitions
 *
 * Types for the rendering layer that transforms aggregated results
 * into human-readable output formats (LaTeX, Markdown, etc.).
 */

import type { AggregatedResult } from "../types/aggregate.js";
import type { ClaimEvaluation } from "../types/claims.js";

/**
 * Column specification for a table.
 */
export interface ColumnSpec {
	/** Column key (matches field in data) */
	key: string;

	/** Column header text */
	header: string;

	/** LaTeX column alignment (l, r, c) */
	align: "l" | "r" | "c";

	/** Format function for values */
	format?: (value: unknown) => string;

	/** Whether to bold this column's values */
	bold?: boolean;

	/** Whether this column is sortable */
	sortable?: boolean;
}

/**
 * Table render specification.
 */
export interface TableRenderSpec {
	/** Table identifier */
	id: string;

	/** Output filename */
	filename: string;

	/** LaTeX label */
	label: string;

	/** Table caption (can include placeholders like {SPEEDUP}) */
	caption: string;

	/** Column specifications */
	columns: ColumnSpec[];

	/** Data extraction function */
	extractData: (aggregates: AggregatedResult[]) => Record<string, unknown>[];

	/** Optional filter predicate */
	filter?: (aggregate: AggregatedResult) => boolean;

	/** Optional sort function */
	sort?: (a: Record<string, unknown>, b: Record<string, unknown>) => number;

	/** Caption placeholders to compute */
	captionPlaceholders?: Record<string, (aggregates: AggregatedResult[]) => string>;
}

/**
 * Render output.
 */
export interface RenderOutput {
	/** Table/document identifier */
	id: string;

	/** Filename for output */
	filename: string;

	/** Rendered content */
	content: string;

	/** Format type */
	format: "latex" | "markdown" | "json";
}

/**
 * Renderer interface.
 */
export interface Renderer {
	/**
	 * Render a single table.
	 *
	 * @param aggregates - Aggregated results
	 * @param spec - Table specification
	 * @returns Rendered output
	 */
	renderTable(aggregates: AggregatedResult[], spec: TableRenderSpec): RenderOutput;

	/**
	 * Render all tables from specifications.
	 *
	 * @param aggregates - Aggregated results
	 * @param specs - Table specifications
	 * @returns Array of rendered outputs
	 */
	renderAll(aggregates: AggregatedResult[], specs: TableRenderSpec[]): RenderOutput[];

	/**
	 * Render claim evaluation summary.
	 *
	 * @param evaluations - Claim evaluations
	 * @returns Rendered output
	 */
	renderClaimSummary(evaluations: ClaimEvaluation[]): RenderOutput;
}

/**
 * Claim status display configuration.
 */
export interface ClaimStatusDisplay {
	satisfied: string;
	violated: string;
	inconclusive: string;
}

/**
 * Default claim status symbols for LaTeX.
 */
export const LATEX_CLAIM_STATUS: ClaimStatusDisplay = {
	satisfied: String.raw`\checkmark`,
	violated: String.raw`\times`,
	inconclusive: "?",
};

/**
 * Default claim status symbols for Unicode.
 */
export const UNICODE_CLAIM_STATUS: ClaimStatusDisplay = {
	satisfied: "✓",
	violated: "✗",
	inconclusive: "?",
};
