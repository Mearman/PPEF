/**
 * Binary Search SUT
 *
 * Iterative binary search on the pre-sorted data array.
 * Counts each mid-point comparison performed during the search.
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
		id: "binary-search",
		config: {},
		run: (input: SearchInput): Promise<SearchResult> => {
			const { sortedData, target } = input;
			const start = performance.now();

			let comparisons = 0;
			let index = -1;
			let low = 0;
			let high = sortedData.length - 1;

			while (low <= high) {
				const mid = Math.floor((low + high) / 2);
				comparisons++;

				if (sortedData[mid] === target) {
					index = mid;
					break;
				} else if (sortedData[mid] < target) {
					low = mid + 1;
				} else {
					high = mid - 1;
				}
			}

			const executionTimeMs = performance.now() - start;

			return Promise.resolve({
				found: index !== -1,
				index,
				comparisons,
				executionTimeMs,
			});
		},
	};
}
