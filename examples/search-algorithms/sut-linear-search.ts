/**
 * Linear Search SUT
 *
 * Sequential scan through the unsorted data array.
 * Counts each element comparison performed during the search.
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
		id: "linear-search",
		config: {},
		run: async (input: SearchInput): Promise<SearchResult> => {
			const { data, target } = input;
			const start = performance.now();

			let comparisons = 0;
			let index = -1;

			for (let i = 0; i < data.length; i++) {
				comparisons++;
				if (data[i] === target) {
					index = i;
					break;
				}
			}

			const executionTimeMs = performance.now() - start;

			return {
				found: index !== -1,
				index,
				comparisons,
				executionTimeMs,
			};
		},
	};
}
