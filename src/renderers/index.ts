/**
 * Renderers - Export module
 *
 * Pure transformation layer for converting aggregated results
 * into human-readable output formats.
 */

export type {
	ColumnSpec,
	RenderOutput,
	Renderer,
	TableRenderSpec,
	ClaimStatusDisplay,
} from "./types.js";

export { LATEX_CLAIM_STATUS, UNICODE_CLAIM_STATUS } from "./types.js";

export {
	LaTeXRenderer,
	createLatexRenderer,
	escapeLatex,
	type LaTeXRendererOptions,
} from "./latex-renderer.js";
