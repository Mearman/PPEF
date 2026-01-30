/**
 * Type Utilities for CLI Module
 *
 * Provides type coercion helpers for bridging concrete implementations
 * to dependency injection interfaces, where the concrete types are
 * structurally compatible at runtime but have narrower TypeScript types
 * (e.g., literal unions vs string).
 */

/**
 * Coerce a value to a target type.
 *
 * This is used at module boundaries where concrete implementations
 * need to be passed as dependency-injection interfaces. The concrete
 * types are structurally compatible at runtime but TypeScript's strict
 * type checking prevents direct assignment.
 *
 * @param value - The value to coerce
 * @returns The value typed as T
 */
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- T is intentionally used only in return type for type coercion
export function coerce<T>(value: unknown): T {
	// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
	return value as T;
}

/**
 * Convert a string encoding name to BufferEncoding.
 *
 * Node.js fs functions expect BufferEncoding but the IFileSystem interface
 * uses plain string. This bridges the two without a type assertion.
 *
 * @param encoding - Encoding name (e.g., "utf-8")
 * @returns The same string typed as BufferEncoding
 */
export function toBufferEncoding(encoding: string): BufferEncoding {
	// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
	return encoding as BufferEncoding;
}
