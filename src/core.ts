// src/core.ts
// ─────────────────────────────────────────────────────────────────────────────
// Advanced entry point: `@maildeno/renderer/core`.
//
// The default edge/browser build (index.edge.ts) embeds engine.wasm as base64
// so it works with zero bundler configuration — at the cost of ~350 KB versus
// the 260 KB raw file. Most deployments won't notice; if you're somewhere
// that does (a tight Worker bundle budget, for instance) and your bundler can
// hand you a compiled Wasm module more directly — Wrangler's native
// `import mod from "@maildeno/renderer/engine.wasm"`, for example, which
// Cloudflare's docs describe as a supported way to import Wasm as a separate
// uploaded module rather than inlining it — instantiate it yourself and pass
// the instance here instead:
//
// ```ts
// import mod from "@maildeno/renderer/engine.wasm";
// import { renderWithInstance } from "@maildeno/renderer/core";
//
// const instance = await WebAssembly.instantiate(mod, {});
// const html = await renderWithInstance(instance, template);
// ```
//
// This has not been exercised against an actual Wrangler build in producing
// this package — Wrangler's own documentation is the source for the import
// shape above, worth a smoke test in your own deployment before relying on it.
//
// Validation, merge tags, context and minification all behave exactly like
// `render()` — this only changes where the instance comes from. There is no
// `baseDir`: like the default edge build, this entry has no file system to
// read a path from, so `source` must be an already-parsed template.
//
// See ./ARCHITECTURE.md for how src/ is laid out and why.
// ─────────────────────────────────────────────────────────────────────────────

import { createRenderApi } from "./shared/render.js";
import { invokeEngine } from "./shared/engine-core.js";
import { resolveTemplate, defaultBaseDir } from "./edge/load.js";
import type { RenderOptions, TemplateSource } from "./types.js";

/**
 * Renders using a `WebAssembly.Instance` you provide, instead of this
 * package's built-in loader.
 *
 * @param instance An instance of this package's `engine.wasm`, already
 *   instantiated with an empty imports object (the engine takes none).
 * @param source An already-parsed template. Not a path — see module docs.
 * @throws {RenderError} `TEMPLATE_NOT_FOUND`, `INVALID_TEMPLATE`, or
 *   `RENDER_ERROR`.
 */
export async function renderWithInstance(
  instance: WebAssembly.Instance,
  source: TemplateSource,
  options: Omit<RenderOptions, "baseDir"> = {},
): Promise<string> {
  const api = createRenderApi({
    runEngine: (template, target, mergeTags, context) =>
      invokeEngine(instance, template, target, mergeTags, context),
    resolveTemplate,
    defaultBaseDir,
  });
  return api.render(source, options);
}

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
