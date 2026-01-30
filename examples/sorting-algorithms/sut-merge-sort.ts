/**
 * Merge Sort SUT
 *
 * Recursive divide-and-merge sort. Each comparison during merge is counted.
 * A swap is counted each time a right-side element is placed before a
 * left-side element during the merge step.
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

function merge(
	left: number[],
	right: number[],
	counters: Counters,
): number[] {
	const result: number[] = [];
	let i = 0;
	let j = 0;

	while (i < left.length && j < right.length) {
		counters.comparisons++;
		if (left[i] <= right[j]) {
			result.push(left[i]);
			i++;
		} else {
			result.push(right[j]);
			counters.swaps++;
			j++;
		}
	}

	while (i < left.length) {
		result.push(left[i]);
		i++;
	}

	while (j < right.length) {
		result.push(right[j]);
		j++;
	}

	return result;
}

function mergeSort(arr: number[], counters: Counters): number[] {
	if (arr.length <= 1) {
		return arr;
	}

	const mid = Math.floor(arr.length / 2);
	const left = mergeSort(arr.slice(0, mid), counters);
	const right = mergeSort(arr.slice(mid), counters);

	return merge(left, right, counters);
}

export function createSut(): {
	id: string;
	config: Record<string, unknown>;
	run: (input: SortInput) => Promise<SortResult>;
} {
	return {
		id: "merge-sort",
		config: {},
		run: async (input: SortInput): Promise<SortResult> => {
			const arr = [...input.data];
			const counters: Counters = { comparisons: 0, swaps: 0 };

			const start = performance.now();
			const sorted = mergeSort(arr, counters);
			const executionTimeMs = performance.now() - start;

			return {
				sorted,
				comparisons: counters.comparisons,
				swaps: counters.swaps,
				executionTimeMs,
			};
		},
	};
}
