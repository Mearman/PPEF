/**
 * Mann-Whitney U Test
 *
 * Statistical test for comparing two independent samples.
 * Tests whether two populations have the same distribution.
 *
 * H0: Both populations have the same distribution
 * H1: Populations have different distributions
 *
 * Returns p-value (smaller = more significant difference)
 */

/**
 * Standard normal cumulative distribution function.
 * Uses the Abramowitz and Stegun approximation.
 *
 * @param z - Z-score
 * @returns Cumulative probability from -infinity to z
 */
export const normalCDF = (z: number): number => {
	const sign = z < 0 ? -1 : 1;
	z = Math.abs(z) / Math.sqrt(2);
	const a1 = 0.254_829_592;
	const a2 = -0.284_496_736;
	const a3 = 1.421_413_741;
	const a4 = -1.453_152_027;
	const a5 = 1.061_405_429;
	const p = 0.327_591_1;

	const t = 1 / (1 + p * z);
	const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-z * z);
	return 0.5 * (1 + sign * y);
};

/**
 * Mann-Whitney U test for comparing two independent samples.
 *
 * Non-parametric test that does not assume normal distribution.
 * Tests whether two populations have the same distribution.
 *
 * @param sampleA - First sample array
 * @param sampleB - Second sample array
 * @returns Object containing U statistic, p-value, and significance flag
 */
export const mannWhitneyUTest = (
	sampleA: number[],
	sampleB: number[],
): {
	u: number;
	pValue: number;
	significant: boolean;
} => {
	// Rank all values combined
	const combined = [...sampleA, ...sampleB];
	const sorted = [...combined].sort((a, b) => a - b);

	// Assign ranks (handle ties)
	const ranks = new Map<number, number[]>();
	for (const [index, value] of sorted.entries()) {
		if (!ranks.has(value)) {
			ranks.set(value, []);
		}
		const positions = ranks.get(value);
		if (positions) {
			positions.push(index + 1);
		}
	}

	// Average rank for tied values
	const avgRanks = new Map<number, number>();
	for (const [value, positions] of ranks) {
		avgRanks.set(value, positions.reduce((a, b) => a + b, 0) / positions.length);
	}

	// Sum ranks for each sample
	const rankSumA = sampleA.reduce((sum, value) => sum + (avgRanks.get(value) ?? 0), 0);
	const rankSumB = sampleB.reduce((sum, value) => sum + (avgRanks.get(value) ?? 0), 0);

	// Calculate U statistics
	const n1 = sampleA.length;
	const n2 = sampleB.length;
	const u1 = rankSumA - (n1 * (n1 + 1)) / 2;
	const u2 = rankSumB - (n2 * (n2 + 1)) / 2;
	const u = Math.min(u1, u2);

	// Calculate z-score for large samples
	const meanU = (n1 * n2) / 2;
	const stdU = Math.sqrt((n1 * n2 * (n1 + n2 + 1)) / 12);
	const z = stdU > 0 ? (u - meanU) / stdU : 0;

	// Two-tailed p-value from z-score (approximation)
	const pValue = 2 * (1 - normalCDF(Math.abs(z)));

	return {
		u,
		pValue,
		significant: pValue < 0.05, // 95% confidence level
	};
};

/**
 * Calculate Cohen's d effect size.
 *
 * Measures the standardized difference between two means.
 *
 * Interpretation:
 * - 0.2: Small effect
 * - 0.5: Medium effect
 * - 0.8: Large effect
 *
 * @param sampleA - First sample array
 * @param sampleB - Second sample array
 * @returns Cohen's d effect size
 */
export const cohensD = (sampleA: number[], sampleB: number[]): number => {
	const n1 = sampleA.length;
	const n2 = sampleB.length;

	const mean1 = sampleA.reduce((a, b) => a + b, 0) / n1;
	const mean2 = sampleB.reduce((a, b) => a + b, 0) / n2;

	const variable1 = sampleA.reduce((sum, value) => sum + (value - mean1) ** 2, 0) / (n1 - 1);
	const variable2 = sampleB.reduce((sum, value) => sum + (value - mean2) ** 2, 0) / (n2 - 1);

	const pooledStd = Math.sqrt(((n1 - 1) * variable1 + (n2 - 1) * variable2) / (n1 + n2 - 2));

	return pooledStd > 0 ? Math.abs(mean1 - mean2) / pooledStd : 0;
};

/**
 * Calculate confidence interval for a mean.
 *
 * Uses t-distribution approximation (1.96 for 95% CI with large samples).
 *
 * @param values - Sample values
 * @returns Object with lower and upper bounds
 */
export const confidenceInterval = (values: number[]): { lower: number; upper: number } => {
	const n = values.length;
	const mean = values.reduce((a, b) => a + b, 0) / n;
	const std = Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (n - 1));
	const se = std / Math.sqrt(n);
	const t = 1.96; // Approximation for large samples (95% CI)

	const margin = t * se;
	return {
		lower: mean - margin,
		upper: mean + margin,
	};
};
