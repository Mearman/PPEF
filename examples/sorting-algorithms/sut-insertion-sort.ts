/**
 * Insertion Sort SUT
 *
 * Builds a sorted prefix by shifting elements rightward to insert
 * each new element in its correct position. Each shift counts as a swap.
 */

interface SortInput {
	data: number[];
}

interface SortResult {
	sorted: number[];
	comparisons: number;
	swaps: number;
	executionTimeMs: number;
}

export function createSut(): {
	id: string;
	config: Record<string, unknown>;
	run: (input: SortInput) => Promise<SortResult>;
} {
	return {
		id: "insertion-sort",
		config: {},
		run: async (input: SortInput): Promise<SortResult> => {
			const arr = [...input.data];
			let comparisons = 0;
			let swaps = 0;

			const start = performance.now();

			for (let i = 1; i < arr.length; i++) {
				const key = arr[i];
				let j = i - 1;

				while (j >= 0) {
					comparisons++;
					if (arr[j] > key) {
						arr[j + 1] = arr[j];
						swaps++;
						j--;
					} else {
						break;
					}
				}
				arr[j + 1] = key;
			}

			const executionTimeMs = performance.now() - start;

			return { sorted: arr, comparisons, swaps, executionTimeMs };
		},
	};
}
