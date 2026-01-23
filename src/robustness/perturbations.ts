/**
 * Perturbation Implementations
 *
 * Concrete perturbations for robustness analysis.
 * Each perturbation modifies evaluation cases in controlled ways.
 */

import { createHash } from "node:crypto";

import type { ArtefactReference, EvaluationCase } from "../types/case.js";
import type { Perturbation, PerturbationConfig } from "../types/perturbation.js";

/**
 * Edge removal perturbation.
 * Randomly removes a fraction of edges from the graph.
 */
export const edgeRemovalPerturbation: Perturbation = {
	id: "edge-removal",
	name: "Edge Removal",
	description: "Randomly remove a fraction of edges",
	type: "structural",
	intensity: 0.1, // Default: remove 10% of edges

	apply(evaluationCase: EvaluationCase, seed = 42): EvaluationCase {
		const intensity = this.intensity ?? 0.1;
		// Note: rng would be used when actually perturbing the graph at load time
		// const rng = new SeededRandom(seed);

		// Create perturbed case ID
		const perturbedId = createHash("sha256")
			.update(`${evaluationCase.caseId}-edge-removal-${intensity}-${seed}`)
			.digest("hex")
			.slice(0, 16);

		// Mark artefacts as perturbed (actual perturbation happens at load time)
		const perturbedArtefacts: ArtefactReference[] = (evaluationCase.inputs.artefacts ?? []).map(
			(a) => ({
				...a,
				metadata: {
					...a.metadata,
					perturbation: "edge-removal",
					perturbationIntensity: intensity,
					perturbationSeed: seed,
				},
			}),
		);

		return {
			...evaluationCase,
			caseId: perturbedId,
			name: `${evaluationCase.name ?? "Case"} (${Math.round(intensity * 100)}% edges removed)`,
			inputs: {
				...evaluationCase.inputs,
				summary: {
					...evaluationCase.inputs.summary,
					perturbation: "edge-removal",
					perturbationIntensity: intensity,
					perturbationSeed: seed,
				},
				artefacts: perturbedArtefacts,
			},
			tags: [...(evaluationCase.tags ?? []), "perturbed", "edge-removal"],
		};
	},
};

/**
 * Seed shift perturbation.
 * Shifts seed nodes to their neighbors.
 */
export const seedShiftPerturbation: Perturbation = {
	id: "seed-shift",
	name: "Seed Shift",
	description: "Shift seed nodes to random neighbors",
	type: "seed",
	intensity: 1, // Default: shift all seeds

	apply: (evaluationCase: EvaluationCase, seed = 42): EvaluationCase => {
		const perturbedId = createHash("sha256")
			.update(`${evaluationCase.caseId}-seed-shift-${seed}`)
			.digest("hex")
			.slice(0, 16);

		return {
			...evaluationCase,
			caseId: perturbedId,
			name: `${evaluationCase.name ?? "Case"} (seeds shifted)`,
			inputs: {
				...evaluationCase.inputs,
				summary: {
					...evaluationCase.inputs.summary,
					perturbation: "seed-shift",
					perturbationSeed: seed,
				},
			},
			tags: [...(evaluationCase.tags ?? []), "perturbed", "seed-shift"],
		};
	},
};

/**
 * Node removal perturbation.
 * Randomly removes non-seed nodes from the graph.
 */
export const nodeRemovalPerturbation: Perturbation = {
	id: "node-removal",
	name: "Node Removal",
	description: "Randomly remove non-seed nodes",
	type: "structural",
	intensity: 0.05, // Default: remove 5% of nodes

	apply(evaluationCase: EvaluationCase, seed = 42): EvaluationCase {
		const intensity = this.intensity ?? 0.05;

		const perturbedId = createHash("sha256")
			.update(`${evaluationCase.caseId}-node-removal-${intensity}-${seed}`)
			.digest("hex")
			.slice(0, 16);

		return {
			...evaluationCase,
			caseId: perturbedId,
			name: `${evaluationCase.name ?? "Case"} (${Math.round(intensity * 100)}% nodes removed)`,
			inputs: {
				...evaluationCase.inputs,
				summary: {
					...evaluationCase.inputs.summary,
					perturbation: "node-removal",
					perturbationIntensity: intensity,
					perturbationSeed: seed,
				},
			},
			tags: [...(evaluationCase.tags ?? []), "perturbed", "node-removal"],
		};
	},
};

/**
 * Weight noise perturbation.
 * Adds Gaussian noise to edge weights.
 */
export const weightNoisePerturbation: Perturbation = {
	id: "weight-noise",
	name: "Weight Noise",
	description: "Add Gaussian noise to edge weights",
	type: "noise",
	intensity: 0.1, // Default: 10% noise (std dev as fraction of weight)

	apply(evaluationCase: EvaluationCase, seed = 42): EvaluationCase {
		const intensity = this.intensity ?? 0.1;

		const perturbedId = createHash("sha256")
			.update(`${evaluationCase.caseId}-weight-noise-${intensity}-${seed}`)
			.digest("hex")
			.slice(0, 16);

		return {
			...evaluationCase,
			caseId: perturbedId,
			name: `${evaluationCase.name ?? "Case"} (${Math.round(intensity * 100)}% weight noise)`,
			inputs: {
				...evaluationCase.inputs,
				summary: {
					...evaluationCase.inputs.summary,
					perturbation: "weight-noise",
					perturbationIntensity: intensity,
					perturbationSeed: seed,
				},
			},
			tags: [...(evaluationCase.tags ?? []), "perturbed", "weight-noise"],
		};
	},
};

/**
 * All built-in perturbations.
 */
export const PERTURBATIONS: Perturbation[] = [
	edgeRemovalPerturbation,
	seedShiftPerturbation,
	nodeRemovalPerturbation,
	weightNoisePerturbation,
];

/**
 * Get a perturbation by ID.
 *
 * @param id - Perturbation identifier
 * @returns Perturbation or undefined
 */
export const getPerturbation = (id: string): Perturbation | undefined =>
	PERTURBATIONS.find((p) => p.id === id);

/**
 * Create a perturbation with custom intensity.
 *
 * @param config - Perturbation configuration
 * @returns Perturbation with configured intensity
 */
export const createPerturbation = (config: PerturbationConfig): Perturbation => {
	const basePerturbation = getPerturbation(config.type);
	if (!basePerturbation) {
		throw new Error(`Unknown perturbation type: ${config.type}`);
	}

	return {
		...basePerturbation,
		intensity: config.intensity,
	};
};
