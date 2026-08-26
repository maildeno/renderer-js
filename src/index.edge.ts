// src/index.edge.ts
// ─────────────────────────────────────────────────────────────────────────────
// Public surface of @maildeno/renderer — the browser/edge entry point.
//
// This is what `import { render } from "@maildeno/renderer"` resolves to
// anywhere without a filesystem: browsers, Cloudflare Workers (the "workerd"
// condition), Vercel Edge Middleware/Functions ("edge-light"), and any other
// runtime matching the "browser" condition. Node resolves to `index.ts`
// instead, which is a byte-for-byte identical API wired to Node's `fs`.
//
// engine.wasm is embedded in this build as a base64 string (see
// edge/engine.ts and tsup.config.ts) rather than read from disk, so this
// still makes no network calls and needs no bundler configuration beyond
// what every one of these runtimes already supports out of the box.
//
// The one behavioural difference from the Node build: `render()` only accepts
// an already-parsed template object here, not a file path — there's no disk
// to read a path from. Passing a string throws `RenderError` with code
// `TEMPLATE_NOT_FOUND` and a message explaining what to do instead. Every
// other option and error code behaves identically to the Node build.
//
// Template loading and validation are intentionally NOT exported — same
// reasoning as index.ts.
//
// See ./ARCHITECTURE.md for how src/ is laid out and why.
// ─────────────────────────────────────────────────────────────────────────────

import { createRenderApi } from "./shared/render.js";
import { runEngine } from "./edge/engine.js";
import { resolveTemplate, defaultBaseDir } from "./edge/load.js";

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
