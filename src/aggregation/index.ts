/**
 * Aggregation Module
 *
 * Re-exports aggregation functions and pipeline.
 */

export {
	computeComparison,
	computeMaxSpeedup,
	computeRankings,
	computeSpeedup,
	computeSummaryStats,
} from "./aggregators.js";
export {
	aggregateResults,
	type AggregationPipelineOptions,
	createAggregationOutput,
} from "./pipeline.js";
