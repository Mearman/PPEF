/**
 * Hello World Test Case
 *
 * Provides a simple string input for length measurement.
 */
export function createCase() {
	return {
		case: {
			caseId: "hello-world",
			caseClass: "basic",
			name: "Hello World",
			version: "1.0.0",
			inputs: { text: "hello world" },
		},
		getInput: async () => ({ text: "hello world" }),
		getInputs: () => ({ text: "hello world" }),
	};
}
