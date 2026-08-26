// src/edge/load.ts
// ─────────────────────────────────────────────────────────────────────────────
// Edge/browser runtime: there is no disk, so there is no path to resolve or
// file to read. The single-file convenience `render("welcome.json")` gives
// you in Node depends on `node:fs`, and this build cannot fall back to a
// half-working substitute (silently trying `fetch()` on a bare string would
// reintroduce a network dependency this package is explicit about not having,
// and would be a surprising thing for a "path" argument to do).
//
// So a string `source` fails clearly and immediately, telling the caller what
// to do instead: read the template themselves — however that works in their
// runtime — and pass the parsed object in. In-memory templates are otherwise
// treated identically to the Node build, including full validation.
// ─────────────────────────────────────────────────────────────────────────────

import { RenderError } from "../error.js";
import { assertTemplate } from "../shared/validate.js";
import type { Template, TemplateSource } from "../types.js";

/**
 * Normalises either accepted input into a validated `Template`.
 *
 * @throws {RenderError} `TEMPLATE_NOT_FOUND` if `source` is a string — this
 *   build has no file system to read it from.
 */
export async function resolveTemplate(
  source: TemplateSource,
  _baseDir: string,
): Promise<Template> {
  if (typeof source === "string") {
    throw new RenderError(
      "TEMPLATE_NOT_FOUND",
      `Cannot load a template from a path ("${source}") in this runtime: ` +
        `there is no file system here (this is the browser/edge build of ` +
        `@maildeno/renderer). Read the template yourself — e.g. \`fetch()\`, ` +
        `a KV/R2/Durable Object binding, or a bundler JSON import — and pass ` +
        `the parsed object to render() instead of a path.`,
    );
  }
  assertTemplate(source, "input");
  return source;
}

/**
 * `baseDir` default for the edge entry.
 *
 * Never actually consulted: `resolveTemplate` only reads `baseDir` when
 * `source` is a string, and a string source always throws before it gets
 * there. It exists purely so this loader satisfies the same shape as the
 * Node one — `render.ts` calls both identically.
 */
export function defaultBaseDir(): string {
  return "/";
}
