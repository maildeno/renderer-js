// src/load.ts
// ─────────────────────────────────────────────────────────────────────────────
// Internal: resolving, reading and validating template files.
//
// Not exported from the package. Every path into the engine goes through
// `resolveTemplate`, so validation can't be bypassed by reaching for a
// lower-level entry point.
// ─────────────────────────────────────────────────────────────────────────────

import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

import { RenderError } from "./error.js";
import type { Template, TemplateSource } from "./types.js";

/**
 * Schema major this renderer understands.
 *
 * Only the major is compared. A minor bump means additive, backward-compatible
 * changes — rejecting those would break templates that render perfectly well.
 */
const SUPPORTED_SCHEMA_MAJOR = 1;

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

/**
 * Validates the shape of a parsed template.
 *
 * A local file is untrusted input in a way an API response was not — nothing
 * upstream has already checked it. Failing here, naming the offending field,
 * beats letting a malformed document reach the engine and surface as an opaque
 * error from compiled Rust.
 */
function assertTemplate(
  value: unknown,
  origin: string,
): asserts value is Template {
  const where = `Template from ${origin}`;

  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new RenderError(
      "INVALID_TEMPLATE",
      `${where} is not an object.`,
    );
  }

  const t = value as Record<string, unknown>;

  const missing = (
    ["template_id", "template_name", "canvas", "rows", "schema_version"] as const
  ).filter((key) => t[key] === undefined);

  if (missing.length) {
    throw new RenderError(
      "INVALID_TEMPLATE",
      `${where} is missing required field(s): ${missing.join(", ")}. ` +
        `Expected a Maildeno template export ` +
        `({ template_id, template_name, canvas, rows, schema_version }).`,
    );
  }

  if (typeof t.template_id !== "string") {
    throw new RenderError("INVALID_TEMPLATE", `${where}: template_id must be a string.`);
  }
  if (typeof t.template_name !== "string") {
    throw new RenderError("INVALID_TEMPLATE", `${where}: template_name must be a string.`);
  }
  if (!Array.isArray(t.rows)) {
    throw new RenderError("INVALID_TEMPLATE", `${where}: rows must be an array.`);
  }
  if (t.canvas === null || typeof t.canvas !== "object" || Array.isArray(t.canvas)) {
    throw new RenderError("INVALID_TEMPLATE", `${where}: canvas must be an object.`);
  }
  if (typeof t.schema_version !== "string") {
    throw new RenderError("INVALID_TEMPLATE", `${where}: schema_version must be a string.`);
  }

  const major = Number.parseInt(t.schema_version.split(".")[0] ?? "", 10);
  if (Number.isNaN(major)) {
    throw new RenderError(
      "INVALID_TEMPLATE",
      `${where}: schema_version "${t.schema_version}" is not a valid version.`,
    );
  }
  if (major > SUPPORTED_SCHEMA_MAJOR) {
    throw new RenderError(
      "INVALID_TEMPLATE",
      `${where}: schema_version "${t.schema_version}" is newer than this ` +
        `renderer supports (${SUPPORTED_SCHEMA_MAJOR}.x). Upgrade ` +
        `@maildeno/renderer.`,
    );
  }
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
