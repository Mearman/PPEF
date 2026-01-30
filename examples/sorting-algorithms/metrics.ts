export function extract(result: {
	comparisons?: number;
	swaps?: number;
	executionTimeMs?: number;
}): Record<string, number> {
	return {
		comparisons: result.comparisons ?? 0,
		swaps: result.swaps ?? 0,
		executionTimeMs: result.executionTimeMs ?? 0,
	};
}
