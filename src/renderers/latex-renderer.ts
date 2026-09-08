/**
 * LaTeX Renderer
 *
 * Pure transformation from aggregated results to LaTeX tables.
 * NO aggregation logic allowed here - only formatting and rendering.
 */

import type { AggregatedResult } from "../types/aggregate.js";
import type { ClaimEvaluation, ClaimStatus } from "../types/claims.js";
import type {
	EvaluationOutput,
	EvaluationType,
	ClaimsEvaluatorData,
	RobustnessEvaluatorData,
	MetricsEvaluatorData,
	ExploratoryEvaluatorData,
} from "../types/evaluator.js";
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
	 * Render evaluation output (generic for all evaluation types).
	 * Dispatches to type-specific rendering methods.
	 *
	 * @param evaluation - Evaluation output from any evaluator
	 * @returns Rendered output
	 */
	renderEvaluation<T>(evaluation: EvaluationOutput<T>): RenderOutput {
		const output: EvaluationOutput<unknown> = evaluation;

		if (isEvaluationOutputOf<ClaimsEvaluatorData>(output, "claims")) {
			return this.renderClaimsEvaluation(output);
		}
		if (isEvaluationOutputOf<RobustnessEvaluatorData>(output, "robustness")) {
			return this.renderRobustnessEvaluation(output);
		}
		if (isEvaluationOutputOf<MetricsEvaluatorData>(output, "metrics")) {
			return this.renderMetricsEvaluation(output);
		}
		if (isEvaluationOutputOf<ExploratoryEvaluatorData>(output, "exploratory")) {
			return this.renderExploratoryEvaluation(output);
		}
		return this.renderCustomEvaluation(evaluation);
	}

	/**
	 * Render claims evaluation output.
	 *
	 * @param evaluation - Claims evaluation output
	 * @returns Rendered output
	 */
	private renderClaimsEvaluation(evaluation: EvaluationOutput<ClaimsEvaluatorData>): RenderOutput {
		// Extract claim evaluations from the summary
		const { evaluations } = evaluation.data;
		return this.renderClaimSummary(evaluations);
	}

	/**
	 * Render robustness evaluation output.
	 *
	 * @param evaluation - Robustness evaluation output
	 * @returns Rendered output
	 */
	private renderRobustnessEvaluation(
		evaluation: EvaluationOutput<RobustnessEvaluatorData>,
	): RenderOutput {
		const { results, config } = evaluation.data;

		// Build table rows
		const rows: string[] = [];
		for (const result of results) {
			const variance = this.formatNumber(result.robustness.varianceUnderPerturbation, 4);
			const cv = this.formatNumber(result.robustness.coefficientOfVariation, 3);
			const std = this.formatNumber(result.robustness.stdUnderPerturbation, 4);
			const baseline = this.formatNumber(result.baselineValue, 3);

			rows.push(
				`    ${escapeLatex(result.sut)} & ` +
					`${escapeLatex(result.perturbation)} & ` +
					`${escapeLatex(result.metric)} & ` +
					`${baseline} & ${std} & ${variance} & ${cv} \\\\`,
			);
		}

		// Count summary
		const suts = new Set(results.map((r) => r.sut)).size;
		const caption = `Robustness analysis. ${suts} SUT(s) analyzed for ${config.metrics.length} metric(s) under ${config.perturbations.length} perturbation(s).`;

		const content = String.raw`\begin{table}[htbp]
  \centering
  \caption{${caption}}
  \label{tab:robustness-summary}
  \begin{tabular}{lllrrrr}
    \toprule
    SUT & Perturbation & Metric & Baseline & Std & Variance & CV \\
    \midrule
${rows.join("\n")}
    \bottomrule
  \end{tabular}
\end{table}
`;

		return {
			id: "robustness-summary",
			filename: "robustness-summary.tex",
			content,
			format: "latex",
		};
	}

	/**
	 * Render metrics evaluation output.
	 *
	 * @param evaluation - Metrics evaluation output
	 * @returns Rendered output
	 */
	private renderMetricsEvaluation(
		evaluation: EvaluationOutput<MetricsEvaluatorData>,
	): RenderOutput {
		const { results, summary } = evaluation.data;

		// Build table rows
		const rows: string[] = [];
		for (const result of results) {
			const criterionId = escapeLatex(result.criterion.criterionId);
			const type = escapeLatex(result.criterion.type);
			const status =
				result.status === "pass"
					? String.raw`\checkmark`
					: result.status === "fail"
						? String.raw`\times`
						: "?";

			// Format expected value based on type
			let expected = "--";
			switch (result.expected.type) {
				case "threshold":
					expected = this.formatNumber(result.expected.threshold ?? 0);
					break;
				case "baseline":
					expected = this.formatNumber(result.expected.baselineValue ?? 0);
					break;
				case "target-range": {
					const min = result.expected.targetRange?.min;
					const max = result.expected.targetRange?.max;
					expected = `[${min !== undefined ? this.formatNumber(min) : "-∞"}, ${max !== undefined ? this.formatNumber(max) : "∞"}]`;
					break;
				}
			}

			// Format observed values
			const observedList = result.observed
				.map((obs) => `${escapeLatex(obs.sut)}=${this.formatNumber(obs.value)}`)
				.join(", ");

			rows.push(`    ${criterionId} & ${type} & $${status}$ & ${expected} & ${observedList} \\\\`);
		}

		// Summary
		const caption = `Metrics evaluation summary. ${summary.passed}/${summary.total} criteria passed (${this.formatPercentage(summary.passRate)}).`;

		const content = String.raw`\begin{table}[htbp]
  \centering
  \caption{${caption}}
  \label{tab:metrics-summary}
  \begin{tabular}{lllll}
    \toprule
    Criterion & Type & Status & Expected & Observed \\
    \midrule
${rows.join("\n")}
    \bottomrule
  \end{tabular}
\end{table}
`;

		return {
			id: "metrics-summary",
			filename: "metrics-summary.tex",
			content,
			format: "latex",
		};
	}

	/**
	 * Render exploratory evaluation output.
	 *
	 * @param evaluation - Exploratory evaluation output
	 * @returns Rendered output
	 */
	private renderExploratoryEvaluation(
		evaluation: EvaluationOutput<ExploratoryEvaluatorData>,
	): RenderOutput {
		const { rankings, pairwiseComparisons, caseClassEffects, metricCorrelations } = evaluation.data;

		const sections: string[] = [];

		// Section 1: SUT Rankings per Metric
		sections.push(this.renderSutRankings(rankings));

		// Section 2: Significant Pairwise Comparisons
		const significantComparisons = pairwiseComparisons.filter((c) => c.significant);
		if (significantComparisons.length > 0) {
			sections.push(this.renderPairwiseComparisons(significantComparisons));
		}

		// Section 3: Case-Class Effects
		if (caseClassEffects && caseClassEffects.length > 0) {
			const significantEffects = caseClassEffects.filter((e) => e.significant);
			if (significantEffects.length > 0) {
				sections.push(this.renderCaseClassEffects(significantEffects));
			}
		}

		// Section 4: Metric Correlations
		if (metricCorrelations && metricCorrelations.length > 0) {
			sections.push(this.renderMetricCorrelations(metricCorrelations));
		}

		// Combine all sections
		const content = sections.join("\n\n");

		return {
			id: "exploratory-analysis",
			filename: "exploratory-analysis.tex",
			content,
			format: "latex",
		};
	}

	/**
	 * Render SUT rankings table.
	 */
	private renderSutRankings(
		rankings: Record<
			string,
			{
				sut: string;
				mean: number;
				median: number;
				std?: number;
				rank: number;
				n: number;
			}[]
		>,
	): string {
		const tables: string[] = [];

		for (const [metric, sutRankings] of Object.entries(rankings)) {
			if (sutRankings.length === 0) continue;

			const rows: string[] = [];
			for (const ranking of sutRankings) {
				const mean = this.formatNumber(ranking.mean, 3);
				const median = this.formatNumber(ranking.median, 3);
				const std = ranking.std !== undefined ? this.formatNumber(ranking.std, 3) : "--";

				rows.push(
					`    ${ranking.rank} & ${escapeLatex(ranking.sut)} & ${mean} & ${median} & ${std} & ${ranking.n} \\\\`,
				);
			}

			const caption = `SUT rankings for metric: ${escapeLatex(metric)}`;

			tables.push(String.raw`\begin{table}[htbp]
  \centering
  \caption{${caption}}
  \label{tab:ranking-${metric.replace(/[^a-z0-9]/gi, "-")}}
  \begin{tabular}{rlrrrr}
    \toprule
    Rank & SUT & Mean & Median & Std & N \\
    \midrule
${rows.join("\n")}
    \bottomrule
  \end{tabular}
\end{table}`);
		}

		return tables.join("\n\n");
	}

	/**
	 * Render pairwise comparisons table.
	 */
	private renderPairwiseComparisons(
		comparisons: {
			sutA: string;
			sutB: string;
			metric: string;
			delta: number;
			pValue?: number;
			effectSize?: number;
		}[],
	): string {
		const rows: string[] = [];

		for (const comp of comparisons) {
			const delta = this.formatNumber(comp.delta, 3);
			const pValue = comp.pValue !== undefined ? this.formatNumber(comp.pValue, 4) : "--";
			const effectSize =
				comp.effectSize !== undefined ? this.formatNumber(comp.effectSize, 3) : "--";

			rows.push(
				`    ${escapeLatex(comp.sutA)} & ${escapeLatex(comp.sutB)} & ${escapeLatex(comp.metric)} & ${delta} & ${pValue} & ${effectSize} \\\\`,
			);
		}

		const caption = `Significant pairwise differences (${comparisons.length} found)`;

		return String.raw`\begin{table}[htbp]
  \centering
  \caption{${caption}}
  \label{tab:pairwise-comparisons}
  \begin{tabular}{llllll}
    \toprule
    SUT A & SUT B & Metric & Delta & p-value & Effect Size \\
    \midrule
${rows.join("\n")}
    \bottomrule
  \end{tabular}
\end{table}`;
	}

	/**
	 * Render case-class effects table.
	 */
	private renderCaseClassEffects(
		effects: {
			caseClass: string;
			sut: string;
			metric: string;
			deviationFromMean: number;
			percentageDeviation?: number;
		}[],
	): string {
		const rows: string[] = [];

		for (const effect of effects) {
			const deviation = this.formatNumber(effect.deviationFromMean, 3);
			const percentage =
				effect.percentageDeviation !== undefined
					? this.formatNumber(effect.percentageDeviation, 1)
					: "--";

			rows.push(
				`    ${escapeLatex(effect.caseClass)} & ${escapeLatex(effect.sut)} & ${escapeLatex(effect.metric)} & ${deviation} & ${percentage}\\% \\\\`,
			);
		}

		const caption = `Significant case-class effects (${effects.length} found)`;

		return String.raw`\begin{table}[htbp]
  \centering
  \caption{${caption}}
  \label{tab:case-class-effects}
  \begin{tabular}{lllrr}
    \toprule
    Case Class & SUT & Metric & Deviation & \% Deviation \\
    \midrule
${rows.join("\n")}
    \bottomrule
  \end{tabular}
\end{table}`;
	}

	/**
	 * Render metric correlations table.
	 */
	private renderMetricCorrelations(
		correlations: {
			metricA: string;
			metricB: string;
			pearsonR: number;
			spearmanRho?: number;
			interpretation: string;
		}[],
	): string {
		const rows: string[] = [];

		for (const corr of correlations) {
			const pearson = this.formatNumber(corr.pearsonR, 3);
			const spearman =
				corr.spearmanRho !== undefined ? this.formatNumber(corr.spearmanRho, 3) : "--";

			rows.push(
				`    ${escapeLatex(corr.metricA)} & ${escapeLatex(corr.metricB)} & ${pearson} & ${spearman} & ${escapeLatex(corr.interpretation)} \\\\`,
			);
		}

		const caption = `Metric correlations`;

		return String.raw`\begin{table}[htbp]
  \centering
  \caption{${caption}}
  \label{tab:metric-correlations}
  \begin{tabular}{lllll}
    \toprule
    Metric A & Metric B & Pearson r & Spearman $\rho$ & Interpretation \\
    \midrule
${rows.join("\n")}
    \bottomrule
  \end{tabular}
\end{table}`;
	}

	/**
	 * Render custom evaluation output (generic fallback).
	 *
	 * @param evaluation - Custom evaluation output
	 * @returns Rendered output
	 */
	private renderCustomEvaluation<T>(evaluation: EvaluationOutput<T>): RenderOutput {
		// Generic rendering for custom evaluators - output as verbatim JSON
		const content = String.raw`\begin{verbatim}
${JSON.stringify(evaluation, null, 2)}
\end{verbatim}
`;

		return {
			id: `custom-${evaluation.type}`,
			filename: `custom-${evaluation.type}.tex`,
			content,
			format: "latex",
		};
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
			? {
					top: String.raw`\toprule`,
					mid: String.raw`\midrule`,
					bottom: String.raw`\bottomrule`,
				}
			: {
					top: String.raw`\hline`,
					mid: String.raw`\hline`,
					bottom: String.raw`\hline`,
				};

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
 * Type guard to narrow an EvaluationOutput to a specific data type.
 * Validates the type discriminant matches the expected evaluation type.
 */
function isEvaluationOutputOf<TData>(
	output: EvaluationOutput<unknown>,
	expectedType: EvaluationType,
): output is EvaluationOutput<TData> {
	return output.type === expectedType;
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
