/**
 * SUT Registry
 *
 * Central registry for System Under Test definitions. SUTs are registered
 * with their factories and metadata, enabling lazy instantiation during
 * experiment execution.
 */

import type { SUT, SutDefinition, SutFactory, SutRegistration, SutRole } from "../types/sut.js";

/**
 * Registry for System Under Test definitions.
 *
 * @template TInputs - The algorithm inputs type
 * @template TResult - The algorithm result type
 */
export class SUTRegistry<TInputs = unknown, TResult = unknown> {
	private readonly definitions = new Map<string, SutDefinition<TInputs, TResult>>();

	/**
	 * Register a new SUT.
	 *
	 * @param registration - SUT metadata
	 * @param factory - Factory for creating SUT instances
	 * @throws Error if SUT with same ID already registered
	 */
	register(registration: SutRegistration, factory: SutFactory<TInputs, TResult>): this {
		if (this.definitions.has(registration.id)) {
			throw new Error(`SUT already registered: ${registration.id}`);
		}

		this.definitions.set(registration.id, { registration, factory });
		return this;
	}

	/**
	 * Get a SUT definition by ID.
	 *
	 * @param id - SUT identifier
	 * @returns SUT definition or undefined
	 */
	get(id: string): SutDefinition<TInputs, TResult> | undefined {
		return this.definitions.get(id);
	}

	/**
	 * Get a SUT definition by ID, throwing if not found.
	 *
	 * @param id - SUT identifier
	 * @returns SUT definition
	 * @throws Error if SUT not found
	 */
	getOrThrow(id: string): SutDefinition<TInputs, TResult> {
		const definition = this.definitions.get(id);
		if (!definition) {
			throw new Error(`SUT not found: ${id}`);
		}
		return definition;
	}

	/**
	 * Get all SUTs with a specific role.
	 *
	 * @param role - Role to filter by
	 * @returns Array of matching SUT definitions
	 */
	getByRole(role: SutRole): SutDefinition<TInputs, TResult>[] {
		return [...this.definitions.values()].filter((d) => d.registration.role === role);
	}

	/**
	 * Get all SUTs with a specific tag.
	 *
	 * @param tag - Tag to filter by
	 * @returns Array of matching SUT definitions
	 */
	getByTag(tag: string): SutDefinition<TInputs, TResult>[] {
		return [...this.definitions.values()].filter((d) => d.registration.tags.includes(tag));
	}

	/**
	 * List all registered SUT IDs.
	 *
	 * @returns Array of SUT identifiers
	 */
	list(): string[] {
		return [...this.definitions.keys()];
	}

	/**
	 * List all registered SUT registrations.
	 *
	 * @returns Array of SUT registrations
	 */
	listRegistrations(): SutRegistration[] {
		return [...this.definitions.values()].map((d) => d.registration);
	}

	/**
	 * Check if a SUT is registered.
	 *
	 * @param id - SUT identifier
	 * @returns true if registered
	 */
	has(id: string): boolean {
		return this.definitions.has(id);
	}

	/**
	 * Get the number of registered SUTs.
	 */
	get size(): number {
		return this.definitions.size;
	}

	/**
	 * Clear all registrations.
	 */
	clear(): void {
		this.definitions.clear();
	}

	/**
	 * Create a new SUT instance.
	 *
	 * @param id - SUT identifier
	 * @param config - Optional configuration overrides
	 * @returns SUT instance ready for execution
	 */
	create(id: string, config?: Record<string, unknown>): SUT<TInputs, TResult> {
		const definition = this.getOrThrow(id);
		return definition.factory(config);
	}
}

/**
 * Global SUT registry instance.
 *
 * Use this for standard registration, or create instances for isolation.
 */
export const sutRegistry = new SUTRegistry();
