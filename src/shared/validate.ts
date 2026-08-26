// src/shared/validate.ts
// ─────────────────────────────────────────────────────────────────────────────
// Internal: shape-validating a parsed template.
//
// Deliberately has no imports beyond `../error.js` — no `node:fs`, no
// `node:path`. Both the Node loader (`../node/load.ts`) and the edge/browser
// loader (`../edge/load.ts`) validate an already-parsed document the same
// way; only how they *get* that document (disk read vs. "you must supply it")
// differs.
// ─────────────────────────────────────────────────────────────────────────────

import { RenderError } from "../error.js";
import type { Template } from "../types.js";

/**
 * Schema major this renderer understands.
 *
 * Only the major is compared. A minor bump means additive, backward-compatible
 * changes — rejecting those would break templates that render perfectly well.
 */
export const SUPPORTED_SCHEMA_MAJOR = 1;

/**
 * Validates the shape of a parsed template.
 *
 * A local file is untrusted input in a way an API response was not — nothing
 * upstream has already checked it. Failing here, naming the offending field,
 * beats letting a malformed document reach the engine and surface as an opaque
 * error from compiled Rust.
 */
export function assertTemplate(
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
