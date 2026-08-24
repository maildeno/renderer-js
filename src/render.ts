// src/render.ts
// ─────────────────────────────────────────────────────────────────────────────
// The public render API.
// ─────────────────────────────────────────────────────────────────────────────

import { runEngine } from "./engine.js";
import { resolveTemplate } from "./load.js";
import { minifyOutput } from "./minify.js";
import type {
  RenderOptions,
  RenderResult,
  Target,
  TemplateSource,
} from "./types.js";

/**
 * Renders a template and returns everything the engine knew about it.
 *
 * `render` and the target-specific helpers all funnel through here, so there
 * is exactly one place where loading, validation, engine invocation and
 * minification are sequenced.
 */
export async function renderToResult(
  source: TemplateSource,
  options: RenderOptions = {},
): Promise<RenderResult> {
  const {
    target = "html",
    mergeTags,
    context,
    minify = true,
    baseDir = process.cwd(),
  } = options;

  const template = await resolveTemplate(source, baseDir);
  const raw = await runEngine(template, target, mergeTags, context);

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
 * @throws {RenderError} `TEMPLATE_NOT_FOUND`, `INVALID_TEMPLATE`, or
 *   `RENDER_ERROR`.
 */
export async function render(
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

/** Renders to production-ready HTML email. Same as `render`. */
export const renderHtml = forTarget("html");

/** Renders to MJML source. */
export const renderMjml = forTarget("mjml");

/** Renders to React Email `.tsx` source. */
export const renderReactEmail = forTarget("react-email");
