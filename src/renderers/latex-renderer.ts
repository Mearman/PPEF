/**
 * LaTeX Renderer
 *
 * Pure transformation from aggregated results to LaTeX tables.
 * NO aggregation logic allowed here - only formatting and rendering.
 */

import type { AggregatedResult } from "../types/aggregate.js";
import type { ClaimEvaluation, ClaimStatus } from "../types/claims.js";
import type {
	ClaimStatusDisplay,
	ColumnSpec,
	Renderer,
	RenderOutput,
	TableRenderSpec,
} from "./types.js";
import { LATEX_CLAIM_STATUS } from "./types.js";

/**
 * Options for LaTeX rendering.
 */
export interface LaTeXRendererOptions {
	/** Claim status symbols */
	claimStatus?: ClaimStatusDisplay;

	/** Whether to use booktabs package */
	booktabs?: boolean;

	/** Default number format decimals */
	defaultDecimals?: number;
}

/**
 * Default LaTeX renderer options.
 */
const DEFAULT_OPTIONS: LaTeXRendererOptions = {
	claimStatus: LATEX_CLAIM_STATUS,
	booktabs: true,
	defaultDecimals: 2,
};

/**
 * LaTeX table renderer.
 */
export class LaTeXRenderer implements Renderer {
	private readonly options: LaTeXRendererOptions;

	constructor(options: Partial<LaTeXRendererOptions> = {}) {
		this.options = { ...DEFAULT_OPTIONS, ...options };
	}

	/**
	 * Render a single table.
	 * @param aggregates
	 * @param spec
	 */
	renderTable(aggregates: AggregatedResult[], spec: TableRenderSpec): RenderOutput {
		// Extract and transform data
		let data = spec.extractData(aggregates);

		// Apply filter if specified
		// Note: filter is for aggregates, not extracted data
		// This is handled in extractData

		// Apply sort if specified
		if (spec.sort) {
			data = [...data].sort(spec.sort);
		}

		// Compute caption placeholders
		let caption = spec.caption;
		if (spec.captionPlaceholders) {
			for (const [placeholder, compute] of Object.entries(spec.captionPlaceholders)) {
				caption = caption.replace(`{${placeholder}}`, compute(aggregates));
			}
		}

		// Build LaTeX
		const content = this.buildTable(data, spec.columns, caption, spec.label);

		return {
			id: spec.id,
			filename: spec.filename,
			content,
			format: "latex",
		};
	}

	/**
	 * Render all tables.
	 * @param aggregates
	 * @param specs
	 */
	renderAll(aggregates: AggregatedResult[], specs: TableRenderSpec[]): RenderOutput[] {
		return specs.map((spec) => this.renderTable(aggregates, spec));
	}

	/**
	 * Render claim evaluation summary.
	 * @param evaluations
	 */
	renderClaimSummary(evaluations: ClaimEvaluation[]): RenderOutput {
		const statusSymbol = (status: ClaimStatus): string => {
			return this.options.claimStatus?.[status] ?? status;
		};

		// Build table rows
		const rows: string[] = [];
		for (const evaluation of evaluations) {
			const symbol = statusSymbol(evaluation.status);
			const delta = this.formatNumber(evaluation.evidence.delta, 3);
			const pValue =
				evaluation.evidence.pValue === undefined
					? "--"
					: this.formatNumber(evaluation.evidence.pValue, 4);

			rows.push(
				`    ${escapeLatex(evaluation.claim.claimId)} & ` +
					`${escapeLatex(evaluation.claim.description)} & ` +
					`$${symbol}$ & ${delta} & ${pValue} \\\\`,
			);
		}

		// Count summary
		const satisfied = evaluations.filter((e) => e.status === "satisfied").length;
		const violated = evaluations.filter((e) => e.status === "violated").length;
		const inconclusive = evaluations.filter((e) => e.status === "inconclusive").length;

		const caption = `Claim evaluation summary. ${satisfied} satisfied, ${violated} violated, ${inconclusive} inconclusive.`;

		const content = String.raw`\begin{table}[htbp]
  \centering
  \caption{${caption}}
  \label{tab:claim-summary}
  \begin{tabular}{llccc}
    \toprule
    Claim & Description & Status & Delta & p-value \\
    \midrule
${rows.join("\n")}
    \bottomrule
  \end{tabular}
\end{table}
`;

		return {
			id: "claim-summary",
			filename: "claim-summary.tex",
			content,
			format: "latex",
		};
	}

	/**
	 * Build a LaTeX table from data.
	 * @param data
	 * @param columns
	 * @param caption
	 * @param label
	 */
	private buildTable(
		data: Record<string, unknown>[],
		columns: ColumnSpec[],
		caption: string,
		label: string,
	): string {
		const columnSpec = columns.map((c) => c.align).join("");
		const headers = columns.map((c) => c.header).join(" & ");

		const rows = data.map((row) => {
			const cells = columns.map((col) => {
				const value = row[col.key];
				let formatted = col.format ? col.format(value) : this.formatValue(value);
				if (col.bold) {
					formatted = String.raw`\textbf{${formatted}}`;
				}
				return formatted;
			});
			return `    ${cells.join(" & ")} \\\\`;
		});

		const rules = this.options.booktabs
			? { top: String.raw`\toprule`, mid: String.raw`\midrule`, bottom: String.raw`\bottomrule` }
			: { top: String.raw`\hline`, mid: String.raw`\hline`, bottom: String.raw`\hline` };

		return String.raw`\begin{table}[htbp]
  \centering
  \caption{${caption}}
  \label{${label}}
  \begin{tabular}{${columnSpec}}
    ${rules.top}
    ${headers} \\
    ${rules.mid}
${rows.join("\n")}
    ${rules.bottom}
  \end{tabular}
\end{table}
`;
	}

	/**
	 * Format a value for LaTeX.
	 * @param value
	 */
	private formatValue(value: unknown): string {
		if (value === null || value === undefined) {
			return "--";
		}
		if (typeof value === "number") {
			return this.formatNumber(value);
		}
		if (typeof value === "string") {
			return escapeLatex(value);
		}
		return escapeLatex(JSON.stringify(value));
	}

	/**
	 * Format a number with configurable decimals.
	 * @param n
	 * @param decimals
	 */
	formatNumber(n: number, decimals?: number): string {
		if (!Number.isFinite(n)) {
			return "--";
		}
		return n.toFixed(decimals ?? this.options.defaultDecimals ?? 2);
	}

	/**
	 * Format a speedup ratio.
	 * @param ratio
	 */
	formatSpeedup(ratio: number): string {
		if (!Number.isFinite(ratio)) {
			return "--";
		}
		return String.raw`$${ratio.toFixed(2)}\times$`;
	}

	/**
	 * Format a percentage.
	 * @param n
	 */
	formatPercentage(n: number): string {
		if (!Number.isFinite(n)) {
			return "--";
		}
		return String.raw`${Math.round(n)}\%`;
	}
}

/**
 * Escape special LaTeX characters.
 * @param text
 */
export const escapeLatex = (text: string): string =>
	text
		.replaceAll("\\", String.raw`\textbackslash{}`)
		.replaceAll(/[&%$#_{}]/g, String.raw`\$&`)
		.replaceAll("~", String.raw`\textasciitilde{}`)
		.replaceAll("^", String.raw`\textasciicircum{}`);

/**
 * Create a LaTeX renderer with default options.
 * @param options
 */
export const createLatexRenderer = (options?: Partial<LaTeXRendererOptions>): LaTeXRenderer =>
	new LaTeXRenderer(options);
