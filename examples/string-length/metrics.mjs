/**
 * String Length Metrics Extractor
 *
 * Extracts the length metric from the SUT result.
 */
export function extract(result) {
	return { length: result.length ?? 0 };
}
