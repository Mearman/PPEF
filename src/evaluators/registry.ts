/**
 * Evaluator Registry
 *
 * Central registry for all evaluator types. Enables the plugin
 * architecture by allowing custom evaluators to be registered
 * alongside built-in evaluators.
 */

import type { IEvaluator, Evaluator, EvaluationType, EvaluatorConfig } from "../types/evaluator.js";

/** Private storage for evaluators */
const evaluators = new Map<EvaluationType, IEvaluator>();

/**
 * Registry of all available evaluators.
 *
 * Evaluators are stored by their type identifier. The registry
 * provides methods to register new evaluators, retrieve evaluators
 * by type, and list all registered types.
 */
export const EvaluatorRegistry = {
	/**
	 * Register an evaluator.
	 *
	 * If an evaluator with the same type already exists, it will
	 * be replaced with the new evaluator.
	 *
	 * @param evaluator - Evaluator to register
	 */
	register<TConfig extends EvaluatorConfig, TInput, TOutput>(
		evaluator: Evaluator<TConfig, TInput, TOutput>,
	): void {
		const existing = evaluators.get(evaluator.type);
		if (existing) {
			console.warn(`Replacing existing evaluator for type: ${evaluator.type}`);
		}
		evaluators.set(evaluator.type, evaluator);
	},

	/**
	 * Get an evaluator by type (returns base IEvaluator).
	 *
	 * For type-safe retrieval, use the getAs() method instead.
	 *
	 * @param type - Evaluation type identifier
	 * @returns Evaluator instance or undefined if not found
	 */
	get(type: EvaluationType): IEvaluator | undefined {
		return evaluators.get(type);
	},

	/**
	 * Get an evaluator by type with runtime type checking.
	 *
	 * Uses instanceof to verify the evaluator is of the expected class.
	 * Returns undefined if the evaluator doesn't exist or isn't of the expected type.
	 *
	 * @param type - Evaluation type identifier
	 * @param clazz - Constructor of the expected evaluator class
	 * @returns Typed evaluator instance or undefined
	 *
	 * @example
	 * ```ts
	 * const claimsEvaluator = EvaluatorRegistry.getAs("claims", ClaimsEvaluator);
	 * if (claimsEvaluator) {
	 *   // Full type safety - claimsEvaluator is ClaimsEvaluator
	 *   const validation = claimsEvaluator.validateConfig(config);
	 * }
	 * ```
	 */
	getAs<T extends IEvaluator>(type: EvaluationType, clazz: new () => T): T | undefined {
		const evaluator = evaluators.get(type);
		return evaluator instanceof clazz ? evaluator : undefined;
	},

	/**
	 * Get an evaluator by type, throwing if not found.
	 *
	 * @param type - Evaluation type identifier
	 * @param clazz - Constructor of the expected evaluator class
	 * @returns Evaluator instance
	 * @throws Error if evaluator type not found or wrong type
	 */
	getOrThrow<T extends IEvaluator>(type: EvaluationType, clazz: new () => T): T {
		const evaluator = EvaluatorRegistry.getAs(type, clazz);
		if (!evaluator) {
			throw new Error(`Evaluator not found for type: ${type}`);
		}
		return evaluator;
	},

	/**
	 * List all registered evaluator types.
	 *
	 * @returns Array of registered evaluation type identifiers
	 */
	types(): EvaluationType[] {
		return Array.from(evaluators.keys());
	},

	/**
	 * Check if an evaluator type is registered.
	 *
	 * @param type - Evaluation type identifier
	 * @returns True if evaluator is registered
	 */
	has(type: EvaluationType): boolean {
		return evaluators.has(type);
	},

	/**
	 * Unregister an evaluator by type.
	 *
	 * This is primarily useful for testing.
	 *
	 * @param type - Evaluation type identifier
	 * @returns True if evaluator was unregistered
	 */
	unregister(type: EvaluationType): boolean {
		return evaluators.delete(type);
	},

	/**
	 * Clear all registered evaluators.
	 *
	 * This is primarily useful for testing.
	 */
	clear(): void {
		evaluators.clear();
	},

	/**
	 * Get the number of registered evaluators.
	 *
	 * @returns Count of registered evaluators
	 */
	get size(): number {
		return evaluators.size;
	},
} as const;

// ============================================================================
// Built-in Evaluator Imports and Auto-Registration
// ============================================================================

import { ClaimsEvaluator } from "./claims-evaluator.js";
import { RobustnessEvaluator } from "./robustness-evaluator.js";
import { MetricsEvaluator } from "./metrics-evaluator.js";

/**
 * Auto-register built-in evaluators on module load.
 *
 * This ensures that the standard evaluators (claims, robustness, metrics)
 * are always available without requiring explicit registration.
 */
export function registerBuiltInEvaluators(): void {
	EvaluatorRegistry.register(new ClaimsEvaluator());
	EvaluatorRegistry.register(new RobustnessEvaluator());
	EvaluatorRegistry.register(new MetricsEvaluator());
}

// Register built-in evaluators when this module is loaded
registerBuiltInEvaluators();
