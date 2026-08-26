// src/index.ts
// ─────────────────────────────────────────────────────────────────────────────
// Public surface of @maildeno/renderer — the Node entry point.
//
// This is what `import { render } from "@maildeno/renderer"` resolves to
// under Node (see the "node" condition in package.json's `exports`). It reads
// engine.wasm and template files from disk. Everywhere else — browsers,
// Cloudflare Workers, Vercel Edge, and any other runtime without a
// filesystem — resolves to `index.edge.ts` instead, which has the same
// exports but no `node:*` imports.
//
// Template loading and validation are intentionally NOT exported. Every render
// path already runs them, and keeping them internal means there is no way to
// reach the engine with an unvalidated document.
//
// See ./ARCHITECTURE.md for how src/ is laid out and why.
// ─────────────────────────────────────────────────────────────────────────────

import { createRenderApi } from "./shared/render.js";
import { runEngine } from "./node/engine.js";
import { resolveTemplate, defaultBaseDir } from "./node/load.js";

const api = createRenderApi({ runEngine, resolveTemplate, defaultBaseDir });

export const render = api.render;
export const renderHtml = api.renderHtml;
export const renderMjml = api.renderMjml;
export const renderReactEmail = api.renderReactEmail;
export const renderToResult = api.renderToResult;

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
