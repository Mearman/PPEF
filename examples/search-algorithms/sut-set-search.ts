/**
 * Set Search SUT
 *
 * Builds a Set from the data array then performs a single .has()
 * lookup. Set construction time is included in the execution time.
 * The index is resolved separately after timing via indexOf.
 */

interface SearchInput {
	data: number[];
	sortedData: number[];
	target: number;
}

interface SearchResult {
	found: boolean;
	index: number;
	comparisons: number;
	executionTimeMs: number;
}

export function createSut() {
	return {
		id: "set-search",
		config: {},
		run: (input: SearchInput): Promise<SearchResult> => {
			const { data, target } = input;
			const start = performance.now();

			const set = new Set<number>(data);
			const found = set.has(target);

			const executionTimeMs = performance.now() - start;

			const index = found ? data.indexOf(target) : -1;

			return Promise.resolve({
				found,
				index,
				comparisons: 1,
				executionTimeMs,
			});
		},
	};
}
