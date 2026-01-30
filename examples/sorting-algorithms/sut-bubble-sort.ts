/**
 * Bubble Sort SUT
 *
 * Standard bubble sort with adjacent element swaps.
 * Optimized with early exit when no swaps occur in a pass.
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
		id: "bubble-sort",
		config: {},
		run: async (input: SortInput): Promise<SortResult> => {
			const arr = [...input.data];
			let comparisons = 0;
			let swaps = 0;

			const start = performance.now();

			const n = arr.length;
			for (let i = 0; i < n - 1; i++) {
				let swapped = false;
				for (let j = 0; j < n - 1 - i; j++) {
					comparisons++;
					if (arr[j] > arr[j + 1]) {
						const tmp = arr[j];
						arr[j] = arr[j + 1];
						arr[j + 1] = tmp;
						swaps++;
						swapped = true;
					}
				}
				if (!swapped) {
					break;
				}
			}

			const executionTimeMs = performance.now() - start;

			return { sorted: arr, comparisons, swaps, executionTimeMs };
		},
	};
}
