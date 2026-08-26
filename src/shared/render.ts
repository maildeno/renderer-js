// src/shared/render.ts
// ─────────────────────────────────────────────────────────────────────────────
// The public render API — as a factory.
//
// This file has no `node:*` imports and no platform-specific Wasm loading of
// its own. It is the one place where loading, validation, engine invocation
// and minification are sequenced, and both `../index.ts` (Node) and
// `../index.edge.ts` (browser/edge) build their exports by calling
// `createRenderApi` with their own platform's `runEngine` / `resolveTemplate`
// / `defaultBaseDir` — plain dependency injection, rather than this file
// reaching for a `node:fs`-based implementation directly and being unusable
// anywhere that doesn't have one.
// ─────────────────────────────────────────────────────────────────────────────

import { minifyOutput } from "./minify.js";
import type {
  Context,
  MergeTags,
  RenderOptions,
  RenderResult,
  Target,
  Template,
  TemplateSource,
} from "../types.js";

/** What a platform entry point (`index.ts`, `index.edge.ts`) must supply. */
export interface RenderApiDeps {
  /** Runs the Wasm engine. Node reads engine.wasm from disk; edge decodes an embedded copy. */
  runEngine: (
    template: Template,
    target: Target,
    mergeTags: MergeTags | undefined,
    context: Context | undefined,
  ) => Promise<string>;
  /** Loads/validates a `TemplateSource`. Node reads a path from disk; edge only accepts objects. */
  resolveTemplate: (source: TemplateSource, baseDir: string) => Promise<Template>;
  /** Default for `options.baseDir` when the caller doesn't supply one. */
  defaultBaseDir: () => string;
}

/** The bound render API a platform entry point re-exports. */
export interface RenderApi {
  render: (source: TemplateSource, options?: RenderOptions) => Promise<string>;
  renderHtml: (source: TemplateSource, options?: Omit<RenderOptions, "target">) => Promise<string>;
  renderMjml: (source: TemplateSource, options?: Omit<RenderOptions, "target">) => Promise<string>;
  renderReactEmail: (source: TemplateSource, options?: Omit<RenderOptions, "target">) => Promise<string>;
  renderToResult: (source: TemplateSource, options?: RenderOptions) => Promise<RenderResult>;
}

/**
 * Builds the `render` / `renderHtml` / `renderMjml` / `renderReactEmail` /
 * `renderToResult` functions for one platform.
 */
export function createRenderApi(deps: RenderApiDeps): RenderApi {
  /**
   * Renders a template and returns everything the engine knew about it.
   *
   * `render` and the target-specific helpers all funnel through here, so there
   * is exactly one place where loading, validation, engine invocation and
   * minification are sequenced.
   */
  async function renderToResult(
    source: TemplateSource,
    options: RenderOptions = {},
  ): Promise<RenderResult> {
    const {
      target = "html",
      mergeTags,
      context,
      minify = true,
      baseDir = deps.defaultBaseDir(),
    } = options;

    const template = await deps.resolveTemplate(source, baseDir);
    const raw = await deps.runEngine(template, target, mergeTags, context);

    return {
      output: minify ? minifyOutput(target, raw) : raw,
      templateId: template.template_id,
      templateName: template.template_name,
      target,
    };
  }

  /**
   * Renders a template. Returns the output string.
   *
   * ```ts
   * const html = await render("templates/welcome.json", {
   *   mergeTags: { text: { first_name: "Noruwa" } },
   *   context: { plan: "premium" },
   * });
   * ```
   *
   * Defaults to HTML, because that is what almost every caller wants and making
   * them spell it out every time would be noise.
   *
   * Returns the string rather than a result object so it composes directly —
   * into a template literal, or straight into an ESP call — with nothing to
   * unwrap first. Use {@link renderToResult} when you want the metadata too.
   *
   * @param source A path to a `.json` template, or an already-parsed template.
   *   The edge/browser build only accepts an already-parsed template — see
   *   `RenderErrorCode.TEMPLATE_NOT_FOUND`.
   * @throws {RenderError} `TEMPLATE_NOT_FOUND`, `INVALID_TEMPLATE`, or
   *   `RENDER_ERROR`.
   */
  async function render(
    source: TemplateSource,
    options: RenderOptions = {},
  ): Promise<string> {
    return (await renderToResult(source, options)).output;
  }

  /**
   * Builds a render function pinned to one target.
   *
   * `target` is omitted from the options of the returned function, so the type
   * system rejects `renderHtml(path, { target: "mjml" })` rather than silently
   * ignoring it.
   */
  function forTarget(target: Target) {
    return async (
      source: TemplateSource,
      options: Omit<RenderOptions, "target"> = {},
    ): Promise<string> => render(source, { ...options, target });
  }

  return {
    render,
    renderToResult,
    /** Renders to production-ready HTML email. Same as `render`. */
    renderHtml: forTarget("html"),
    /** Renders to MJML source. */
    renderMjml: forTarget("mjml"),
    /** Renders to React Email `.tsx` source. */
    renderReactEmail: forTarget("react-email"),
  };
}
