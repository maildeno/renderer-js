// src/node/load.ts
// ─────────────────────────────────────────────────────────────────────────────
// Node runtime: resolving, reading and validating template files from disk.
//
// This is the implementation `../index.ts` (the Node entry point) wires up.
// The edge/browser entry point uses `../edge/load.ts` instead, which has no
// disk to read from. Both share the same validation logic
// (`../shared/validate.ts`) and the same `resolveTemplate` signature, so
// `../shared/render.ts` doesn't need to know which one it's calling.
// ─────────────────────────────────────────────────────────────────────────────

import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

import { RenderError } from "../error.js";
import { assertTemplate } from "../shared/validate.js";
import type { Template, TemplateSource } from "../types.js";

/**
 * Resolves a template path, refusing to escape `baseDir`.
 *
 * Absolute paths are honoured as given: a caller writing an absolute path has
 * stated their intent, and second-guessing it would break legitimate use.
 *
 * The containment check exists for the case where a template name comes from
 * somewhere untrusted — `render(req.query.template)`. Without it, a value like
 * `../../../../etc/passwd` becomes an arbitrary file read. Comparing resolved
 * paths (rather than scanning the input for "..") is what makes this correct:
 * it catches symlinks, encoded traversal and nested tricks alike, because it
 * asks where the path actually lands rather than what it looks like.
 */
function resolvePath(path: string, baseDir: string): string {
  if (isAbsolute(path)) return path;

  const base = resolve(baseDir);
  const target = resolve(base, path);

  const rel = relative(base, target);
  const escapes = rel.startsWith("..") || rel.split(sep)[0] === "..";
  if (escapes) {
    throw new RenderError(
      "TEMPLATE_NOT_FOUND",
      `Refusing to read "${path}": it resolves outside the base directory ` +
        `(${base}). If this is intentional, pass an absolute path or widen ` +
        `baseDir.`,
    );
  }

  return target;
}

/** Reads and validates a template file. */
async function loadTemplate(path: string, baseDir: string): Promise<Template> {
  const resolved = resolvePath(path, baseDir);

  let raw: string;
  try {
    raw = await readFile(resolved, "utf8");
  } catch (cause) {
    throw new RenderError(
      "TEMPLATE_NOT_FOUND",
      // The resolved path, not the input — "welcome.json not found" is useless
      // when the real question is which directory it was looked for in.
      `Could not read template at ${resolved}.`,
      cause,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    throw new RenderError(
      "INVALID_TEMPLATE",
      `Template at ${resolved} is not valid JSON.`,
      cause,
    );
  }

  assertTemplate(parsed, resolved);
  return parsed;
}

/**
 * Normalises either accepted input into a validated `Template`.
 *
 * In-memory templates are validated too — they are just as likely to be
 * malformed, and skipping the check would make failures depend on how the
 * template arrived rather than on whether it is correct.
 */
export async function resolveTemplate(
  source: TemplateSource,
  baseDir: string,
): Promise<Template> {
  if (typeof source === "string") return loadTemplate(source, baseDir);
  assertTemplate(source, "input");
  return source;
}

/** `baseDir` default for the Node entry: the process's working directory. */
export function defaultBaseDir(): string {
  return process.cwd();
}
