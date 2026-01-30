/**
 * Unicode Test Case
 *
 * Provides a string with emoji characters that differ
 * in .length vs [...str].length due to surrogate pairs.
 */
export function createCase() {
	return {
		case: {
			caseId: "unicode-emoji",
			caseClass: "unicode",
			name: "Unicode Emoji",
			version: "1.0.0",
			inputs: { text: "hello 🌍🎉" },
		},
		getInput: async () => ({ text: "hello 🌍🎉" }),
		getInputs: () => ({ text: "hello 🌍🎉" }),
	};
}
