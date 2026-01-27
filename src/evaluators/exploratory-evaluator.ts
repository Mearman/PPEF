/**
 * Exploratory Evaluator
 *
 * Hypothesis-free analysis for discovering patterns in evaluation data.
 * Unlike ClaimsEvaluator which tests predefined hypotheses, this evaluator
 * performs exploratory analysis including:
 * - Ranking all SUTs by any metric (not just primary vs baseline)
 * - Finding significant pairwise differences (N-way comparisons)
 * - Discovering case-class effects
 * - Computing metric correlations
 */

import type { AggregatedResult } from "../types/aggregate.js";
import type {
	CaseClassEffect,
	EvaluationContext,
	EvaluationOutput,
	EvaluationSummary,
	Evaluator,
	ExploratoryEvaluatorConfig,
	ExploratoryEvaluatorData,
	ExploratoryEvaluationSummary,
	IEvaluator,
	MetricCorrelation,
	MetricDirection,
	PairwiseComparison,
	SutMetricRanking,
	ValidationResult,
} from "../types/evaluator.js";

/**
 * Exploratory evaluator - hypothesis-free comparative analysis.
 */
export class ExploratoryEvaluator
	implements
		Evaluator<ExploratoryEvaluatorConfig, EvaluationContext, ExploratoryEvaluatorData>,
		IEvaluator
{
	/** Type identifier */
	readonly type = "exploratory" as const;

	/** Schema version */
	private static readonly VERSION = "1.0.0";

	/** Default significance level */
	private static readonly DEFAULT_SIGNIFICANCE = 0.05;

	/**
	 * Validate exploratory evaluator configuration.
	 *
	 * @param config - Configuration to validate
	 * @returns Validation result
	 */
	validateConfig(config: ExploratoryEvaluatorConfig): ValidationResult {
		const errors: string[] = [];
		const warnings: string[] = [];

		// Validate significance level if provided
		if (config.significanceLevel !== undefined) {
			if (config.significanceLevel <= 0 || config.significanceLevel >= 1) {
				errors.push("significanceLevel must be between 0 and 1 (exclusive)");
			}
		}

		// Validate min effect size if provided
		if (config.minEffectSize !== undefined && config.minEffectSize < 0) {
			errors.push("minEffectSize must be non-negative");
		}

		// Validate metric directions
		if (config.metricDirections) {
			for (const [metric, direction] of Object.entries(config.metricDirections)) {
				const validDirections = ["higher-better", "lower-better"] as const;
				if (!validDirections.includes(direction as (typeof validDirections)[number])) {
					errors.push(
						`Invalid direction for metric "${metric}": must be "higher-better" or "lower-better"`,
					);
				}
			}
		}

		// Warning if no metrics or SUTs specified
		if (!config.metrics || config.metrics.length === 0) {
			warnings.push("No metrics specified - will analyze all available metrics");
		}
		if (!config.suts || config.suts.length === 0) {
			warnings.push("No SUTs specified - will analyze all available SUTs");
		}

		return {
			valid: errors.length === 0,
			errors: errors.length > 0 ? errors : undefined,
			warnings: warnings.length > 0 ? warnings : undefined,
		};
	}

	/**
	 * Perform exploratory evaluation.
	 *
	 * @param config - Exploratory evaluator configuration
	 * @param input - Evaluation context with aggregates
	 * @returns Evaluation output
	 */
	evaluate(
		config: ExploratoryEvaluatorConfig,
		input: EvaluationContext,
	): EvaluationOutput<ExploratoryEvaluatorData> {
		const { aggregates } = input;
		const significanceLevel = config.significanceLevel ?? ExploratoryEvaluator.DEFAULT_SIGNIFICANCE;

		// Determine which SUTs and metrics to analyze
		const sutsToAnalyze = this.determineSuts(aggregates, config.suts);
		const metricsToAnalyze = this.determineMetrics(aggregates, config.metrics);

		// Filter aggregates to only include specified SUTs
		const filteredAggregates = aggregates.filter((agg) => sutsToAnalyze.includes(agg.sut));

		// Compute rankings for each metric
		const rankings: Record<string, SutMetricRanking[]> = {};
		for (const metric of metricsToAnalyze) {
			rankings[metric] = this.computeRankings(
				filteredAggregates,
				metric,
				config.metricDirections?.[metric] ?? "higher-better",
			);
		}

		// Compute all pairwise comparisons
		const pairwiseComparisons = this.computePairwiseComparisons(
			filteredAggregates,
			sutsToAnalyze,
			metricsToAnalyze,
			significanceLevel,
			config.minEffectSize,
		);

		// Analyze case-class effects if requested
		let caseClassEffects: CaseClassEffect[] | undefined;
		if (config.analyzeCaseClassEffects !== false) {
			caseClassEffects = this.analyzeCaseClassEffects(
				filteredAggregates,
				metricsToAnalyze,
				significanceLevel,
			);
		}

		// Compute metric correlations if requested
		let metricCorrelations: MetricCorrelation[] | undefined;
		if (config.computeCorrelations !== false && metricsToAnalyze.length >= 2) {
			metricCorrelations = this.computeMetricCorrelations(filteredAggregates, metricsToAnalyze);
		}

		// Determine best SUT per metric
		const bestSutPerMetric: Record<string, string> = {};
		for (const [metric, ranking] of Object.entries(rankings)) {
			if (ranking.length > 0) {
				bestSutPerMetric[metric] = ranking[0].sut;
			}
		}

		// Count unique case classes
		const caseClasses = new Set(filteredAggregates.map((agg) => agg.caseClass));

		const summary: ExploratoryEvaluationSummary = {
			version: ExploratoryEvaluator.VERSION,
			timestamp: new Date().toISOString(),
			rankings,
			pairwiseComparisons,
			caseClassEffects,
			metricCorrelations,
			summary: {
				sutsAnalyzed: sutsToAnalyze.length,
				metricsAnalyzed: metricsToAnalyze.length,
				pairwiseComparisonsCount: pairwiseComparisons.length,
				significantDifferences: pairwiseComparisons.filter((c) => c.significant).length,
				caseClassesAnalyzed: caseClasses.size,
				bestSutPerMetric,
			},
		};

		return {
			type: "exploratory",
			version: ExploratoryEvaluator.VERSION,
			timestamp: new Date().toISOString(),
			data: summary,
			metadata: {
				inputSource: input.metadata?.source,
				config,
			},
		};
	}

	/**
	 * Summarize evaluation output.
	 *
	 * @param output - Evaluation output to summarize
	 * @returns Summary statistics
	 */
	summarize(output: EvaluationOutput<ExploratoryEvaluatorData>): EvaluationSummary {
		const { summary } = output.data;

		return {
			total: summary.pairwiseComparisonsCount,
			passed: summary.significantDifferences,
			additional: {
				sutsAnalyzed: summary.sutsAnalyzed,
				metricsAnalyzed: summary.metricsAnalyzed,
				significantDifferences: summary.significantDifferences,
			},
		};
	}

	/**
	 * Determine which SUTs to analyze.
	 * @param aggregates
	 * @param configSuts
	 */
	private determineSuts(aggregates: AggregatedResult[], configSuts?: string[]): string[] {
		if (configSuts && configSuts.length > 0) {
			return configSuts;
		}
		// Extract unique SUTs from aggregates
		return [...new Set(aggregates.map((agg) => agg.sut))];
	}

	/**
	 * Determine which metrics to analyze.
	 * @param aggregates
	 * @param configMetrics
	 */
	private determineMetrics(aggregates: AggregatedResult[], configMetrics?: string[]): string[] {
		if (configMetrics && configMetrics.length > 0) {
			return configMetrics;
		}
		// Extract unique metrics from aggregates
		const metrics = new Set<string>();
		for (const agg of aggregates) {
			for (const metric of Object.keys(agg.metrics)) {
				metrics.add(metric);
			}
		}
		return [...metrics];
	}

	/**
	 * Compute rankings for a single metric.
	 * @param aggregates
	 * @param metric
	 * @param direction
	 */
	private computeRankings(
		aggregates: AggregatedResult[],
		metric: string,
		direction: MetricDirection,
	): SutMetricRanking[] {
		// Group aggregates by SUT and compute mean/median across case classes
		const sutStats = new Map<
			string,
			{
				values: number[];
				sum: number;
				count: number;
			}
		>();

		for (const agg of aggregates) {
			if (!Object.hasOwn(agg.metrics, metric)) continue;
			const metricStats = agg.metrics[metric];

			let existing = sutStats.get(agg.sut);
			if (!existing) {
				existing = { values: [], sum: 0, count: 0 };
				sutStats.set(agg.sut, existing);
			}

			existing.values.push(metricStats.mean);
			existing.sum += metricStats.mean;
			existing.count++;
		}

		// Compute rankings
		const rankings: SutMetricRanking[] = [];
		for (const [sut, stats] of sutStats) {
			const mean = stats.sum / stats.count;
			const sortedValues = [...stats.values].sort((a, b) => a - b);
			const median =
				sortedValues.length % 2 === 0
					? (sortedValues[sortedValues.length / 2 - 1] + sortedValues[sortedValues.length / 2]) / 2
					: sortedValues[Math.floor(sortedValues.length / 2)];

			// Compute standard deviation
			const squaredDiffs = stats.values.map((v) => (v - mean) ** 2);
			const variance = squaredDiffs.reduce((a, b) => a + b, 0) / stats.count;
			const std = Math.sqrt(variance);

			rankings.push({
				sut,
				mean,
				median,
				std: std > 0 ? std : undefined,
				rank: 0, // Will be set after sorting
				n: stats.count,
			});
		}

		// Sort by mean (direction determines order)
		rankings.sort((a, b) => {
			if (direction === "higher-better") {
				return b.mean - a.mean; // Higher first
			}
			return a.mean - b.mean; // Lower first
		});

		// Assign ranks (1-indexed)
		for (let index = 0; index < rankings.length; index++) {
			rankings[index].rank = index + 1;
		}

		return rankings;
	}

	/**
	 * Compute all pairwise comparisons.
	 * @param aggregates
	 * @param suts
	 * @param metrics
	 * @param significanceLevel
	 * @param minEffectSize
	 */
	private computePairwiseComparisons(
		aggregates: AggregatedResult[],
		suts: string[],
		metrics: string[],
		significanceLevel: number,
		minEffectSize?: number,
	): PairwiseComparison[] {
		const comparisons: PairwiseComparison[] = [];

		// For each metric, compare all pairs of SUTs
		for (const metric of metrics) {
			for (let index = 0; index < suts.length; index++) {
				for (let index_ = index + 1; index_ < suts.length; index_++) {
					const sutA = suts[index];
					const sutB = suts[index_];

					const comparison = this.compareSutPair(
						aggregates,
						sutA,
						sutB,
						metric,
						significanceLevel,
						minEffectSize,
					);

					if (comparison) {
						comparisons.push(comparison);
					}
				}
			}
		}

		return comparisons;
	}

	/**
	 * Compare a single pair of SUTs for a metric.
	 * @param aggregates
	 * @param sutA
	 * @param sutB
	 * @param metric
	 * @param significanceLevel
	 * @param minEffectSize
	 */
	private compareSutPair(
		aggregates: AggregatedResult[],
		sutA: string,
		sutB: string,
		metric: string,
		significanceLevel: number,
		minEffectSize?: number,
	): PairwiseComparison | null {
		// Get values for each SUT
		const valuesA: number[] = [];
		const valuesB: number[] = [];

		for (const agg of aggregates) {
			if (!Object.hasOwn(agg.metrics, metric)) continue;
			const metricStats = agg.metrics[metric];

			if (agg.sut === sutA) {
				valuesA.push(metricStats.mean);
			} else if (agg.sut === sutB) {
				valuesB.push(metricStats.mean);
			}
		}

		if (valuesA.length === 0 || valuesB.length === 0) {
			return null;
		}

		// Compute basic statistics
		const meanA = valuesA.reduce((a, b) => a + b, 0) / valuesA.length;
		const meanB = valuesB.reduce((a, b) => a + b, 0) / valuesB.length;
		const delta = meanA - meanB;
		const ratio = meanB !== 0 ? meanA / meanB : Infinity;

		// Use existing comparison data if available
		let pValue: number | undefined;
		let effectSize: number | undefined;

		// Look for pre-computed comparison in aggregates
		const aggA = aggregates.find((agg) => agg.sut === sutA);
		if (aggA?.comparisons?.[sutB]) {
			const comparison = aggA.comparisons[sutB];
			pValue = comparison.pValue;
			effectSize = comparison.effectSize;
		}

		// If no pre-computed values, estimate significance
		if (pValue === undefined && valuesA.length >= 3 && valuesB.length >= 3) {
			// Compute pooled standard deviation for effect size
			const varA = this.variance(valuesA);
			const varB = this.variance(valuesB);
			const pooledStd = Math.sqrt(
				((valuesA.length - 1) * varA + (valuesB.length - 1) * varB) /
					(valuesA.length + valuesB.length - 2),
			);

			if (pooledStd > 0) {
				effectSize = delta / pooledStd;

				// Simple two-sample t-test approximation
				const se = pooledStd * Math.sqrt(1 / valuesA.length + 1 / valuesB.length);
				const t = delta / se;
				const df = valuesA.length + valuesB.length - 2;

				// Approximate p-value using normal distribution for large df
				pValue = df >= 30 ? 2 * (1 - this.normalCdf(Math.abs(t))) : undefined;
			}
		}

		// Determine significance
		const significant =
			pValue !== undefined &&
			pValue < significanceLevel &&
			(minEffectSize === undefined ||
				(effectSize !== undefined && Math.abs(effectSize) >= minEffectSize));

		return {
			sutA,
			sutB,
			metric,
			delta,
			ratio,
			pValue,
			effectSize,
			significant,
		};
	}

	/**
	 * Analyze case-class effects on SUT performance.
	 * @param aggregates
	 * @param metrics
	 * @param significanceLevel
	 */
	private analyzeCaseClassEffects(
		aggregates: AggregatedResult[],
		metrics: string[],
		significanceLevel: number,
	): CaseClassEffect[] {
		const effects: CaseClassEffect[] = [];

		// Get unique SUTs and case classes
		const suts = [...new Set(aggregates.map((agg) => agg.sut))];
		const caseClasses = [...new Set(aggregates.map((agg) => agg.caseClass))];

		// Skip if insufficient data
		if (caseClasses.length < 2) {
			return effects;
		}

		for (const metric of metrics) {
			for (const sut of suts) {
				// Get all values for this SUT across case classes
				const sutAggregates = aggregates.filter((agg) => agg.sut === sut && metric in agg.metrics);

				if (sutAggregates.length === 0) continue;

				// Compute overall mean for this SUT
				const allValues = sutAggregates.map((agg) => agg.metrics[metric].mean);
				const overallMean = allValues.reduce((a, b) => a + b, 0) / allValues.length;
				const overallStd = Math.sqrt(this.variance(allValues));

				// Compute effect for each case class
				for (const caseClass of caseClasses) {
					const caseAggregates = sutAggregates.filter((agg) => agg.caseClass === caseClass);

					if (caseAggregates.length === 0) continue;

					const caseValues = caseAggregates.map((agg) => agg.metrics[metric].mean);
					const caseMean = caseValues.reduce((a, b) => a + b, 0) / caseValues.length;
					const deviation = caseMean - overallMean;
					const percentageDeviation = overallMean !== 0 ? (deviation / overallMean) * 100 : 0;

					// Determine significance using z-score if we have enough data
					let significant = false;
					if (overallStd > 0 && caseValues.length >= 2) {
						const zScore = Math.abs(deviation) / (overallStd / Math.sqrt(caseValues.length));
						const pValue = 2 * (1 - this.normalCdf(zScore));
						significant = pValue < significanceLevel;
					}

					effects.push({
						caseClass: String(caseClass),
						sut,
						metric,
						deviationFromMean: deviation,
						percentageDeviation,
						significant,
					});
				}
			}
		}

		return effects;
	}

	/**
	 * Compute correlations between metrics.
	 * @param aggregates
	 * @param metrics
	 */
	private computeMetricCorrelations(
		aggregates: AggregatedResult[],
		metrics: string[],
	): MetricCorrelation[] {
		const correlations: MetricCorrelation[] = [];

		for (let index = 0; index < metrics.length; index++) {
			for (let index_ = index + 1; index_ < metrics.length; index_++) {
				const metricA = metrics[index];
				const metricB = metrics[index_];

				const correlation = this.computeCorrelation(aggregates, metricA, metricB);
				if (correlation) {
					correlations.push(correlation);
				}
			}
		}

		return correlations;
	}

	/**
	 * Compute Pearson and Spearman correlation between two metrics.
	 * @param aggregates
	 * @param metricA
	 * @param metricB
	 */
	private computeCorrelation(
		aggregates: AggregatedResult[],
		metricA: string,
		metricB: string,
	): MetricCorrelation | null {
		// Extract paired values
		const pairs: [number, number][] = [];

		for (const agg of aggregates) {
			if (!Object.hasOwn(agg.metrics, metricA) || !Object.hasOwn(agg.metrics, metricB)) {
				continue;
			}
			const statsA = agg.metrics[metricA];
			const statsB = agg.metrics[metricB];

			pairs.push([statsA.mean, statsB.mean]);
		}

		if (pairs.length < 3) {
			return null;
		}

		const xValues = pairs.map(([x]) => x);
		const yValues = pairs.map(([, y]) => y);

		// Pearson correlation
		const pearsonR = this.pearsonCorrelation(xValues, yValues);

		// Spearman rank correlation
		const spearmanRho = this.spearmanCorrelation(xValues, yValues);

		// Interpret correlation strength
		const interpretation = this.interpretCorrelation(pearsonR);

		return {
			metricA,
			metricB,
			pearsonR,
			spearmanRho,
			interpretation,
		};
	}

	/**
	 * Compute Pearson correlation coefficient.
	 * @param x
	 * @param y
	 */
	private pearsonCorrelation(x: number[], y: number[]): number {
		const n = x.length;
		const meanX = x.reduce((a, b) => a + b, 0) / n;
		const meanY = y.reduce((a, b) => a + b, 0) / n;

		let numerator = 0;
		let sumSqX = 0;
		let sumSqY = 0;

		for (let index = 0; index < n; index++) {
			const dx = x[index] - meanX;
			const dy = y[index] - meanY;
			numerator += dx * dy;
			sumSqX += dx * dx;
			sumSqY += dy * dy;
		}

		const denominator = Math.sqrt(sumSqX * sumSqY);
		return denominator === 0 ? 0 : numerator / denominator;
	}

	/**
	 * Compute Spearman rank correlation coefficient.
	 * @param x
	 * @param y
	 */
	private spearmanCorrelation(x: number[], y: number[]): number {
		const rankX = this.computeRanks(x);
		const rankY = this.computeRanks(y);
		return this.pearsonCorrelation(rankX, rankY);
	}

	/**
	 * Compute ranks for an array of values (handling ties).
	 * @param values
	 */
	private computeRanks(values: number[]): number[] {
		const indexed = values.map((v, index) => ({ value: v, index }));
		indexed.sort((a, b) => a.value - b.value);

		const ranks = new Array<number>(values.length);
		let index = 0;

		while (index < indexed.length) {
			let index_ = index;
			// Find all values equal to this one (for tie handling)
			while (index_ < indexed.length && indexed[index_].value === indexed[index].value) {
				index_++;
			}

			// Average rank for tied values
			const avgRank = (index + index_ + 1) / 2;
			for (let k = index; k < index_; k++) {
				ranks[indexed[k].index] = avgRank;
			}

			index = index_;
		}

		return ranks;
	}

	/**
	 * Interpret correlation coefficient.
	 * @param r
	 */
	private interpretCorrelation(r: number): string {
		const absR = Math.abs(r);
		if (absR >= 0.9) return "very strong";
		if (absR >= 0.7) return "strong";
		if (absR >= 0.5) return "moderate";
		if (absR >= 0.3) return "weak";
		return "negligible";
	}

	/**
	 * Compute variance of an array.
	 * @param values
	 */
	private variance(values: number[]): number {
		if (values.length === 0) return 0;
		const mean = values.reduce((a, b) => a + b, 0) / values.length;
		return values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
	}

	/**
	 * Standard normal CDF approximation.
	 * @param z
	 */
	private normalCdf(z: number): number {
		// Abramowitz and Stegun approximation
		const a1 = 0.254829592;
		const a2 = -0.284496736;
		const a3 = 1.421413741;
		const a4 = -1.453152027;
		const a5 = 1.061405429;
		const p = 0.3275911;

		const sign = z < 0 ? -1 : 1;
		z = Math.abs(z) / Math.SQRT2;

		const t = 1.0 / (1.0 + p * z);
		const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-z * z);

		return 0.5 * (1.0 + sign * y);
	}
}
