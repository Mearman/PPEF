/**
 * Example Metrics Extractor Module
 *
 * This file demonstrates how to structure a metrics extractor for the PPEF CLI.
 *
 * Export a function that takes an algorithm result and returns numeric metrics.
 */

/**
 * Extract metrics from algorithm result.
 *
 * @param {Object} result - Result object returned by SUT.run()
 * @returns {Object} Record of metric names to numeric values
 */
export function extractMetrics(result) {
	const metrics = {
		// Extract numeric metrics from your result
		nodeCount: result.expandedNodes?.length ?? 0,
		pathCount: result.pathsFound ?? 0,
		// Add any other metrics your evaluation needs
	};

	return metrics;
}
