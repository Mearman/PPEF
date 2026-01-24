/**
 * Example Case Module: Karate Club Graph
 *
 * This file demonstrates how to structure a case module for the PPEF CLI.
 *
 * Export a function that returns a case definition with:
 * - case: EvaluationCase metadata (caseId, name, caseClass, inputs, etc.)
 * - getInput: async function that loads the primary resource
 * - getInputs: function that returns algorithm-specific inputs
 */

/**
 * Create a Karate Club graph test case.
 *
 * @returns {Object} Case definition
 */
export function createCase() {
	// Define the case metadata
	const caseDef = {
		case: {
			caseId: "karate-v1",
			name: "Zachary's Karate Club",
			caseClass: "social-network",
			inputs: {
				summary: {
					nodes: 34,
					edges: 78,
					type: "social-network",
				},
			},
			version: "1.0.0",
			tags: ["social", "small"],
		},

		/**
		 * Load the primary resource (graph, dataset, etc.)
		 * This is called once per case and cached.
		 *
		 * @returns {Promise<*>} The loaded resource
		 */
		async getInput() {
			// TODO: Load your actual resource here
			// Examples:
			// - Load a graph from file: return loadGraph("./data/karate.graphml");
			// - Load from API: return fetchGraph("karate");
			// - Generate synthetic data: return generateKarateGraph();

			// Placeholder: return a mock graph object
			return {
				nodes: [],
				edges: [],
				// Your actual graph structure would go here
			};
		},

		/**
		 * Get algorithm-specific inputs for this case.
		 * These are combined with the loaded input resource.
		 *
		 * @returns {Object} Algorithm inputs
		 */
		getInputs() {
			return {
				seeds: ["1", "34"], // Seed node IDs
				maxDepth: 3,
				// Add any other algorithm-specific parameters
			};
		},
	};

	return caseDef;
}
