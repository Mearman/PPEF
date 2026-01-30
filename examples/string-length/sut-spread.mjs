/**
 * Spread Length SUT
 *
 * Measures string length using the spread operator ([...text].length).
 * This counts Unicode code points rather than UTF-16 code units,
 * producing different results for emoji and surrogate pairs.
 */
export function createSut() {
	return {
		id: "spread-length",
		config: {},
		run: async (input) => ({ length: [...input.text].length }),
	};
}
