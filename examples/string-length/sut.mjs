/**
 * String Length SUT
 *
 * Measures string length using the built-in .length property.
 */
export function createSut() {
	return {
		id: "builtin-length",
		config: {},
		run: async (input) => ({ length: input.text.length }),
	};
}
