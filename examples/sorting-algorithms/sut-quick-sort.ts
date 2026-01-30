/**
 * Quick Sort SUT
 *
 * Recursive quicksort using the Lomuto partition scheme with
 * the last element as pivot. Partition comparisons and swaps
 * are counted independently.
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

interface Counters {
	comparisons: number;
	swaps: number;
}

function swap(arr: number[], i: number, j: number): void {
	const tmp = arr[i];
	arr[i] = arr[j];
	arr[j] = tmp;
}

function partition(
	arr: number[],
	lo: number,
	hi: number,
	counters: Counters,
): number {
	const pivot = arr[hi];
	let i = lo;

	for (let j = lo; j < hi; j++) {
		counters.comparisons++;
		if (arr[j] <= pivot) {
			if (i !== j) {
				swap(arr, i, j);
				counters.swaps++;
			}
			i++;
		}
	}

	if (i !== hi) {
		swap(arr, i, hi);
		counters.swaps++;
	}

	return i;
}

function quickSort(
	arr: number[],
	lo: number,
	hi: number,
	counters: Counters,
): void {
	if (lo < hi) {
		const p = partition(arr, lo, hi, counters);
		quickSort(arr, lo, p - 1, counters);
		quickSort(arr, p + 1, hi, counters);
	}
}

export function createSut(): {
	id: string;
	config: Record<string, unknown>;
	run: (input: SortInput) => Promise<SortResult>;
} {
	return {
		id: "quick-sort",
		config: {},
		run: async (input: SortInput): Promise<SortResult> => {
			const arr = [...input.data];
			const counters: Counters = { comparisons: 0, swaps: 0 };

			const start = performance.now();
			if (arr.length > 1) {
				quickSort(arr, 0, arr.length - 1, counters);
			}
			const executionTimeMs = performance.now() - start;

			return {
				sorted: arr,
				comparisons: counters.comparisons,
				swaps: counters.swaps,
				executionTimeMs,
			};
		},
	};
}
