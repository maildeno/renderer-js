// src/index.ts
// ─────────────────────────────────────────────────────────────────────────────
// Public surface of @maildeno/renderer.
//
// Template loading and validation are intentionally NOT exported. Every render
// path already runs them, and keeping them internal means there is no way to
// reach the engine with an unvalidated document.
// ─────────────────────────────────────────────────────────────────────────────

export {
  render,
  renderHtml,
  renderMjml,
  renderReactEmail,
  renderToResult,
} from "./render.js";

export { RenderError } from "./error.js";
export type { RenderErrorCode } from "./error.js";

export type {
  Target,
  Template,
  TemplateSource,
  MergeTags,
  Context,
  RenderOptions,
  RenderResult,
} from "./types.js";
