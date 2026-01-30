export function extract(result: {
	comparisons?: number;
	found?: boolean;
	executionTimeMs?: number;
}): Record<string, number> {
	return {
		comparisons: result.comparisons ?? 0,
		found: result.found ? 1 : 0,
		executionTimeMs: result.executionTimeMs ?? 0,
	};
}
