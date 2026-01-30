/**
 * Map Search SUT
 *
 * Builds a Map from the data array (value to index) then performs
 * a single .get() lookup. Map construction time is included in
 * the execution time to reflect realistic single-lookup cost.
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
		id: "map-search",
		config: {},
		run: (input: SearchInput): Promise<SearchResult> => {
			const { data, target } = input;
			const start = performance.now();

			const map = new Map<number, number>();
			for (let i = 0; i < data.length; i++) {
				map.set(data[i], i);
			}

			const result = map.get(target);
			const found = result !== undefined;
			const index = found ? result : -1;

			const executionTimeMs = performance.now() - start;

			return Promise.resolve({
				found,
				index,
				comparisons: 1,
				executionTimeMs,
			});
		},
	};
}
