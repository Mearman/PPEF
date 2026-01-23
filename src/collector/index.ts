/**
 * Collector Module
 *
 * Re-exports collector components.
 */

export {
	type AggregationOptions,
	ResultCollector,
	resultCollector,
	type ResultFilter,
	type ValidationError,
} from "./result-collector.js";
export {
	deepFreeze,
	type SchemaValidation,
	validateCase,
	validateResult,
	validateSutRegistration,
} from "./schema.js";
