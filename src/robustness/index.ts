/**
 * Robustness Module
 *
 * Robustness types and perturbation definitions.
 *
 * The robustness evaluator has been moved to src/evaluators/robustness-evaluator.ts.
 * Please import from the evaluators module for the new class-based API.
 */

export type {
	RobustnessAnalysisOutput,
	RobustnessAnalysisResult,
	RobustnessMetrics,
	Perturbation,
	PerturbationType,
	PerturbationConfig,
} from "../types/perturbation.js";

export {
	createPerturbation,
	edgeRemovalPerturbation,
	getPerturbation,
	nodeRemovalPerturbation,
	PERTURBATIONS,
	seedShiftPerturbation,
	weightNoisePerturbation,
} from "./perturbations.js";
